import express          from "express";
import { verifyUser }   from "../services/authService.js";
import { authenticateClient } from "../services/homeassistantService.js"
import { getHAState }   from "../../back_ha_manager.js";

export function createStatesRouter() {
  const router = express.Router();

  router.get("/states", async (req, res) => {

    // ── 1. Extract token from header or query param ───────────────────────────
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : req.query.token;

    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    // ── 2. Verify the token and get the user + their HA instance ──────────────
    try {
      const { unauthorized } = await verifyUser(token);

      if (unauthorized) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      // ── 4. Bring the ha_instance_id from the user token ──────────────────────
      const { ha_instance_id } = await authenticateClient(token);

      // ── 3. Look up the live state for that HA instance ──────────────────────
      const state = getHAState(ha_instance_id);

      if (!state) {
        return res.status(503).json({ error: "Home Assistant instance is not connected yet." });
      }

      // ── 4. Return a deep clone — never expose the raw mutable object ─────────
      return res.json(JSON.parse(JSON.stringify(state)));

    } catch (error) {
      console.error("[States] Token verification failed:", error);
      return res.status(500).json({ error: "Failed to verify token" });
    }
  });


  router.get("/freeStates", async (req, res) => {
    return res.json({
  "crop": {
    "type": "Tomatoes",
    "mode": "Balanced",
    "growth_stage": "Germination"
  },
  "sensors": [
    { 
      "id": "sen-sm-01", 
      "type": "soil_moisture", 
      "unit": "%", 
      "value": 100, 
      "description": "This is the soil moisture" 
    },
    { 
      "id": "sen-tmp-01", 
      "type": "temperature", 
      "unit": "°C", 
      "value": 0, 
      "description": "This is the temperature" 
    },
    { 
      "id": "sen-hum-01", 
      "type": "air_humidity", 
      "unit": "%", 
      "value": 65.0, 
      "description": "This is the air humidity" 
    },
    { 
      "id": "sen-li-01", 
      "type": "light_intensity", 
      "unit": "Lux", 
      "value": 99, 
      "description": "This is the luminosity" 
    }
  ],
  "actuators": [
    {
      "id": "act-pmp-01",
      "type": "pump",
      "status": "on",
      "control_mode": "semi-auto",
      "run_at": "",
      "duration_minutes": null,
      "run_until": ""
    },
    {
      "id": "act-fan-01",
      "type": "fan",
      "status": "on",
      "control_mode": "semi_auto",
      "run_at": "2026-04-18T22:00",
      "duration_minutes": 30,
      "run_until": "2026-04-18T23:30"
    }
  ],
  "warnings": [
    {
      "id": "warn-fr-01",
      "title": "heavy_rainfall",
      "status": "active",
      "description": "We fucked up",
      "severity": 100
    },
    {
      "id": "warn-hr-01",
      "title": "insufficient_sunlight",
      "status": "active",
      "severity": 2,
      "description": "Heavy rainfall is expected in the next 12 hours. Ensure greenhouse roof vents are properly closed and external drainage systems are unblocked."
    },
    {
      "id": "warn-fr-3",
      "title": "frost_risk",
      "status": "active",
      "description": "We fucked up",
      "severity": 100
    },
    {
      "id": "warn-hr-04",
      "title": "excessive_sunlight",
      "status": "active",
      "severity": 33,
      "description": "Heavy rainfall is expected in the next 12 hours. Ensure greenhouse roof vents are properly closed and external drainage systems are unblocked."
    }
  ],
  "recommendation": "This is a recommendation from the backend."
})
  })


  router.get("/freeGraphData", async (req, res) => {
    return res.json([
  {
    "sensor": {
      "type": "temperature",
      "unit": "°C"
    },
    "data": [
      {
        "id": "te1",
        "timestamp": "2026-04-11T18:00:00",
        "value": 5
      },
      {
        "id": "te2",
        "timestamp": "2026-04-11T21:00:00",
        "value": 40
      },
      {
        "id": "te3",
        "timestamp": "2026-04-12T00:00:00",
        "value": 5
      },
      {
        "id": "te4",
        "timestamp": "2026-04-12T03:00:00",
        "value": 40
      },
      {
        "id": "te5",
        "timestamp": "2026-04-12T06:00:00",
        "value": 5
      },
      {
        "id": "te6",
        "timestamp": "2026-04-12T09:00:00",
        "value": 40
      },
      {
        "id": "te7",
        "timestamp": "2026-04-12T12:00:00",
        "value": 5
      },
      {
        "id": "te8",
        "timestamp": "2026-04-12T15:00:00",
        "value": 40
      },
      {
        "id": "te9",
        "timestamp": "2026-04-12T18:00:00",
        "value": 5
      },
      {
        "id": "te10",
        "timestamp": "2026-04-12T21:00:00",
        "value": 40
      },
      {
        "id": "te11",
        "timestamp": "2026-04-13T00:00:00",
        "value": 5
      },
      {
        "id": "te12",
        "timestamp": "2026-04-13T03:00:00",
        "value": 40
      },
      {
        "id": "te13",
        "timestamp": "2026-04-13T06:00:00",
        "value": 5
      },
      {
        "id": "te14",
        "timestamp": "2026-04-13T09:00:00",
        "value": 40
      },
      {
        "id": "te15",
        "timestamp": "2026-04-13T12:00:00",
        "value": 5
      },
      {
        "id": "te16",
        "timestamp": "2026-04-13T15:00:00",
        "value": 40
      },
      {
        "id": "te17",
        "timestamp": "2026-04-13T18:00:00",
        "value": 5
      },
      {
        "id": "te18",
        "timestamp": "2026-04-13T21:00:00",
        "value": 40
      },
      {
        "id": "te19",
        "timestamp": "2026-04-14T00:00:00",
        "value": 5
      },
      {
        "id": "te20",
        "timestamp": "2026-04-14T03:00:00",
        "value": 40
      },
      {
        "id": "te21",
        "timestamp": "2026-04-14T06:00:00",
        "value": 5
      },
      {
        "id": "te22",
        "timestamp": "2026-04-14T09:00:00",
        "value": 40
      },
      {
        "id": "te23",
        "timestamp": "2026-04-14T12:00:00",
        "value": 5
      },
      {
        "id": "te24",
        "timestamp": "2026-04-14T15:00:00",
        "value": 40
      },
      {
        "id": "te25",
        "timestamp": "2026-04-14T18:00:00",
        "value": 5
      },
      {
        "id": "te26",
        "timestamp": "2026-04-14T21:00:00",
        "value": 40
      },
      {
        "id": "te27",
        "timestamp": "2026-04-15T00:00:00",
        "value": 5
      },
      {
        "id": "te28",
        "timestamp": "2026-04-15T03:00:00",
        "value": 40
      },
      {
        "id": "te29",
        "timestamp": "2026-04-15T06:00:00",
        "value": 5
      },
      {
        "id": "te30",
        "timestamp": "2026-04-15T09:00:00",
        "value": 40
      },
      {
        "id": "te31",
        "timestamp": "2026-04-15T12:00:00",
        "value": 5
      },
      {
        "id": "te32",
        "timestamp": "2026-04-15T15:00:00",
        "value": 40
      },
      {
        "id": "te33",
        "timestamp": "2026-04-15T18:00:00",
        "value": 5
      },
      {
        "id": "te34",
        "timestamp": "2026-04-15T21:00:00",
        "value": 40
      },
      {
        "id": "te35",
        "timestamp": "2026-04-16T00:00:00",
        "value": 5
      },
      {
        "id": "te36",
        "timestamp": "2026-04-16T03:00:00",
        "value": 40
      },
      {
        "id": "te37",
        "timestamp": "2026-04-16T06:00:00",
        "value": 5
      },
      {
        "id": "te38",
        "timestamp": "2026-04-16T09:00:00",
        "value": 40
      },
      {
        "id": "te39",
        "timestamp": "2026-04-16T12:00:00",
        "value": 5
      },
      {
        "id": "te40",
        "timestamp": "2026-04-16T15:00:00",
        "value": 40
      },
      {
        "id": "te41",
        "timestamp": "2026-04-16T18:00:00",
        "value": 5
      },
      {
        "id": "te42",
        "timestamp": "2026-04-16T21:00:00",
        "value": 40
      },
      {
        "id": "te43",
        "timestamp": "2026-04-17T00:00:00",
        "value": 5
      },
      {
        "id": "te44",
        "timestamp": "2026-04-17T03:00:00",
        "value": 40
      },
      {
        "id": "te45",
        "timestamp": "2026-04-17T06:00:00",
        "value": 5
      },
      {
        "id": "te46",
        "timestamp": "2026-04-17T09:00:00",
        "value": 40
      },
      {
        "id": "te47",
        "timestamp": "2026-04-17T12:00:00",
        "value": 5
      },
      {
        "id": "te48",
        "timestamp": "2026-04-17T15:00:00",
        "value": 40
      },
      {
        "id": "te49",
        "timestamp": "2026-04-17T18:00:00",
        "value": 5
      },
      {
        "id": "te50",
        "timestamp": "2026-04-17T21:00:00",
        "value": 40
      },
      {
        "id": "te51",
        "timestamp": "2026-04-18T00:00:00",
        "value": 5
      },
      {
        "id": "te52",
        "timestamp": "2026-04-18T03:00:00",
        "value": 40
      },
      {
        "id": "te53",
        "timestamp": "2026-04-18T06:00:00",
        "value": 5
      },
      {
        "id": "te54",
        "timestamp": "2026-04-18T09:00:00",
        "value": 40
      },
      {
        "id": "te55",
        "timestamp": "2026-04-18T12:00:00",
        "value": 5
      },
      {
        "id": "te56",
        "timestamp": "2026-04-18T15:00:00",
        "value": 40
      },
      {
        "id": "te57",
        "timestamp": "2026-04-18T18:00:00",
        "value": 5
      }
    ]
  },
  {
    "sensor": {
      "type": "air_humidity",
      "unit": "%"
    },
    "data": [
      {
        "id": "ai1",
        "timestamp": "2026-04-11T18:00:00",
        "value": 91.8
      },
      {
        "id": "ai2",
        "timestamp": "2026-04-11T21:00:00",
        "value": 94.7
      },
      {
        "id": "ai3",
        "timestamp": "2026-04-12T00:00:00",
        "value": 94.1
      },
      {
        "id": "ai4",
        "timestamp": "2026-04-12T03:00:00",
        "value": 91.8
      },
      {
        "id": "ai5",
        "timestamp": "2026-04-12T06:00:00",
        "value": 95.7
      },
      {
        "id": "ai6",
        "timestamp": "2026-04-12T09:00:00",
        "value": 93.6
      },
      {
        "id": "ai7",
        "timestamp": "2026-04-12T12:00:00",
        "value": 94.1
      },
      {
        "id": "ai8",
        "timestamp": "2026-04-12T15:00:00",
        "value": 94.1
      },
      {
        "id": "ai9",
        "timestamp": "2026-04-12T18:00:00",
        "value": 91.7
      },
      {
        "id": "ai10",
        "timestamp": "2026-04-12T21:00:00",
        "value": 94
      },
      {
        "id": "ai11",
        "timestamp": "2026-04-13T00:00:00",
        "value": 93.5
      },
      {
        "id": "ai12",
        "timestamp": "2026-04-13T03:00:00",
        "value": 98.6
      },
      {
        "id": "ai13",
        "timestamp": "2026-04-13T06:00:00",
        "value": 91.6
      },
      {
        "id": "ai14",
        "timestamp": "2026-04-13T09:00:00",
        "value": 91.2
      },
      {
        "id": "ai15",
        "timestamp": "2026-04-13T12:00:00",
        "value": 94.2
      },
      {
        "id": "ai16",
        "timestamp": "2026-04-13T15:00:00",
        "value": 95.6
      },
      {
        "id": "ai17",
        "timestamp": "2026-04-13T18:00:00",
        "value": 91.5
      },
      {
        "id": "ai18",
        "timestamp": "2026-04-13T21:00:00",
        "value": 95.6
      },
      {
        "id": "ai19",
        "timestamp": "2026-04-14T00:00:00",
        "value": 97.5
      },
      {
        "id": "ai20",
        "timestamp": "2026-04-14T03:00:00",
        "value": 92.2
      },
      {
        "id": "ai21",
        "timestamp": "2026-04-14T06:00:00",
        "value": 92
      },
      {
        "id": "ai22",
        "timestamp": "2026-04-14T09:00:00",
        "value": 92.1
      },
      {
        "id": "ai23",
        "timestamp": "2026-04-14T12:00:00",
        "value": 98.8
      },
      {
        "id": "ai24",
        "timestamp": "2026-04-14T15:00:00",
        "value": 93.2
      },
      {
        "id": "ai25",
        "timestamp": "2026-04-14T18:00:00",
        "value": 96.4
      },
      {
        "id": "ai26",
        "timestamp": "2026-04-14T21:00:00",
        "value": 93.3
      },
      {
        "id": "ai27",
        "timestamp": "2026-04-15T00:00:00",
        "value": 98.7
      },
      {
        "id": "ai28",
        "timestamp": "2026-04-15T03:00:00",
        "value": 97.3
      },
      {
        "id": "ai29",
        "timestamp": "2026-04-15T06:00:00",
        "value": 97.4
      },
      {
        "id": "ai30",
        "timestamp": "2026-04-15T09:00:00",
        "value": 97.5
      },
      {
        "id": "ai31",
        "timestamp": "2026-04-15T12:00:00",
        "value": 92.9
      },
      {
        "id": "ai32",
        "timestamp": "2026-04-15T15:00:00",
        "value": 93.2
      },
      {
        "id": "ai33",
        "timestamp": "2026-04-15T18:00:00",
        "value": 98.8
      },
      {
        "id": "ai34",
        "timestamp": "2026-04-15T21:00:00",
        "value": 94.3
      },
      {
        "id": "ai35",
        "timestamp": "2026-04-16T00:00:00",
        "value": 91.5
      },
      {
        "id": "ai36",
        "timestamp": "2026-04-16T03:00:00",
        "value": 91.1
      },
      {
        "id": "ai37",
        "timestamp": "2026-04-16T06:00:00",
        "value": 91.3
      },
      {
        "id": "ai38",
        "timestamp": "2026-04-16T09:00:00",
        "value": 91.3
      },
      {
        "id": "ai39",
        "timestamp": "2026-04-16T12:00:00",
        "value": 92
      },
      {
        "id": "ai40",
        "timestamp": "2026-04-16T15:00:00",
        "value": 95.4
      },
      {
        "id": "ai41",
        "timestamp": "2026-04-16T18:00:00",
        "value": 92.3
      },
      {
        "id": "ai42",
        "timestamp": "2026-04-16T21:00:00",
        "value": 95.5
      },
      {
        "id": "ai43",
        "timestamp": "2026-04-17T00:00:00",
        "value": 97.2
      },
      {
        "id": "ai44",
        "timestamp": "2026-04-17T03:00:00",
        "value": 93.4
      },
      {
        "id": "ai45",
        "timestamp": "2026-04-17T06:00:00",
        "value": 92.4
      },
      {
        "id": "ai46",
        "timestamp": "2026-04-17T09:00:00",
        "value": 96.8
      },
      {
        "id": "ai47",
        "timestamp": "2026-04-17T12:00:00",
        "value": 92.6
      },
      {
        "id": "ai48",
        "timestamp": "2026-04-17T15:00:00",
        "value": 98.4
      },
      {
        "id": "ai49",
        "timestamp": "2026-04-17T18:00:00",
        "value": 98.7
      },
      {
        "id": "ai50",
        "timestamp": "2026-04-17T21:00:00",
        "value": 98.1
      },
      {
        "id": "ai51",
        "timestamp": "2026-04-18T00:00:00",
        "value": 97.9
      },
      {
        "id": "ai52",
        "timestamp": "2026-04-18T03:00:00",
        "value": 95.8
      },
      {
        "id": "ai53",
        "timestamp": "2026-04-18T06:00:00",
        "value": 98.6
      },
      {
        "id": "ai54",
        "timestamp": "2026-04-18T09:00:00",
        "value": 96.7
      },
      {
        "id": "ai55",
        "timestamp": "2026-04-18T12:00:00",
        "value": 91.7
      },
      {
        "id": "ai56",
        "timestamp": "2026-04-18T15:00:00",
        "value": 95.1
      },
      {
        "id": "ai57",
        "timestamp": "2026-04-18T18:00:00",
        "value": 95.6
      }
    ]
  },
  {
    "sensor": {
      "type": "soil_moisture",
      "unit": "%"
    },
    "data": [
      {
        "id": "so1",
        "timestamp": "2026-04-11T18:00:00",
        "value": 6.5
      },
      {
        "id": "so2",
        "timestamp": "2026-04-11T21:00:00",
        "value": 2.4
      },
      {
        "id": "so3",
        "timestamp": "2026-04-12T00:00:00",
        "value": 8.7
      },
      {
        "id": "so4",
        "timestamp": "2026-04-12T03:00:00",
        "value": 1.2
      },
      {
        "id": "so5",
        "timestamp": "2026-04-12T06:00:00",
        "value": 3.1
      },
      {
        "id": "so6",
        "timestamp": "2026-04-12T09:00:00",
        "value": 5.8
      },
      {
        "id": "so7",
        "timestamp": "2026-04-12T12:00:00",
        "value": 5.3
      },
      {
        "id": "so8",
        "timestamp": "2026-04-12T15:00:00",
        "value": 4.3
      },
      {
        "id": "so9",
        "timestamp": "2026-04-12T18:00:00",
        "value": 7.8
      },
      {
        "id": "so10",
        "timestamp": "2026-04-12T21:00:00",
        "value": 4.3
      },
      {
        "id": "so11",
        "timestamp": "2026-04-13T00:00:00",
        "value": 1.7
      },
      {
        "id": "so12",
        "timestamp": "2026-04-13T03:00:00",
        "value": 7.1
      },
      {
        "id": "so13",
        "timestamp": "2026-04-13T06:00:00",
        "value": 7.5
      },
      {
        "id": "so14",
        "timestamp": "2026-04-13T09:00:00",
        "value": 8.1
      },
      {
        "id": "so15",
        "timestamp": "2026-04-13T12:00:00",
        "value": 3.8
      },
      {
        "id": "so16",
        "timestamp": "2026-04-13T15:00:00",
        "value": 3
      },
      {
        "id": "so17",
        "timestamp": "2026-04-13T18:00:00",
        "value": 8.4
      },
      {
        "id": "so18",
        "timestamp": "2026-04-13T21:00:00",
        "value": 7.4
      },
      {
        "id": "so19",
        "timestamp": "2026-04-14T00:00:00",
        "value": 2.4
      },
      {
        "id": "so20",
        "timestamp": "2026-04-14T03:00:00",
        "value": 5.7
      },
      {
        "id": "so21",
        "timestamp": "2026-04-14T06:00:00",
        "value": 7
      },
      {
        "id": "so22",
        "timestamp": "2026-04-14T09:00:00",
        "value": 5.6
      },
      {
        "id": "so23",
        "timestamp": "2026-04-14T12:00:00",
        "value": 4.7
      },
      {
        "id": "so24",
        "timestamp": "2026-04-14T15:00:00",
        "value": 8.6
      },
      {
        "id": "so25",
        "timestamp": "2026-04-14T18:00:00",
        "value": 1.4
      },
      {
        "id": "so26",
        "timestamp": "2026-04-14T21:00:00",
        "value": 5.4
      },
      {
        "id": "so27",
        "timestamp": "2026-04-15T00:00:00",
        "value": 3.6
      },
      {
        "id": "so28",
        "timestamp": "2026-04-15T03:00:00",
        "value": 6.8
      },
      {
        "id": "so29",
        "timestamp": "2026-04-15T06:00:00",
        "value": 1.9
      },
      {
        "id": "so30",
        "timestamp": "2026-04-15T09:00:00",
        "value": 7.3
      },
      {
        "id": "so31",
        "timestamp": "2026-04-15T12:00:00",
        "value": 9
      },
      {
        "id": "so32",
        "timestamp": "2026-04-15T15:00:00",
        "value": 3.4
      },
      {
        "id": "so33",
        "timestamp": "2026-04-15T18:00:00",
        "value": 6.7
      },
      {
        "id": "so34",
        "timestamp": "2026-04-15T21:00:00",
        "value": 6.3
      },
      {
        "id": "so35",
        "timestamp": "2026-04-16T00:00:00",
        "value": 3.8
      },
      {
        "id": "so36",
        "timestamp": "2026-04-16T03:00:00",
        "value": 6.9
      },
      {
        "id": "so37",
        "timestamp": "2026-04-16T06:00:00",
        "value": 7.4
      },
      {
        "id": "so38",
        "timestamp": "2026-04-16T09:00:00",
        "value": 8.2
      },
      {
        "id": "so39",
        "timestamp": "2026-04-16T12:00:00",
        "value": 3
      },
      {
        "id": "so40",
        "timestamp": "2026-04-16T15:00:00",
        "value": 5.1
      },
      {
        "id": "so41",
        "timestamp": "2026-04-16T18:00:00",
        "value": 7
      },
      {
        "id": "so42",
        "timestamp": "2026-04-16T21:00:00",
        "value": 4.5
      },
      {
        "id": "so43",
        "timestamp": "2026-04-17T00:00:00",
        "value": 3.2
      },
      {
        "id": "so44",
        "timestamp": "2026-04-17T03:00:00",
        "value": 5.2
      },
      {
        "id": "so45",
        "timestamp": "2026-04-17T06:00:00",
        "value": 2.2
      },
      {
        "id": "so46",
        "timestamp": "2026-04-17T09:00:00",
        "value": 5.3
      },
      {
        "id": "so47",
        "timestamp": "2026-04-17T12:00:00",
        "value": 8.3
      },
      {
        "id": "so48",
        "timestamp": "2026-04-17T15:00:00",
        "value": 1.6
      },
      {
        "id": "so49",
        "timestamp": "2026-04-17T18:00:00",
        "value": 6.6
      },
      {
        "id": "so50",
        "timestamp": "2026-04-17T21:00:00",
        "value": 5.3
      },
      {
        "id": "so51",
        "timestamp": "2026-04-18T00:00:00",
        "value": 1.5
      },
      {
        "id": "so52",
        "timestamp": "2026-04-18T03:00:00",
        "value": 3.6
      },
      {
        "id": "so53",
        "timestamp": "2026-04-18T06:00:00",
        "value": 6.5
      },
      {
        "id": "so54",
        "timestamp": "2026-04-18T09:00:00",
        "value": 7
      },
      {
        "id": "so55",
        "timestamp": "2026-04-18T12:00:00",
        "value": 5.3
      },
      {
        "id": "so56",
        "timestamp": "2026-04-18T15:00:00",
        "value": 6.7
      },
      {
        "id": "so57",
        "timestamp": "2026-04-18T18:00:00",
        "value": 6.6
      }
    ]
  },
  {
    "sensor": {
      "type": "light_intensity",
      "unit": "Lux"
    },
    "data": [
      {
        "id": "li1",
        "timestamp": "2026-04-11T18:00:00",
        "value": 50
      },
      {
        "id": "li2",
        "timestamp": "2026-04-11T21:00:00",
        "value": 50
      },
      {
        "id": "li3",
        "timestamp": "2026-04-12T00:00:00",
        "value": 50
      },
      {
        "id": "li4",
        "timestamp": "2026-04-12T03:00:00",
        "value": 50
      },
      {
        "id": "li5",
        "timestamp": "2026-04-12T06:00:00",
        "value": 50
      },
      {
        "id": "li6",
        "timestamp": "2026-04-12T09:00:00",
        "value": 50
      },
      {
        "id": "li7",
        "timestamp": "2026-04-12T12:00:00",
        "value": 50
      },
      {
        "id": "li8",
        "timestamp": "2026-04-12T15:00:00",
        "value": 50
      },
      {
        "id": "li9",
        "timestamp": "2026-04-12T18:00:00",
        "value": 50
      },
      {
        "id": "li10",
        "timestamp": "2026-04-12T21:00:00",
        "value": 50
      },
      {
        "id": "li11",
        "timestamp": "2026-04-13T00:00:00",
        "value": 50
      },
      {
        "id": "li12",
        "timestamp": "2026-04-13T03:00:00",
        "value": 50
      },
      {
        "id": "li13",
        "timestamp": "2026-04-13T06:00:00",
        "value": 50
      },
      {
        "id": "li14",
        "timestamp": "2026-04-13T09:00:00",
        "value": 50
      },
      {
        "id": "li15",
        "timestamp": "2026-04-13T12:00:00",
        "value": 50
      },
      {
        "id": "li16",
        "timestamp": "2026-04-13T15:00:00",
        "value": 50
      },
      {
        "id": "li17",
        "timestamp": "2026-04-13T18:00:00",
        "value": 50
      },
      {
        "id": "li18",
        "timestamp": "2026-04-13T21:00:00",
        "value": 50
      },
      {
        "id": "li19",
        "timestamp": "2026-04-14T00:00:00",
        "value": 50
      },
      {
        "id": "li20",
        "timestamp": "2026-04-14T03:00:00",
        "value": 50
      },
      {
        "id": "li21",
        "timestamp": "2026-04-14T06:00:00",
        "value": 50
      },
      {
        "id": "li22",
        "timestamp": "2026-04-14T09:00:00",
        "value": 50
      },
      {
        "id": "li23",
        "timestamp": "2026-04-14T12:00:00",
        "value": 50
      },
      {
        "id": "li24",
        "timestamp": "2026-04-14T15:00:00",
        "value": 50
      },
      {
        "id": "li25",
        "timestamp": "2026-04-14T18:00:00",
        "value": 50
      },
      {
        "id": "li26",
        "timestamp": "2026-04-14T21:00:00",
        "value": 50
      },
      {
        "id": "li27",
        "timestamp": "2026-04-15T00:00:00",
        "value": 50
      },
      {
        "id": "li28",
        "timestamp": "2026-04-15T03:00:00",
        "value": 50
      },
      {
        "id": "li29",
        "timestamp": "2026-04-15T06:00:00",
        "value": 50
      },
      {
        "id": "li30",
        "timestamp": "2026-04-15T09:00:00",
        "value": 50
      },
      {
        "id": "li31",
        "timestamp": "2026-04-15T12:00:00",
        "value": 50
      },
      {
        "id": "li32",
        "timestamp": "2026-04-15T15:00:00",
        "value": 50
      },
      {
        "id": "li33",
        "timestamp": "2026-04-15T18:00:00",
        "value": 50
      },
      {
        "id": "li34",
        "timestamp": "2026-04-15T21:00:00",
        "value": 50
      },
      {
        "id": "li35",
        "timestamp": "2026-04-16T00:00:00",
        "value": 50
      },
      {
        "id": "li36",
        "timestamp": "2026-04-16T03:00:00",
        "value": 50
      },
      {
        "id": "li37",
        "timestamp": "2026-04-16T06:00:00",
        "value": 50
      },
      {
        "id": "li38",
        "timestamp": "2026-04-16T09:00:00",
        "value": 50
      },
      {
        "id": "li39",
        "timestamp": "2026-04-16T12:00:00",
        "value": 50
      },
      {
        "id": "li40",
        "timestamp": "2026-04-16T15:00:00",
        "value": 50
      },
      {
        "id": "li41",
        "timestamp": "2026-04-16T18:00:00",
        "value": 50
      },
      {
        "id": "li42",
        "timestamp": "2026-04-16T21:00:00",
        "value": 50
      },
      {
        "id": "li43",
        "timestamp": "2026-04-17T00:00:00",
        "value": 50
      },
      {
        "id": "li44",
        "timestamp": "2026-04-17T03:00:00",
        "value": 50
      },
      {
        "id": "li45",
        "timestamp": "2026-04-17T06:00:00",
        "value": 50
      },
      {
        "id": "li46",
        "timestamp": "2026-04-17T09:00:00",
        "value": 50
      },
      {
        "id": "li47",
        "timestamp": "2026-04-17T12:00:00",
        "value": 50
      },
      {
        "id": "li48",
        "timestamp": "2026-04-17T15:00:00",
        "value": 50
      },
      {
        "id": "li49",
        "timestamp": "2026-04-17T18:00:00",
        "value": 50
      },
      {
        "id": "li50",
        "timestamp": "2026-04-17T21:00:00",
        "value": 50
      },
      {
        "id": "li51",
        "timestamp": "2026-04-18T00:00:00",
        "value": 50
      },
      {
        "id": "li52",
        "timestamp": "2026-04-18T03:00:00",
        "value": 50
      },
      {
        "id": "li53",
        "timestamp": "2026-04-18T06:00:00",
        "value": 50
      },
      {
        "id": "li54",
        "timestamp": "2026-04-18T09:00:00",
        "value": 50
      },
      {
        "id": "li55",
        "timestamp": "2026-04-18T12:00:00",
        "value": 50
      },
      {
        "id": "li56",
        "timestamp": "2026-04-18T15:00:00",
        "value": 50
      },
      {
        "id": "li57",
        "timestamp": "2026-04-18T18:00:00",
        "value": 50
      }
    ]
  }
]);
  })  

  return router;
}