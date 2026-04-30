// ─────────────────────────────────────────────────────────────────────────────
// front_back_manager.js
//
// Manages Socket.io connections between frontend clients and the backend.
//
// Responsibilities:
//   - Authenticate each incoming frontend client via their access token
//   - Assign each client to a socket.io room named after their ha_instance_id
//   - Acquire (or reuse) the HA connection for that ha_instance_id
//   - Send the current actualState immediately on connect
//   - Forward live state updates to all clients in the same room
//   - Release the HA connection when the last client in a room disconnects
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from "socket.io";
import {
  acquireHAConnection,
  releaseHAConnection,
  setCredentialsProvider,
  setHAEntity, 
} from "../../back_ha_manager.js";

// ─── How long a client has to authenticate before being disconnected (ms) ────
const AUTH_TIMEOUT_MS = 5000;

// ─── Re-export so the app entry point can inject the credentials provider ────
export { setCredentialsProvider };

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL MAPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map A: socket.id → ha_instance_id
 *
 * Used to look up which HA instance a disconnecting client belongs to,
 * so we can call releaseHAConnection() correctly.
 */
const clientToHAInstance = new Map();

/**
 * HA instance → listener cleanup function
 *
 * Stores the stateEmitter listener for each HA instance so we can
 * remove it cleanly when the last client for that instance disconnects.
 */
const haInstanceListeners = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// SERVER FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates and returns a Socket.io server attached to the given HTTP server.
 */
export function createSocketServer(httpServer) {
  return new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers all Socket.io connection and event handlers.
 *
 * @param {Server}   io             - The Socket.io server instance
 * @param {Function} authenticateClient - async (token) => { authenticated, ha_instance_id }
 */
export function registerSocketHandlers(io, authenticateClient) {
  io.on("connection", (socket) => {
    console.log(`[FE] Client connected: ${socket.id}`);

    // ── Step 1: Start an authentication timeout ───────────────────────────────
    // If the client doesn't send their token within AUTH_TIMEOUT_MS, disconnect.
    const authTimeout = setTimeout(() => {
      console.warn(`[FE] Client ${socket.id} timed out before authenticating.`);
      socket.emit("auth_error", { message: "Authentication timeout." });
      socket.disconnect(true);
    }, AUTH_TIMEOUT_MS);

    // ── Step 2: Wait for the client to send their access token ───────────────
    socket.on("authenticate", async ({ token } = {}) => {
      clearTimeout(authTimeout);

      if (!token) {
        socket.emit("auth_error", { message: "No token provided." });
        socket.disconnect(true);
        return;
      }

      // ── Step 3: Validate the token via the provided auth function ───────────
      let authResult;
      try {
        authResult = await authenticateClient(token);
      } catch (err) {
        console.error(
          `[FE] Auth function threw for client ${socket.id}:`,
          err.message,
        );
        socket.emit("auth_error", { message: "Authentication service error." });
        socket.disconnect(true);
        return;
      }

      const { authorized, ha_instance_id, farm_id } = authResult;

      if (!authorized || !ha_instance_id) {
        console.warn(`[FE] Client ${socket.id} failed authentication.`);
        socket.emit("auth_error", { message: "Invalid token." });
        socket.disconnect(true);
        return;
      }

      console.log(
        `[FE] Client ${socket.id} authenticated → HA instance: ${ha_instance_id}`,
      );

      // ── Step 4: Acquire the HA connection for this ha_instance_id ───────────
      let haEntry;
      try {
        haEntry = await acquireHAConnection(ha_instance_id, farm_id);
      } catch (err) {
        console.error(
          `[FE] Failed to acquire HA connection for ${ha_instance_id}:`,
          err.message,
        );
        socket.emit("ha_error", {
          message: "Could not connect to Home Assistant.",
        });
        socket.disconnect(true);
        return;
      }

      // ── Step 5: Guard — client may have disconnected during the async above ──
      if (!socket.connected) {
        console.warn(
          `[FE] Client ${socket.id} disconnected during HA connection setup. Releasing.`,
        );
        releaseHAConnection(ha_instance_id);
        return;
      }

      // ── Step 6: Register this client ─────────────────────────────────────────
      clientToHAInstance.set(socket.id, ha_instance_id);

      // Join the room named after the ha_instance_id — all clients for the same
      // HA instance share one room, so updates can be emitted to all at once.
      socket.join(ha_instance_id);
      socket.emit("auth_success", { ha_instance_id });
      socket.emit("initial_state", haEntry.actualState);

      // ── Step 8: Register the state emitter listener (once per HA instance) ──
      // We only register one listener per HA instance — it emits to the whole room.
      if (!haInstanceListeners.has(ha_instance_id)) {
        const onStateUpdate = (update) => {
          io.to(ha_instance_id).emit("update_state", update);
          console.log(
            `[FE] Emitted "update_state" to room "${ha_instance_id}"`,
          );
        };

        const onHADisconnected = () => {
          io.to(ha_instance_id).emit("ha_disconnected", {
            message: "Connection to Home Assistant lost. Reconnecting...",
          });
        };

        const onHAFailed = () => {
          io.to(ha_instance_id).emit("ha_error", {
            message: "Connection to Home Assistant permanently failed.",
          });
        };

        haEntry.emitter.on("update_state", onStateUpdate);
        haEntry.emitter.on("ha_disconnected", onHADisconnected);
        haEntry.emitter.on("ha_failed", onHAFailed);

        // Store cleanup function so we can remove the listener later
        haInstanceListeners.set(ha_instance_id, () => {
          haEntry.emitter.off("update_state", onStateUpdate);
          haEntry.emitter.off("ha_disconnected", onHADisconnected);
          haEntry.emitter.off("ha_failed", onHAFailed);
        });
      }

      // ── Step 8.5: Handle entity change requests from the frontend ─────────────────
      socket.on("set_entity", async ({ type, payload } = {}) => {
        try {
          const { domain, service, data } = resolveHACall(type, payload);
          await setHAEntity(ha_instance_id, domain, service, data);
          socket.emit("set_entity_success", { type, payload });
        } catch (err) {
          console.error(
            `[FE] set_entity failed for ${socket.id}:`,
            err.message,
          );
          socket.emit("set_entity_error", {
            type,
            payload,
            message: err.message,
          });
        }
      });

      // ── Step 8.6: Handle change_state requests from the frontend ───────────────
      // The frontend emits: { target: "crop" | "actuators", newState: {...} }
      // We map the newState fields to HA entities and update them.
      socket.on("change_state", async ({ target, newState } = {}) => {
        try {
          if (!target || !newState) {
            throw new Error("Missing target or newState.");
          }

          const calls = resolveChangeStateCall(target, newState);
          for (const { domain, service, data } of calls) {
            await setHAEntity(ha_instance_id, domain, service, data);
          }
          socket.emit("change_state_success", { target, newState });
        } catch (err) {
          console.error(
            `[FE] change_state failed for ${socket.id}:`,
            err.message,
          );
          socket.emit("change_state_error", {
            target,
            newState,
            message: err.message,
          });
        }
      });

      // ── Step 9: Handle disconnect ─────────────────────────────────────────────
      socket.on("disconnect", () => {
        console.log(`[FE] Client ${socket.id} disconnected.`);
        clientToHAInstance.delete(socket.id);

        // Release this client's hold on the HA connection
        releaseHAConnection(ha_instance_id);

        // If nobody is left in this room, clean up the emitter listener too
        const roomSize =
          io.sockets.adapter.rooms.get(ha_instance_id)?.size ?? 0;
        if (roomSize === 0) {
          console.log(
            `[FE] Room "${ha_instance_id}" is now empty. Cleaning up listener.`,
          );
          haInstanceListeners.get(ha_instance_id)?.();
          haInstanceListeners.delete(ha_instance_id);
        }
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY CALL RESOLVER
// Maps frontend requests to the correct HA REST API calls.
// ─────────────────────────────────────────────────────────────────────────────

// Maps crop field names to their HA input_select entity IDs
const CROP_ENTITY_MAP = {
  type        : "input_select.crop_type",
  mode        : "input_select.priority_mode",
  growth_stage: "input_select.growth_stage",
};

/**
 * Resolves a change_state request into one or more HA REST API calls.
 *
 * @param {string} target - "crop" | "actuators"
 * @param {object} newState - the updated state fields
 * @returns {Array<{ domain, service, data }>} array of HA calls
 * @throws {Error} if the target or newState is invalid
 */
function resolveChangeStateCall(target, newState) {
  const calls = [];

  if (target === "crop") {
    // ── Crop: iterate over fields like type, mode, growth_stage ──
    for (const [field, value] of Object.entries(newState)) {
      const entity_id = CROP_ENTITY_MAP[field];
      if (!entity_id) {
        console.warn(`[HA] Unknown crop field: ${field}`);
        continue;
      }
      if (!value) continue; // Skip null/undefined values
      calls.push({
        domain: "input_select",
        service: "select_option",
        data: { entity_id, option: value },
      });
    }
  } else if (target === "actuators") {
    // ── Actuators: newState is expected to be an array of actuators ──
    const actuators = Array.isArray(newState) ? newState : [newState];
    for (const actuator of actuators) {
      const { type: actuatorType } = actuator;
      if (!actuatorType) continue;

      // Handle status (turn_on / turn_off)
      if (actuator.status !== undefined) {
        const value = actuator.status === "on" ? "on" : "off";
        calls.push({
          domain: "input_boolean",
          service: value === "on" ? "turn_on" : "turn_off",
          data: { entity_id: `input_boolean.${actuatorType}_status` },
        });
      }

      // Handle control_mode (auto / semi_auto)
      if (actuator.control_mode !== undefined) {
        const isAutoMode = actuator.control_mode === "auto";
        calls.push({
          domain: "input_boolean",
          service: isAutoMode ? "turn_off" : "turn_on",
          data: { entity_id: `input_boolean.${actuatorType}_control_mode` },
        });
      }
    }
  } else {
    throw new Error(`Unknown change_state target: "${target}"`);
  }

  return calls;
}

/**
 * Resolves a frontend set_entity request into a HA REST API call.
 *
 * @param {string} type    - "actuator_status" | "actuator_control_mode" | "crop"
 * @param {object} payload - the change data from the frontend
 * @returns {{ domain, service, data }}
 * @throws {Error} if the type or payload is invalid
 */
function resolveHACall(type, payload) {
  if (!type || !payload) throw new Error("Missing type or payload.");

  // ── Actuator on/off ──
  if (type === "actuator_status") {
    const { actuatorType, value } = payload;
    if (!actuatorType || !["on", "off"].includes(value))
      throw new Error(`Invalid actuator_status payload: ${JSON.stringify(payload)}`);
    return {
      domain : "input_boolean",
      service: value === "on" ? "turn_on" : "turn_off",
      data   : { entity_id: `input_boolean.${actuatorType}_status` },
    };
  }

  // ── Actuator control mode (auto / semi_auto) ──
  if (type === "actuator_control_mode") {
    const { actuatorType, value } = payload;
    if (!actuatorType || !["auto", "semi_auto"].includes(value))
      throw new Error(`Invalid actuator_control_mode payload: ${JSON.stringify(payload)}`);
    return {
      domain : "input_boolean",
      service: value === "semi_auto" ? "turn_on" : "turn_off",
      data   : { entity_id: `input_boolean.${actuatorType}_control_mode` },
    };
  }

  // ── Crop field (type / mode / growth_stage) ──
  if (type === "crop") {
    const { field, value } = payload;
    const entity_id = CROP_ENTITY_MAP[field];
    if (!entity_id || !value)
      throw new Error(`Invalid crop payload: ${JSON.stringify(payload)}`);
    return {
      domain : "input_select",
      service: "select_option",
      data   : { entity_id, option: value },
    };
  }

  throw new Error(`Unknown set_entity type: "${type}"`);
}
