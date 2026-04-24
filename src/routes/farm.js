import express from "express";
import { verifyUser } from "../services/authService.js";

export function createStatesRouter({ actualState }) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : req.query.token;

    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    try {
      const { unauthorized, user_id } = await verifyUser(token);

      if (unauthorized) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      console.log("Verified user_id:", user_id);
      return res.json(actualState);
    } catch (error) {
      console.error("Token verification failed:", error);
      return res.status(500).json({ error: "Failed to verify token" });
    }
  });

  return router;
}
