// the goal of this file is to connect to an HA account and subscribe into any change happens
// log the changes with console.log()

import Websocket from "ws";
import EventEmitter from "events";

const stateEmitter = new EventEmitter();
const socket = new Websocket("http://localhost:8123/api/websocket");

let actualState = {};

function calculateDuration(runAt, runUntil) {
  if (!runAt || !runUntil) return null;
  const start = new Date(runAt);
  const end = new Date(runUntil);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return Math.round((end - start) / (1000 * 60)); // minutes, rounded
}

function updateActualState(event) {
  if (event.event_type !== "state_changed") return;

  const { entity_id, new_state } = event.data;
  const state = new_state.state;

  if (entity_id.startsWith("input_select.")) {
    if (entity_id === "input_select.crop_type") {
      actualState.crop.type = state;
      stateEmitter.emit("state_update", { field: "crop", value: actualState.crop });
    } else if (entity_id === "input_select.growth_stage") {
      actualState.crop.mode = state;
      stateEmitter.emit("state_update", { field: "crop", value: actualState.crop });
    } else if (entity_id === "input_select.priority_mode") {
      actualState.crop.growth_stage = state;
      stateEmitter.emit("state_update", { field: "crop", value: actualState.crop });
    }
  } else if (entity_id.startsWith("input_number.")) {
    const sensorType = entity_id.split(".")[1];
    const sensor = actualState.sensors.find(s => s.type === sensorType);
    if (sensor) {
      sensor.value = state;
      stateEmitter.emit("state_update", { field: "sensors", value: actualState.sensors });
    }
  } else if (entity_id.startsWith("input_boolean.")) {
    const boolType = entity_id.split(".")[1];
    if (boolType.endsWith("_status")) {
      const actuatorType = boolType.replace("_status", "");
      const actuator = actualState.actuators.find(a => a.type === actuatorType);
      if (actuator) {
        actuator.status = state;
        stateEmitter.emit("state_update", { field: "actuators", value: actualState.actuators });
      }
    } else if (boolType.endsWith("_control_mode")) {
      const actuatorType = boolType.replace("_control_mode", "");
      const actuator = actualState.actuators.find(a => a.type === actuatorType);
      if (actuator) {
        actuator.control_mode = state === "on" ? "semi_auto" : "auto";
        stateEmitter.emit("state_update", { field: "actuators", value: actualState.actuators });
      }
    } else {
      // Warnings
      const warning = actualState.warnings.find(w => w.title === boolType);
      if (warning) {
        warning.status = state === "on" ? "active" : "unactive";
        stateEmitter.emit("state_update", { field: "warnings", value: actualState.warnings });
      }
    }
  } else if (entity_id.startsWith("input_datetime.")) {
    const datetimeType = entity_id.split(".")[1];
    if (datetimeType.endsWith("_execute_at")) {
      const actuatorType = datetimeType.replace("_execute_at", "");
      const actuator = actualState.actuators.find(a => a.type === actuatorType);
      if (actuator) {
        actuator.run_at = state;
        actuator.duration_minutes = calculateDuration(actuator.run_at, actuator.run_until);
        stateEmitter.emit("state_update", { field: "actuators", value: actualState.actuators });
      }
    } else if (datetimeType.endsWith("_execute_until")) {
      const actuatorType = datetimeType.replace("_execute_until", "");
      const actuator = actualState.actuators.find(a => a.type === actuatorType);
      if (actuator) {
        actuator.run_until = state;
        actuator.duration_minutes = calculateDuration(actuator.run_at, actuator.run_until);
        stateEmitter.emit("state_update", { field: "actuators", value: actualState.actuators });
      }
    }
  } else if (entity_id === "input_text.n8n_recommendation") {
    actualState.recommendation = state;
    stateEmitter.emit("state_update", { field: "recommendation", value: actualState.recommendation });
  }
}

socket.on("open", () => {
  console.log("connection is opened !");
});

socket.on("message", (msg) => {
  const data = JSON.parse(msg);
  if (data.type === "auth_required") {
    //this is to do the authentication when it asks
    const response = {
      type: "auth",
      access_token:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI1MGYzYWNmN2RlMTc0MzYyYTJkYjRlOGMyMmU1YmZlOSIsImlhdCI6MTc3Njc3MDEwOSwiZXhwIjoyMDkyMTMwMTA5fQ.-9gNxoMXpAGHPUkTwDBR9xZyl33w9uEVoEt6iKnTUME",
    };
    socket.send(JSON.stringify(response));
  }

  if (data.type === "auth_ok") {
    //this is when the authentication is confirmed (happens only one time, you can like i did subscribe)

    let request = {
      id: 1,
      type: "get_states",
    };
    socket.send(JSON.stringify(request));

    request = {
      id: 2,
      type: "subscribe_events",
      event_type: "state_changed",
    };
    socket.send(JSON.stringify(request));
  }

  if (data.type === "auth_invalid") {
    //when the token is not valid
    console.log("Authentication is invalid !");
  }

  if (data.type === "event") {
    //when a event happens (the changed state is here )

    updateActualState(data.event)
     

  }

  const legalInputs = [
    "input_datetime",
    "input_select",
    "input_boolean",
    "input_number",
    "input_text",
  ];

  if (data.type === "result") {
    //subscription accepted, or call service accepted, or comming data (like from the "get_states")
    if (data.id == 1) //id==1 means this is from the "get_states"
    {
      
      actualState = data.result
        .map((element) => {
          return { entity_id: element.entity_id, state: element.state };
        })
        .filter((element) =>
          legalInputs.includes(element.entity_id.split(".")[0]),
        );

      let crop = {
        type: actualState.find(
          (element) => element.entity_id == "input_select.crop_type",
        ).state,
        mode: actualState.find(
          (element) => element.entity_id == "input_select.growth_stage",
        ).state,
        growth_stage: actualState.find(
          (element) => element.entity_id == "input_select.priority_mode",
        ).state,
      };

      let sensors = [
        "input_number.temperature",
        "input_number.air_humidity",
        "input_number.soil_moisture",
        "input_number.luminosity",
      ];
      sensors = sensors.map((sensor, index) => {
        const sensorIds = [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
          "550e8400-e29b-41d4-a716-446655440003",
          "550e8400-e29b-41d4-a716-446655440004",
        ];
        return {
          id: sensorIds[index],
          type: sensor.split(".")[1],
          unit: null,
          value: actualState.find((element) => element.entity_id == sensor)
            .state,
          description: null,
        };
      });

      let actuators = ["pump", "fan"];
      actuators = actuators.map((actuator, index) => {
        const actuatorIds = [
          "660e8400-e29b-41d4-a716-446655440005",
          "660e8400-e29b-41d4-a716-446655440006",
        ];
        const run_at = actualState.find(
          (element) =>
            element.entity_id == `input_datetime.${actuator}_execute_at`,
        )?.state;
        const run_until = actualState.find(
          (element) =>
            element.entity_id == `input_datetime.${actuator}_execute_until`,
        )?.state;
        return {
          id: actuatorIds[index],
          type: actuator,
          status: actualState.find(
            (element) =>
              element.entity_id == `input_boolean.${actuator}_status`,
          ).state,
          control_mode:
            actualState.find(
              (element) =>
                element.entity_id == `input_boolean.${actuator}_control_mode`,
            ).state == "on"
              ? "semi_auto"
              : "auto",
          run_at: run_at,
          run_until: run_until,
          duration_minutes: calculateDuration(run_at, run_until),
        };
      });

      let recommendation = actualState.find(
        (element) => element.entity_id == "input_text.n8n_recommendation",
      ).state;

      let warnings = [
        "input_boolean.high_temperature_detected",
        "input_boolean.frost_risk",
        "input_boolean.low_soil_moisture",
        "input_boolean.overwatering",
        "input_boolean.insufficient_sunlight",
        "input_boolean.excessive_sunlight",
        "input_boolean.high_humidity_level",
        "input_boolean.strong_wind",
        "input_boolean.heavy_rainfall",
      ];

      warnings = warnings.map((warning, index) => {
        const warningIds = [
          "770e8400-e29b-41d4-a716-446655440007",
          "770e8400-e29b-41d4-a716-446655440008",
          "770e8400-e29b-41d4-a716-446655440009",
          "770e8400-e29b-41d4-a716-446655440010",
          "770e8400-e29b-41d4-a716-446655440011",
          "770e8400-e29b-41d4-a716-446655440012",
          "770e8400-e29b-41d4-a716-446655440013",
          "770e8400-e29b-41d4-a716-446655440014",
          "770e8400-e29b-41d4-a716-446655440015",
        ];
        return {
          id: warningIds[index],
          title: warning.split(".")[1],
          status:
            actualState.find((element) => element.entity_id == warning).state ==
            "on"
              ? "active"
              : "unactive",
          description : null,
          severity: 50,    
        };
      });

      actualState = { crop, sensors, actuators, recommendation, warnings };
      
    }
  }
});

export { actualState, stateEmitter };



