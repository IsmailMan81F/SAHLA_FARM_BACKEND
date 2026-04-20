// the goal of this file is to connect to an HA account and subscribe into any change happens
// log the changes with console.log()

import Websocket from "ws";
const socket = new Websocket("http://localhost:8123/api/websocket");

let actualState = {};

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
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxODI4MGJlODIyYTk0MjIyOWE0OWQ1NTBmOTdhNDI2YyIsImlhdCI6MTc3NjYwMjgxOSwiZXhwIjoyMDkxOTYyODE5fQ.fFVJIJgFiKbRP5xJPlg133n-1DRm7VlyM-pljTW0GdE",
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
    console.log(data);
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
      sensors = sensors.map((sensor) => {
        return {
          id: 123,
          type: sensor.split(".")[1],
          unit: null,
          value: actualState.find((element) => element.entity_id == sensor)
            .state,
          description: null,
        };
      });

      let actuators = ["pump", "fan"];
      actuators = actuators.map((actuator) => {
        return {
          id: 123,
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
          run_at: actualState.find(
            (element) =>
              element.entity_id == `input_datetime.${actuator}_execute_at`,
          )?.state,
          run_until: actualState.find(
            (element) =>
              element.entity_id == `input_datetime.${actuator}_execute_until`,
          )?.state,
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

      warnings = warnings.map((warning) => {
        return {
          id: 123,
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

export { actualState };



