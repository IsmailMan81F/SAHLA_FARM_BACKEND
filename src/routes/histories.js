import express from "express";
import {
  verifyAccessToken,
  getUserHaTokens,
  getActiveFarmToken,
  getFarmById,
  fetchHistoryById,
  fetchHistoryPaginated,
} from "../services/historyService.js";
import { verifyHomeassistantCredentials } from "../services/homeassistantService.js";

export function createHistoryRouter() {
  const router = express.Router();

  /**
   * Helper function to validate access token and get HA credentials
   * Returns { valid, user_id, ha_url, ha_token, error, errorStatus }
   */
  async function validateAndGetHaCredentials(req) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : req.query.token;

    if (!token) {
      return {
        valid: false,
        user_id: null,
        ha_url: null,
        ha_token: null,
        error: "Authorization token is required",
        errorStatus: 401,
      };
    }

    // Verify access token with Supabase
    const { unauthorized, user_id } = await verifyAccessToken(token);
    if (unauthorized || !user_id) {
      return {
        valid: false,
        user_id: null,
        ha_url: null,
        ha_token: null,
        error: "Invalid or expired token",
        errorStatus: 401,
      };
    }

    // Get user's HA tokens from user_ha table
    const {
      success: tokensSuccess,
      tokens,
      error: tokensError,
    } = await getUserHaTokens(user_id);
    if (!tokensSuccess || !tokens || tokens.length === 0) {
      return {
        valid: false,
        user_id,
        ha_url: null,
        ha_token: null,
        error:
          "Home Assistant credentials not set. Please configure HA credentials first.",
        errorStatus: 400,
      };
    }

    // Search for active farm token for each HA token
    let activeFarmToken = null;
    let activeHaToken = null;

    for (const tokenRow of tokens) {
      const haToken = tokenRow.ha_token;
      if (!haToken) continue;

      const {
        success: farmTokenSuccess,
        farmToken,
        error: farmTokenError,
      } = await getActiveFarmToken(haToken);

      if (farmTokenSuccess && farmToken) {
        activeFarmToken = farmToken;
        activeHaToken = haToken;
        break;
      }
    }

    // All tokens are expired
    if (!activeFarmToken) {
      return {
        valid: false,
        user_id,
        ha_url: null,
        ha_token: null,
        error:
          "All Home Assistant tokens are expired. Please update your HA credentials.",
        errorStatus: 401,
      };
    }

    // Get farm by ID
    const {
      success: farmSuccess,
      farm,
      error: farmError,
    } = await getFarmById(activeFarmToken.farm_id);
    if (!farmSuccess || !farm) {
      return {
        valid: false,
        user_id,
        ha_url: null,
        ha_token: null,
        error: "Farm not found",
        errorStatus: 404,
      };
    }

    const haUrl = farm.ha_url;

    // Verify HA credentials
    const haResult = await verifyHomeassistantCredentials(user_id);
    if (!haResult.offlineMode) {
      return {
        valid: false,
        user_id,
        ha_url: null,
        ha_token: null,
        error: haResult.message || "Home Assistant credentials are not valid",
        errorStatus: 401,
      };
    }

    return {
      valid: true,
      user_id,
      ha_url: haUrl,
      ha_token: activeHaToken,
      farm_id: activeFarmToken.farm_id,
      error: null,
      errorStatus: null,
    };
  }

  /**
   * GET /history?offset=x&limit=y
   * Get paginated history list with crop and weather data
   */
  router.get("/", async (req, res) => {
    try {
      // Validate offset and limit
      const offset = Number(req.query.offset) || 0;
      const limit = Number(req.query.limit) || 10;

      if (offset < 0) {
        return res.status(400).json({ error: "offset must be a non-negative number" });
      }

      if (limit <= 0) {
        return res.status(400).json({ error: "limit must be a positive number" });
      }

      if (limit > 100) {
        return res.status(400).json({ error: "limit cannot exceed 100" });
      }

      // Validate token and get HA credentials
      const validation = await validateAndGetHaCredentials(req);
      
      if (!validation.valid) {
        return res.status(validation.errorStatus).json({ error: validation.error });
      }

      const { farm_id } = validation;

      // Fetch paginated history
      const { success, data, error } = await fetchHistoryPaginated(farm_id, offset, limit);

      if (!success) {
        console.error("Failed to fetch paginated history:", error);
        return res.status(500).json({ error: "Failed to load history" });
      }

      return res.status(200).json({ 
        history: data || []
      });

    } catch (err) {
      console.error("Paginated history error:", err);
      return res.status(500).json({ error: "Failed to load history" });
    }
  });

  /**
   * GET /history/:id
   * Get specific history by ID with all related data (crop, sensors, actuators, weather, recommendation)
   */
  router.get("/:id", async (req, res) => {
    try {
      const { id: historyId } = req.params;

      if (!historyId) {
        return res.status(400).json({ error: "History ID is required" });
      }

      // Validate token and get HA credentials
      const validation = await validateAndGetHaCredentials(req);

      if (!validation.valid) {
        return res
          .status(validation.errorStatus)
          .json({ error: validation.error });
      }

      const { farm_id, user_id } = validation;

      // Fetch history by ID with all related data
      const { success, data, error } = await fetchHistoryById(
        farm_id,
        historyId,
        user_id,
      );

      if (!success) {
        console.error("Failed to fetch history:", error);
        return res.status(500).json({ error: "Failed to load history" });
      }

      if (!data?.run) {
        return res.status(404).json({ error: "History not found" });
      }

      return res.status(200).json(data);
    } catch (err) {
      console.error("History detail error:", err);
      return res.status(500).json({ error: "Failed to load history" });
    }
  });

  return router;
}
