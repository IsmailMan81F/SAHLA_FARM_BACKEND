import express from "express";
import { verifyUser } from "../services/authService.js";
import { createUserProfile } from "../services/userService.js";
import { createWelcomeNotification } from "../services/notificationService.js";

export function createAuthRouter() {
  const router = express.Router();

  router.post("/signupSetup", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : req.body?.token;

    if (!token) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    try {
      const { unauthorized, user_id } = await verifyUser(token);

      if (unauthorized) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      const { username, email, age, address } = req.body;
      const normalizedAge = Number(age);

      if (!username || Number.isNaN(normalizedAge) || !address) {
        return res.status(400).json({ error: "username, age, and address are required and age must be a number" });
      }

      const { success, user, error } = await createUserProfile({
        id: user_id,
        email,
        username,
        age: normalizedAge,
        address,
      });

      if (!success) {
        console.error("Failed to create user profile:", error);
        return res.status(400).json({ error: error.message || "User creation failed" });
      }

      // Create welcome notification
      const notifResult = await createWelcomeNotification(user_id);
      if (!notifResult.success) {
        console.error("Failed to create welcome notification:", notifResult.error);
        // Continue with success response even if notification fails
      }

      return res.status(201).json({ message: "User created successfully", user });
    } catch (err) {
      console.error("signupSetup failed:", err);
      return res.status(500).json({ error: "Failed to complete signup setup" });
    }
  });

  return router;
}
