// ─────────────────────────────────────────────────────────────────────────────
// back_ha_manager.js
//
// Manages WebSocket connections between the backend and Home Assistant instances.
// Each HA instance gets one persistent connection, shared across all frontend
// clients that belong to it.
//
// Exports:
//   - acquireHAConnection(ha_instance_id)  → get or create a HA connection
//   - releaseHAConnection(ha_instance_id)  → decrement ref count, close if zero
// ─────────────────────────────────────────────────────────────────────────────

import WebSocket from "ws";
import EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";
import { saveToDatabase } from "./src/services/historyService.js";

// ─── Injected from outside — resolves { url, token } for a given ha_instance_id
let _getCredentials = null;
export function setCredentialsProvider(fn) {
  _getCredentials = fn;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL MAPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map B: ha_instance_id → HAConnectionEntry
 *
 * Each entry holds:
 *   - socket       : the active WebSocket to HA
 *   - actualState  : the latest full state snapshot
 *   - emitter      : EventEmitter that fires "update_state" on every change
 *   - refCount     : how many frontend clients are currently using this connection
 *   - ready        : whether the initial get_states has completed
 */
const haConnections = new Map();

/**
 * Pending map: ha_instance_id → Promise<HAConnectionEntry>
 *
 * Prevents duplicate HA connections when multiple frontend clients connect
 * to the same ha_instance_id simultaneously before the connection is ready.
 */
const pendingConnections = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY = {
  CROP_TYPE: "input_select.crop_type",
  GROWTH_STAGE: "input_select.growth_stage",
  PRIORITY_MODE: "input_select.priority_mode",

  SENSORS: [
    "input_number.temperature",
    "input_number.air_humidity",
    "input_number.soil_moisture",
    "input_number.light_intensity",
  ],

  SENSOR_DESCRIPTIONS: {
    temperature: "input_text.temperature_description",
    air_humidity: "input_text.humidity_description",
    soil_moisture: "input_text.soil_moisture_description",
    light_intensity: "input_text.light_intensity_description",
  },

  ACTUATORS: ["pump", "fan"],

  WARNINGS: [
    "input_boolean.high_temperature_detected",
    "input_boolean.frost_risk",
    "input_boolean.low_soil_moisture",
    "input_boolean.overwatering",
    "input_boolean.insufficient_sunlight",
    "input_boolean.excessive_sunlight",
    "input_boolean.high_humidity_level",
    "input_boolean.strong_wind",
    "input_boolean.heavy_rainfall",
  ],

  WARNING_EXTRA_INFO: {
    high_temperature_detected:
      "input_text.high_temperature_detected_extra_info",
    frost_risk: "input_text.frost_risk_extra_info",
    low_soil_moisture: "input_text.low_soil_moisture_extra_info",
    overwatering: "input_text.overwatering_extra_info",
    insufficient_sunlight: "input_text.insufficient_sunlight_extra_info",
    excessive_sunlight: "input_text.excessive_sunlight_extra_info",
    high_humidity_level: "input_text.high_humidity_level_extra_info",
    strong_wind: "input_text.strong_wind_extra_info",
    heavy_rainfall: "input_text.heavy_rainfall_extra_info",
  },

  RECOMMENDATION: "input_text.general_recommendation",
  APP_NOTIFICATION: "input_text.app_notification",
  SUGGESTED_ACTIONS: "input_text.suggested_actions",
  WEATHER_INFO: "input_text.weather_info",
  LOCATION_INFO: "input_text.location_info",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getState(states, entityId) {
  return states.find((e) => e.entity_id === entityId)?.state ?? null;
}

function parseObjString(str) {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function calculateDuration(runAt, runUntil) {
  if (!runAt || !runUntil) return null;
  const start = new Date(runAt);
  const end = new Date(runUntil);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return Math.round((end - start) / (1000 * 60));
}

/** Deep-clones actualState before sending to prevent mutation issues */
function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildCrop(states) {
  return {
    type: getState(states, ENTITY.CROP_TYPE),
    mode: getState(states, ENTITY.PRIORITY_MODE),
    growth_stage: getState(states, ENTITY.GROWTH_STAGE),
  };
}

function buildSensors(states) {
  return ENTITY.SENSORS.map((entityId) => {
    const type = entityId.split(".")[1];
    const descEntity = ENTITY.SENSOR_DESCRIPTIONS[type];
    return {
      id: uuidv4(),
      type,
      value: getState(states, entityId),
      description: descEntity ? getState(states, descEntity) : null,
    };
  });
}

function buildActuators(states) {
  return ENTITY.ACTUATORS.map((type) => {
    const run_at = getState(states, `input_datetime.${type}_execute_at`);
    const run_until = getState(states, `input_datetime.${type}_execute_until`);
    return {
      id: uuidv4(),
      type,
      status: getState(states, `input_boolean.${type}_status`),
      control_mode:
        getState(states, `input_boolean.${type}_control_mode`) === "on"
          ? "semi_auto"
          : "auto",
      run_at,
      run_until,
      duration_minutes: calculateDuration(run_at, run_until),
    };
  });
}

function buildWarnings(states) {
  return ENTITY.WARNINGS.map((entityId) => {
    const title = entityId.split(".")[1];
    const extraEntity = ENTITY.WARNING_EXTRA_INFO[title];
    const extra = parseObjString(getState(states, extraEntity));
    return {
      id: uuidv4(),
      title,
      status: getState(states, entityId) === "on" ? "active" : "inactive",
      description: extra.description ?? null,
      severity: extra.severity ?? null,
    };
  });
}

function buildNotifications(states) {
  const notifications = [];

  const appNotif = parseObjString(getState(states, ENTITY.APP_NOTIFICATION));
  if (appNotif.title || appNotif.description) {
    notifications.push({
      id: uuidv4(),
      title: appNotif.title ?? null,
      description: appNotif.description ?? null,
    });
  }

  const suggested = getState(states, ENTITY.SUGGESTED_ACTIONS);
  if (suggested?.trim()) {
    notifications.push({
      id: uuidv4(),
      title: "Suggested Actions",
      description: suggested.trim(),
    });
  }

  return notifications;
}

function buildWeather(states) {
  const parsed = parseObjString(getState(states, ENTITY.WEATHER_INFO));
  return { state: parsed.state ?? null, summary: parsed.summary ?? null };
}

function buildLocation(states) {
  const parsed = parseObjString(getState(states, ENTITY.LOCATION_INFO));
  return {
    timezone: parsed.timezone ?? null,
    longitude: parsed.longitude ?? null,
    latitude: parsed.latitude ?? null,
  };
}

function emitUpdateState(emitter, target, newState) {
  console.log(`Emitting state update for ${target}:`, newState);
  emitter.emit("update_state", { target, newState });
}

function buildInitialState(rawStates) {
  const legalPrefixes = [
    "input_datetime",
    "input_select",
    "input_boolean",
    "input_number",
    "input_text",
  ];
  const states = rawStates
    .map((e) => ({ entity_id: e.entity_id, state: e.state }))
    .filter((e) => legalPrefixes.includes(e.entity_id.split(".")[0]));

  return {
    crop: buildCrop(states),
    sensors: buildSensors(states),
    actuators: buildActuators(states),
    warnings: buildWarnings(states),
    notifications: buildNotifications(states),
    weather: buildWeather(states),
    location: buildLocation(states),
    recommendation: getState(states, ENTITY.RECOMMENDATION),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE STATE UPDATER
// ─────────────────────────────────────────────────────────────────────────────

function updateActualState(actualState, emitter, event) {
  if (event.event_type !== "state_changed") return;

  const { entity_id, new_state } = event.data;
  const state = new_state.state;

  // ── Crop ──
  if (entity_id === ENTITY.CROP_TYPE) {
    actualState.crop.type = state;
    emitUpdateState(emitter, "crop", cloneState(actualState.crop));
  } else if (entity_id === ENTITY.GROWTH_STAGE) {
    actualState.crop.growth_stage = state; // ✅
    emitUpdateState(emitter, "crop", cloneState(actualState.crop));
  } else if (entity_id === ENTITY.PRIORITY_MODE) {
    actualState.crop.mode = state; // ✅
    emitUpdateState(emitter, "crop", cloneState(actualState.crop));

    // ── Sensor value ──
  } else if (entity_id.startsWith("input_number.")) {
    const type = entity_id.split(".")[1];
    const sensor = actualState.sensors.find((s) => s.type === type);
    if (sensor) {
      sensor.value = state;
      emitUpdateState(emitter, "sensors", cloneState(actualState.sensors));
    }

    // ── Sensor description ──
  } else if (
    entity_id.startsWith("input_text.") &&
    entity_id.endsWith("_description")
  ) {
    const type = Object.entries(ENTITY.SENSOR_DESCRIPTIONS).find(
      ([, v]) => v === entity_id,
    )?.[0];
    const sensor = type && actualState.sensors.find((s) => s.type === type);
    if (sensor) {
      sensor.description = state;
      emitUpdateState(emitter, "sensors", cloneState(actualState.sensors));
    }

    // ── Actuator boolean (status or control_mode) ──
  } else if (entity_id.startsWith("input_boolean.")) {
    const boolType = entity_id.split(".")[1];

    if (boolType.endsWith("_status")) {
      const actuator = actualState.actuators.find(
        (a) => a.type === boolType.replace("_status", ""),
      );
      if (actuator) {
        actuator.status = state;
        emitUpdateState(
          emitter,
          "actuators",
          cloneState(actualState.actuators),
        );
      }
    } else if (boolType.endsWith("_control_mode")) {
      const actuator = actualState.actuators.find(
        (a) => a.type === boolType.replace("_control_mode", ""),
      );
      if (actuator) {
        actuator.control_mode = state === "on" ? "semi_auto" : "auto";
        emitUpdateState(
          emitter,
          "actuators",
          cloneState(actualState.actuators),
        );
      }
    } else {
      // ── Warning boolean ──
      const warning = actualState.warnings.find((w) => w.title === boolType);
      if (warning) {
        warning.status = state === "on" ? "active" : "inactive";
        emitUpdateState(emitter, "warnings", cloneState(actualState.warnings));
      }
    }

    // ── Warning extra info ──
  } else if (
    entity_id.startsWith("input_text.") &&
    entity_id.endsWith("_extra_info")
  ) {
    const title = Object.entries(ENTITY.WARNING_EXTRA_INFO).find(
      ([, v]) => v === entity_id,
    )?.[0];
    const warning =
      title && actualState.warnings.find((w) => w.title === title);
    if (warning) {
      const extra = parseObjString(state);
      warning.severity = extra.severity ?? warning.severity;
      warning.description = extra.description ?? warning.description;
      emitUpdateState(emitter, "warnings", cloneState(actualState.warnings));
    }

    // ── Actuator schedule ──
  } else if (entity_id.startsWith("input_datetime.")) {
    const datetimeType = entity_id.split(".")[1];

    if (datetimeType.endsWith("_execute_at")) {
      const actuator = actualState.actuators.find(
        (a) => a.type === datetimeType.replace("_execute_at", ""),
      );
      if (actuator) {
        actuator.run_at = state;
        actuator.duration_minutes = calculateDuration(
          actuator.run_at,
          actuator.run_until,
        );
        emitUpdateState(
          emitter,
          "actuators",
          cloneState(actualState.actuators),
        );
      }
    } else if (datetimeType.endsWith("_execute_until")) {
      const actuator = actualState.actuators.find(
        (a) => a.type === datetimeType.replace("_execute_until", ""),
      );
      if (actuator) {
        actuator.run_until = state;
        actuator.duration_minutes = calculateDuration(
          actuator.run_at,
          actuator.run_until,
        );
        emitUpdateState(
          emitter,
          "actuators",
          cloneState(actualState.actuators),
        );
      }
    }

    // ── Recommendation ──
  } else if (entity_id === ENTITY.RECOMMENDATION) {
    actualState.recommendation = state;
    emitUpdateState(emitter, "recommendation", state);

    // ── App notification ──
  } else if (entity_id === ENTITY.APP_NOTIFICATION) {
    const parsed = parseObjString(state);
    const index = actualState.notifications.findIndex(
      (n) => n.title !== "Suggested Actions",
    );
    const updated = {
      id: index >= 0 ? actualState.notifications[index].id : uuidv4(),
      ...parsed,
    };
    if (index >= 0) actualState.notifications[index] = updated;
    else actualState.notifications.unshift(updated);
    emitUpdateState(
      emitter,
      "notifications",
      cloneState(actualState.notifications),
    );

    // ── Suggested actions ──
  } else if (entity_id === ENTITY.SUGGESTED_ACTIONS) {
    const index = actualState.notifications.findIndex(
      (n) => n.title === "Suggested Actions",
    );
    if (state?.trim()) {
      const updated = {
        id: index >= 0 ? actualState.notifications[index].id : uuidv4(),
        title: "Suggested Actions",
        description: state.trim(),
      };
      if (index >= 0) actualState.notifications[index] = updated;
      else actualState.notifications.push(updated);
    } else {
      if (index >= 0) actualState.notifications.splice(index, 1);
    }
    emitUpdateState(
      emitter,
      "notifications",
      cloneState(actualState.notifications),
    );

    // ── Weather ──
  } else if (entity_id === ENTITY.WEATHER_INFO) {
    const parsed = parseObjString(state);
    const newWeatherState = {
      state: parsed.state ?? null,
      summary: parsed.summary ?? null,
    };
    actualState.weather = newWeatherState;
    emitUpdateState(emitter, "weather", cloneState(newWeatherState));

    // ── Location ──
  } else if (entity_id === ENTITY.LOCATION_INFO) {
    const parsed = parseObjString(state);
    actualState.location = {
      timezone: parsed.timezone ?? null,
      longitude: parsed.longitude ?? null,
      latitude: parsed.latitude ?? null,
    };
    emitUpdateState(emitter, "location", cloneState(actualState.location));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HA CONNECTION FACTORY
// Creates a new WebSocket connection to a HA instance and returns a promise
// that resolves once the initial state has been fully loaded.
// ─────────────────────────────────────────────────────────────────────────────

const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 10;

function createHAConnection(ha_instance_id, url, token) {
  return new Promise((resolve, reject) => {
    const entry = {
      socket: null,
      actualState: {},
      emitter: new EventEmitter(),
      refCount: 0,
      ready: false,
      url,
      token,
      reconnectAttempts: 0,
    };

    function connect() {
      const socket = new WebSocket(`${url}/api/websocket`);
      entry.socket = socket;

      // ── Timeout: if HA doesn't respond in 10s, reject ──
      const connectionTimeout = setTimeout(() => {
        if (!entry.ready) {
          socket.terminate();
          reject(new Error(`[HA:${ha_instance_id}] Connection timed out.`));
        }
      }, 10_000);

      socket.on("open", () => {
        console.log(`[HA:${ha_instance_id}] WebSocket opened.`);
      });

      socket.on("message", (msg) => {
        const data = JSON.parse(msg);

        if (data.type === "auth_required") {
          socket.send(JSON.stringify({ type: "auth", access_token: token }));
        }

        if (data.type === "auth_ok") {
          console.log(`[HA:${ha_instance_id}] Authenticated.`);
          socket.send(JSON.stringify({ id: 1, type: "get_states" }));
          socket.send(
            JSON.stringify({
              id: 2,
              type: "subscribe_events",
              event_type: "state_changed",
            }),
          );
        }

        if (data.type === "auth_invalid") {
          clearTimeout(connectionTimeout);
          console.error(`[HA:${ha_instance_id}] Invalid token.`);
          reject(new Error(`[HA:${ha_instance_id}] Authentication failed.`));
        }

        // ── Initial state loaded ──
        if (data.type === "result" && data.id === 1) {
          clearTimeout(connectionTimeout);
          entry.actualState = buildInitialState(data.result);
          entry.ready = true;
          entry.reconnectAttempts = 0;
          console.log(entry.actualState);
          console.log(`[HA:${ha_instance_id}] Initial state loaded.`);

          // ── Start the 10-min snapshot timer ──────────────────────────────────────
          entry.snapshotInterval = setInterval(async () => {
            try {
              await saveToDatabase(
                cloneState(entry.actualState),
                entry.farm_id,
              );
              console.log(`[HA:${ha_instance_id}] Snapshot saved.`);
            } catch (err) {
              console.error(
                `[HA:${ha_instance_id}] Snapshot save failed:`,
                err.message,
              );
            }
          }, 15 * 1000);

          resolve(entry);
        }

        // ── Live updates ──
        if (data.type === "event") {
          updateActualState(entry.actualState, entry.emitter, data.event);
        }
      });

      socket.on("error", (err) => {
        console.error(`[HA:${ha_instance_id}] WebSocket error:`, err.message);
      });

      socket.on("close", () => {
        console.warn(`[HA:${ha_instance_id}] WebSocket closed.`);

        // ── Stop saving snapshots while disconnected ──
        if (entry.snapshotInterval) {
          clearInterval(entry.snapshotInterval);
          entry.snapshotInterval = null;
        }

        // ── If no clients are using this connection anymore, don't reconnect ──
        if (entry.refCount <= 0) {
          console.log(
            `[HA:${ha_instance_id}] No clients remaining, skipping reconnect.`,
          );
          haConnections.delete(ha_instance_id);
          return;
        }

        // ── Notify frontend clients that state is stale ──
        entry.emitter.emit("ha_disconnected", { ha_instance_id });

        // ── Reconnect with exponential backoff ──
        if (entry.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
          console.error(
            `[HA:${ha_instance_id}] Max reconnect attempts reached. Giving up.`,
          );
          entry.emitter.emit("ha_failed", { ha_instance_id });
          haConnections.delete(ha_instance_id);
          return;
        }

        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * 2 ** entry.reconnectAttempts,
          RECONNECT_MAX_DELAY_MS,
        );
        entry.reconnectAttempts++;
        console.log(
          `[HA:${ha_instance_id}] Reconnecting in ${delay}ms (attempt ${entry.reconnectAttempts})...`,
        );
        setTimeout(connect, delay);
      });
    }

    connect();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the HAConnectionEntry for the given ha_instance_id.
 * - If already connected: increments refCount and returns immediately.
 * - If connecting (pending): waits for the existing promise, then increments.
 * - If not yet connected: creates a new connection, caches the promise,
 *   and resolves once the initial state is ready.
 */
export async function acquireHAConnection(ha_instance_id, farm_id) {
  if (haConnections.has(ha_instance_id)) {
    const entry = haConnections.get(ha_instance_id);
    entry.refCount++;
    return entry;
  }

  // 🔒 IMPORTANT: reserve immediately (synchronous lock)
  if (pendingConnections.has(ha_instance_id)) {
    const entry = await pendingConnections.get(ha_instance_id);
    entry.refCount++;
    return entry;
  }

  console.log(`[HA:${ha_instance_id}] Creating new HA connection...`);

  const connectionPromise = (async () => {
    const { url, token } = await _getCredentials(ha_instance_id);
    const entry = await createHAConnection(ha_instance_id, url, token);

    entry.farm_id = farm_id;
    haConnections.set(ha_instance_id, entry);

    return entry;
  })();

  // set IMMEDIATELY before any await resolves
  pendingConnections.set(ha_instance_id, connectionPromise);

  try {
    const entry = await connectionPromise;
    entry.refCount++;
    return entry;
  } catch (err) {
    pendingConnections.delete(ha_instance_id);
    throw err;
  } finally {
    // ALWAYS cleanup lock
    pendingConnections.delete(ha_instance_id);
  }
}

/**
 * Decrements the refCount for a HA connection.
 * If no more clients are using it, closes the WebSocket and removes it from the map.
 */
export function releaseHAConnection(ha_instance_id) {
  const entry = haConnections.get(ha_instance_id);
  if (!entry) return;

  entry.refCount--;
  console.log(
    `[HA:${ha_instance_id}] Client released (refCount: ${entry.refCount}).`,
  );

  if (entry.refCount <= 0) {
    console.log(
      `[HA:${ha_instance_id}] No clients remaining. Closing connection.`,
    );

    // ── Stop the snapshot timer ──
    if (entry.snapshotInterval) {
      clearInterval(entry.snapshotInterval);
      entry.snapshotInterval = null;
    }

    entry.socket.close();
    haConnections.delete(ha_instance_id);
  }
}

export function getHAState(ha_instance_id) {
  return haConnections.get(ha_instance_id)?.actualState ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// setHAEntity
//
// Calls the Home Assistant REST API to change the state of an entity.
// Used by front_back_manager when a frontend client emits "set_entity".
//
// @param {string} ha_instance_id
// @param {string} domain   - e.g. "input_boolean", "input_select"
// @param {string} service  - e.g. "turn_on", "turn_off", "select_option"
// @param {object} data     - e.g. { entity_id: "input_boolean.pump_status" }
//                            or   { entity_id: "input_select.crop_type", option: "Tomato" }
// ─────────────────────────────────────────────────────────────────────────────
export async function setHAEntity(ha_instance_id, domain, service, data) {
  const entry = haConnections.get(ha_instance_id);
  if (!entry)
    throw new Error(`No active HA connection for instance: ${ha_instance_id}`);

  const url = `${entry.url}/api/services/${domain}/${service}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${entry.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA API error ${res.status}: ${text}`);
  }

  console.log(`[HA:${ha_instance_id}] set_entity → ${domain}/${service}`, data);
}
