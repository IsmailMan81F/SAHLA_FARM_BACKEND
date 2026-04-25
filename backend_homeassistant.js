// ─────────────────────────────────────────────────────────────────────────────
// ha-state.js
//
// Connects to a Home Assistant instance via WebSocket, fetches the initial
// state of all relevant entities, and subscribes to live state changes.
// Exports `actualState` (current snapshot) and `stateEmitter` (change events).
// ─────────────────────────────────────────────────────────────────────────────

import WebSocket    from "ws";
import EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";

// ─── Event emitter used to notify other modules of state changes ──────────────
const stateEmitter = new EventEmitter();

// ─── WebSocket connection to Home Assistant ───────────────────────────────────
const socket = new WebSocket("ws://localhost:8123/api/websocket");

// ─── Long-lived access token for HA authentication ───────────────────────────
const HA_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmNzBiZGI0ZGQ4NWU0M2U4YmM5MGMyMjg3OGYxZmI3ZCIsImlhdCI6MTc3NzEwMzg1OCwiZXhwIjoyMDkyNDYzODU4fQ.XPZpsDhSuMWe5f097VGUx3HqG9UXpCGgujQHs423Etg";

// ─── The live state snapshot shared with the rest of the app ─────────────────
let actualState = {};

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY DEFINITIONS
// All HA entity IDs used in this module are declared here for easy maintenance.
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY = {
  // Crop settings
  CROP_TYPE    : "input_select.crop_type",
  GROWTH_STAGE : "input_select.growth_stage",
  PRIORITY_MODE: "input_select.priority_mode",

  // Sensor values
  SENSORS: [
    "input_number.temperature",
    "input_number.air_humidity",
    "input_number.soil_moisture",
    "input_number.luminosity",
  ],

  // Sensor descriptions (written by n8n)
  SENSOR_DESCRIPTIONS: {
    temperature  : "input_text.temperature_description",
    air_humidity : "input_text.humidity_description",
    soil_moisture: "input_text.soil_moisture_description",
    luminosity   : "input_text.luminosity_description",
  },

  // Actuator types managed in HA
  ACTUATORS: ["pump", "fan"],

  // Warning boolean entities
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

  // Warning extra info entities (severity + description, written by n8n)
  WARNING_EXTRA_INFO: {
    high_temperature_detected: "input_text.high_temperature_detected_extra_info",
    frost_risk               : "input_text.frost_risk_extra_info",
    low_soil_moisture        : "input_text.low_soil_moisture_extra_info",
    overwatering             : "input_text.overwatering_extra_info",
    insufficient_sunlight    : "input_text.insufficient_sunlight_extra_info",
    excessive_sunlight       : "input_text.excessive_sunlight_extra_info",
    high_humidity_level      : "input_text.high_humidity_level_extra_info",
    strong_wind              : "input_text.strong_wind_extra_info",
    heavy_rainfall           : "input_text.heavy_rainfall_extra_info",
  },

  // General outputs written by n8n
  RECOMMENDATION  : "input_text.general_recommendation",
  APP_NOTIFICATION: "input_text.app_notification",
  SUGGESTED_ACTIONS: "input_text.suggested_actions",
  WEATHER_INFO    : "input_text.weather_info",
  LOCATION_INFO   : "input_text.location_info",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the state value of a given entity_id from a flat HA states array.
 * Returns null if not found.
 */
function getState(states, entityId) {
  return states.find(e => e.entity_id === entityId)?.state ?? null;
}

/**
 * Parses a plain object string of the format {"key": "value", ...}
 * as written by n8n into a JS object.
 * Returns an empty object if parsing fails.
 */
function parseObjString(str) {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * Calculates the duration in minutes between two ISO datetime strings.
 * Returns null if either value is missing or invalid.
 */
function calculateDuration(runAt, runUntil) {
  if (!runAt || !runUntil) return null;
  const start = new Date(runAt);
  const end   = new Date(runUntil);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return Math.round((end - start) / (1000 * 60));
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE BUILDERS
// Each function below takes the raw flat HA states array and builds one
// structured slice of actualState.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the crop object from the three input_select entities.
 */
function buildCrop(states) {
  return {
    type        : getState(states, ENTITY.CROP_TYPE),
    mode        : getState(states, ENTITY.GROWTH_STAGE),
    growth_stage: getState(states, ENTITY.PRIORITY_MODE),
  };
}

/**
 * Builds the sensors array. Each sensor gets:
 * - a fresh UUID
 * - its numeric value from input_number
 * - its text description from input_text (written by n8n)
 */
function buildSensors(states) {
  return ENTITY.SENSORS.map(entityId => {
    const type        = entityId.split(".")[1]; // e.g. "temperature"
    const descEntity  = ENTITY.SENSOR_DESCRIPTIONS[type];
    const description = descEntity ? getState(states, descEntity) : null;

    return {
      id         : uuidv4(),
      type,
      value      : getState(states, entityId),
      description,
    };
  });
}

/**
 * Builds the actuators array. Each actuator gets:
 * - a fresh UUID
 * - its on/off status from input_boolean
 * - its control mode (auto / semi_auto) from input_boolean
 * - its scheduled run_at / run_until / duration from input_datetime
 */
function buildActuators(states) {
  return ENTITY.ACTUATORS.map(type => {
    const run_at    = getState(states, `input_datetime.${type}_execute_at`);
    const run_until = getState(states, `input_datetime.${type}_execute_until`);
    const controlModeRaw = getState(states, `input_boolean.${type}_control_mode`);

    return {
      id            : uuidv4(),
      type,
      status        : getState(states, `input_boolean.${type}_status`),
      control_mode  : controlModeRaw === "on" ? "semi_auto" : "auto",
      run_at,
      run_until,
      duration_minutes: calculateDuration(run_at, run_until),
    };
  });
}

/**
 * Builds the warnings array. Each warning gets:
 * - a fresh UUID
 * - its title (the entity name, e.g. "frost_risk")
 * - its active/inactive status from input_boolean
 * - its severity and description from the matching input_text extra_info entity
 */
function buildWarnings(states) {
  return ENTITY.WARNINGS.map(entityId => {
    const title         = entityId.split(".")[1]; // e.g. "frost_risk"
    const isActive      = getState(states, entityId) === "on";
    const extraEntity   = ENTITY.WARNING_EXTRA_INFO[title];
    const extra         = parseObjString(getState(states, extraEntity));

    return {
      id         : uuidv4(),
      title,
      status     : isActive ? "active" : "inactive",
      description: extra.description ?? null,
      severity   : extra.severity    ?? null,
    };
  });
}

/**
 * Builds the notifications array from two sources:
 * 1. input_text.app_notification  → always included if non-empty (title + description)
 * 2. input_text.suggested_actions → included only if non-empty (title = "Suggested Actions")
 * Each notification gets a fresh UUID.
 */
function buildNotifications(states) {
  const notifications = [];

  // ── App notification (from n8n, object string) ──
  const appNotifRaw = getState(states, ENTITY.APP_NOTIFICATION);
  const appNotif    = parseObjString(appNotifRaw);
  if (appNotif.title || appNotif.description) {
    notifications.push({
      id         : uuidv4(),
      title      : appNotif.title       ?? null,
      description: appNotif.description ?? null,
    });
  }

  // ── Suggested actions (plain text from n8n, only if non-empty) ──
  const suggestedActions = getState(states, ENTITY.SUGGESTED_ACTIONS);
  if (suggestedActions && suggestedActions.trim() !== "") {
    notifications.push({
      id         : uuidv4(),
      title      : "Suggested Actions",
      description: suggestedActions.trim(),
    });
  }

  return notifications;
}

/**
 * Builds the weather object from input_text.weather_info.
 * Expected format written by n8n: {"state": "...", "summary": "..."}
 */
function buildWeather(states) {
  const raw     = getState(states, ENTITY.WEATHER_INFO);
  const parsed  = parseObjString(raw);
  return {
    state  : parsed.state   ?? null,
    summary: parsed.summary ?? null,
  };
}

/**
 * Builds the location object from input_text.location_info.
 * Expected format written by n8n: {"timezone": "...", "longitude": "...", "latitude": "..."}
 */
function buildLocation(states) {
  const raw    = getState(states, ENTITY.LOCATION_INFO);
  const parsed = parseObjString(raw);
  return {
    timezone : parsed.timezone  ?? null,
    longitude: parsed.longitude ?? null,
    latitude : parsed.latitude  ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL STATE BUILDER
// Called once when HA responds to the get_states request.
// Assembles the full actualState from all entity slices.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Takes the raw HA get_states result array, filters to relevant entity types,
 * and builds the full structured actualState object.
 */
function buildInitialState(rawStates) {
  const legalPrefixes = [
    "input_datetime",
    "input_select",
    "input_boolean",
    "input_number",
    "input_text",
  ];

  // Keep only the entity types we care about
  const states = rawStates
    .map(e => ({ entity_id: e.entity_id, state: e.state }))
    .filter(e => legalPrefixes.includes(e.entity_id.split(".")[0]));

  return {
    location      : buildLocation(states),
    crop          : buildCrop(states),
    sensors       : buildSensors(states),
    actuators     : buildActuators(states),
    warnings      : buildWarnings(states),
    notifications : buildNotifications(states),
    weather       : buildWeather(states),
    recommendation: getState(states, ENTITY.RECOMMENDATION),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE STATE UPDATER
// Called on every state_changed event. Updates only the affected slice of
// actualState and emits a targeted state_update event.
// ─────────────────────────────────────────────────────────────────────────────

function updateActualState(event) {
  if (event.event_type !== "state_changed") return;

  const { entity_id, new_state } = event.data;
  const state = new_state.state;

  // ── Crop settings ──
  if (entity_id === ENTITY.CROP_TYPE) {
    actualState.crop.type = state;
    stateEmitter.emit("state_update", { field: "crop", value: actualState.crop });

  } else if (entity_id === ENTITY.GROWTH_STAGE) {
    actualState.crop.mode = state;
    stateEmitter.emit("state_update", { field: "crop", value: actualState.crop });

  } else if (entity_id === ENTITY.PRIORITY_MODE) {
    actualState.crop.growth_stage = state;
    stateEmitter.emit("state_update", { field: "crop", value: actualState.crop });

  // ── Sensor values ──
  } else if (entity_id.startsWith("input_number.")) {
    const type   = entity_id.split(".")[1];
    const sensor = actualState.sensors.find(s => s.type === type);
    if (sensor) {
      sensor.value = state;
      stateEmitter.emit("state_update", { field: "sensors", value: actualState.sensors });
    }

  // ── Sensor descriptions (written by n8n) ──
  } else if (entity_id.startsWith("input_text.") && entity_id.endsWith("_description")) {
    const type   = Object.entries(ENTITY.SENSOR_DESCRIPTIONS).find(([, v]) => v === entity_id)?.[0];
    const sensor = type && actualState.sensors.find(s => s.type === type);
    if (sensor) {
      sensor.description = state;
      stateEmitter.emit("state_update", { field: "sensors", value: actualState.sensors });
    }

  // ── Actuator status & control mode ──
  } else if (entity_id.startsWith("input_boolean.")) {
    const boolType = entity_id.split(".")[1];

    if (boolType.endsWith("_status")) {
      const type     = boolType.replace("_status", "");
      const actuator = actualState.actuators.find(a => a.type === type);
      if (actuator) {
        actuator.status = state;
        stateEmitter.emit("state_update", { field: "actuators", value: actualState.actuators });
      }

    } else if (boolType.endsWith("_control_mode")) {
      const type     = boolType.replace("_control_mode", "");
      const actuator = actualState.actuators.find(a => a.type === type);
      if (actuator) {
        actuator.control_mode = state === "on" ? "semi_auto" : "auto";
        stateEmitter.emit("state_update", { field: "actuators", value: actualState.actuators });
      }

    } else {
      // ── Warning boolean toggled ──
      const warning = actualState.warnings.find(w => w.title === boolType);
      if (warning) {
        warning.status = state === "on" ? "active" : "inactive";
        stateEmitter.emit("state_update", { field: "warnings", value: actualState.warnings });
      }
    }

  // ── Warning extra info updated (severity + description written by n8n) ──
  } else if (entity_id.startsWith("input_text.") && entity_id.endsWith("_extra_info")) {
    const title   = Object.entries(ENTITY.WARNING_EXTRA_INFO).find(([, v]) => v === entity_id)?.[0];
    const warning = title && actualState.warnings.find(w => w.title === title);
    if (warning) {
      const extra       = parseObjString(state);
      warning.severity    = extra.severity    ?? warning.severity;
      warning.description = extra.description ?? warning.description;
      stateEmitter.emit("state_update", { field: "warnings", value: actualState.warnings });
    }

  // ── Actuator schedule (run_at / run_until) ──
  } else if (entity_id.startsWith("input_datetime.")) {
    const datetimeType = entity_id.split(".")[1];

    if (datetimeType.endsWith("_execute_at")) {
      const type     = datetimeType.replace("_execute_at", "");
      const actuator = actualState.actuators.find(a => a.type === type);
      if (actuator) {
        actuator.run_at          = state;
        actuator.duration_minutes = calculateDuration(actuator.run_at, actuator.run_until);
        stateEmitter.emit("state_update", { field: "actuators", value: actualState.actuators });
      }

    } else if (datetimeType.endsWith("_execute_until")) {
      const type     = datetimeType.replace("_execute_until", "");
      const actuator = actualState.actuators.find(a => a.type === type);
      if (actuator) {
        actuator.run_until        = state;
        actuator.duration_minutes = calculateDuration(actuator.run_at, actuator.run_until);
        stateEmitter.emit("state_update", { field: "actuators", value: actualState.actuators });
      }
    }

  // ── General recommendation (written by n8n) ──
  } else if (entity_id === ENTITY.RECOMMENDATION) {
    actualState.recommendation = state;
    stateEmitter.emit("state_update", { field: "recommendation", value: actualState.recommendation });

  // ── App notification (written by n8n) ──
  } else if (entity_id === ENTITY.APP_NOTIFICATION) {
    const parsed = parseObjString(state);
    const index  = actualState.notifications.findIndex(n => n.title !== "Suggested Actions");
    const updated = { id: uuidv4(), ...parsed };
    if (index >= 0) actualState.notifications[index] = updated;
    else actualState.notifications.unshift(updated);
    stateEmitter.emit("state_update", { field: "notifications", value: actualState.notifications });

  // ── Suggested actions (written by n8n) ──
  } else if (entity_id === ENTITY.SUGGESTED_ACTIONS) {
    const index = actualState.notifications.findIndex(n => n.title === "Suggested Actions");
    if (state && state.trim() !== "") {
      const updated = { id: uuidv4(), title: "Suggested Actions", description: state.trim() };
      if (index >= 0) actualState.notifications[index] = updated;
      else actualState.notifications.push(updated);
    } else {
      // Remove the suggested actions notification if it became empty
      if (index >= 0) actualState.notifications.splice(index, 1);
    }
    stateEmitter.emit("state_update", { field: "notifications", value: actualState.notifications });

  // ── Weather info (written by n8n) ──
  } else if (entity_id === ENTITY.WEATHER_INFO) {
    const parsed = parseObjString(state);
    actualState.weather = { state: parsed.state ?? null, summary: parsed.summary ?? null };
    stateEmitter.emit("state_update", { field: "weather", value: actualState.weather });

  // ── Location info (written by n8n) ──
  } else if (entity_id === ENTITY.LOCATION_INFO) {
    const parsed = parseObjString(state);
    actualState.location = { timezone: parsed.timezone ?? null, longitude: parsed.longitude ?? null, latitude: parsed.latitude ?? null };
    stateEmitter.emit("state_update", { field: "location", value: actualState.location });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET EVENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

socket.on("open", () => {
  console.log("[HA] WebSocket connection opened.");
});

socket.on("message", (msg) => {
  const data = JSON.parse(msg);

  // ── Step 1: HA asks for authentication ──
  if (data.type === "auth_required") {
    socket.send(JSON.stringify({ type: "auth", access_token: HA_TOKEN }));
  }

  // ── Step 2: Authentication confirmed — fetch states and subscribe ──
  if (data.type === "auth_ok") {
    console.log("[HA] Authenticated successfully.");
    socket.send(JSON.stringify({ id: 1, type: "get_states" }));
    socket.send(JSON.stringify({ id: 2, type: "subscribe_events", event_type: "state_changed" }));
  }

  // ── Authentication failed ──
  if (data.type === "auth_invalid") {
    console.error("[HA] Authentication failed — check your token.");
  }

  // ── Step 3: Initial get_states response → build full state ──
  if (data.type === "result" && data.id === 1) {
    actualState = buildInitialState(data.result);
    console.log("[HA] Initial state loaded:", JSON.stringify(actualState, null, 2));
  }

  // ── Step 4: Live state_changed events → update state incrementally ──
  if (data.type === "event") {
    updateActualState(data.event);
  }
});

socket.on("error", (err) => {
  console.error("[HA] WebSocket error:", err.message);
});

socket.on("close", () => {
  console.warn("[HA] WebSocket connection closed.");
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export { actualState, stateEmitter };