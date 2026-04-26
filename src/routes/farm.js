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

  return router;
}