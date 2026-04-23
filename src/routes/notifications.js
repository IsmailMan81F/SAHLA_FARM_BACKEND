import express from "express";
import { verifyUser } from "../services/authService.js";
import { verifyHomeassistantCredentials } from "../services/homeassistantService.js";
import { fetchUserUnreadNotifications, fetchFarmNotifications } from "../services/notificationsService.js";

export function createNotificationsRouter() {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : req.query.token;

    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const limit = Number(req.query.limit) || 10;
    if (limit <= 0) {
      return res.status(400).json({ error: "limit must be a positive number" });
    }

    try {
      const { unauthorized, user_id } = await verifyUser(token);
      if (unauthorized) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      const haResult = await verifyHomeassistantCredentials(user_id);
      if (haResult.status !== "valid") {
        return res.status(400).json({ error: haResult.message || "Home Assistant credentials are not valid" });
      }

      const farmId = haResult.farm_id;
      if (!farmId) {
        return res.status(400).json({ error: "Could not determine farm for current user" });
      }

      const userLimit = Math.min(limit, 2);
      const { success: userSuccess, notifications: userNotifications, error: userError } = await fetchUserUnreadNotifications(user_id, userLimit);
      if (!userSuccess) {
        console.error("Failed to fetch user notifications:", userError);
        return res.status(500).json({ error: "Failed to load user notifications" });
      }

      const farmLimit = limit - (userNotifications?.length || 0);
      let farmNotifications = [];
      if (farmLimit > 0) {
        const { success: farmSuccess, notifications, error: farmError } = await fetchFarmNotifications(farmId, farmLimit);
        if (!farmSuccess) {
          console.error("Failed to fetch farm notifications:", farmError);
          return res.status(500).json({ error: "Failed to load farm notifications" });
        }
        farmNotifications = notifications;
      }

      return res.json({ notifications: [...(userNotifications || []), ...(farmNotifications || [])] });
    } catch (error) {
      console.error("Failed to load notifications:", error);
      return res.status(500).json({ error: "Failed to load notifications" });
    }
  });

  return router;
}
