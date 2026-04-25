import express from "express";
import crypto from "crypto";
import { supabase } from "../libs/supabaseClient.js";
import { verifyUser } from "../services/authService.js";
import { createUserProfile, updateUserLastLogin } from "../services/userService.js";
import { createWelcomeNotification, createLoginNotification } from "../services/notificationService.js";

export function createAuthRouter() {
  const router = express.Router();

  router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data?.session?.access_token) {
        console.error("Login failed:", error);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      return res.status(200).json({
        message: "Login successful",
        token: data.session.access_token,
        user_id: data.user.id,
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  router.post("/signup", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error || !data?.user?.id) {
        console.error("Signup failed:", error);
        return res.status(400).json({ error: error?.message || "Signup failed" });
      }

      console.log(data)
      return res.status(201).json({
        message: "User created successfully",
        user_id: data.user.id,
        token: data.session?.access_token || null,
      });
    } catch (err) {
      console.error("Signup error:", err);
      return res.status(500).json({ error: "Signup failed" });
    }
  });

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

      // Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("id", user_id)
        .maybeSingle();

      if (checkError) {
        console.error("Failed to check user existence:", checkError);
        return res.status(500).json({ error: "Failed to check user existence" });
      }

      let user;
      if (existingUser) {
        // User exists, update the profile
        const now = new Date().toISOString();
        const { data: updatedUser, error: updateError } = await supabase
          .from("users")
          .update({
            email,
            username,
            age: normalizedAge,
            address,
            updated_at: now,
          })
          .eq("id", user_id)
          .select()
          .single();

        if (updateError) {
          console.error("Failed to update user profile:", updateError);
          return res.status(400).json({ error: updateError.message || "User update failed" });
        }

        user = updatedUser;
      } else {
        // User doesn't exist, create new profile
        const { success, user: newUser, error } = await createUserProfile({
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

        user = newUser;
      }

      const preferencesUnits = [
        { id: crypto.randomUUID(), user_id, name: "temperature", symbol: "°C" },
        { id: crypto.randomUUID(), user_id, name: "humidity", symbol: "%" },
        { id: crypto.randomUUID(), user_id, name: "soil moisture", symbol: "%" },
        { id: crypto.randomUUID(), user_id, name: "luminosity", symbol: "lux" },
      ];

      // Check if preferences already exist
      const { data: existingUnits, error: unitsCheckError } = await supabase
        .from("preferences_unit")
        .select("id")
        .eq("user_id", user_id);

      if (unitsCheckError) {
        console.error("Failed to check existing preferences_unit:", unitsCheckError);
        return res.status(500).json({ error: "Failed to check user preferences" });
      }

      if (!existingUnits || existingUnits.length === 0) {
        const { error: unitsError } = await supabase
          .from("preferences_unit")
          .insert(preferencesUnits);

        if (unitsError) {
          console.error("Failed to insert preferences_unit records:", unitsError);
          return res.status(500).json({ error: "Failed to create user preferences" });
        }
      }

      // Check if language preference already exists
      const { data: existingLanguage, error: languageCheckError } = await supabase
        .from("preferences_language")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      if (languageCheckError) {
        console.error("Failed to check existing preferences_language:", languageCheckError);
        return res.status(500).json({ error: "Failed to check user language preference" });
      }

      if (!existingLanguage) {
        const { error: languageError } = await supabase
          .from("preferences_language")
          .insert([
            {
              id: crypto.randomUUID(),
              user_id,
              language: "english",
            },
          ]);

        if (languageError) {
          console.error("Failed to insert preferences_language record:", languageError);
          return res.status(500).json({ error: "Failed to create user language preference" });
        }
      }

      // Create welcome notification
      const notifResult = await createWelcomeNotification(user_id);
      if (!notifResult.success) {
        console.error("Failed to create welcome notification:", notifResult.error);
        // Continue with success response even if notification fails
      }

      return res.status(201).json({ message: "User setup completed successfully" });
    } catch (err) {
      console.error("signupSetup failed:", err);
      return res.status(500).json({ error: "Failed to complete signup setup" });
    }
  });

  router.post("/loginSetup", async (req, res) => {
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

      const { success: loginUpdateSuccess, error: loginUpdateError } = await updateUserLastLogin(user_id);
      if (!loginUpdateSuccess) {
        console.error("Failed to update user last_login_at:", loginUpdateError);
        return res.status(400).json({ error: loginUpdateError.message || "Failed to update login timestamp" });
      }

      const notifyResult = await createLoginNotification(user_id);
      if (!notifyResult.success) {
        console.error("Failed to create login notification:", notifyResult.error);
        // Continue with success response even if notification fails
      }

      return res.status(200).json({ message: "Login setup completed successfully" });
    } catch (err) {
      console.error("loginSetup failed:", err);
      return res.status(500).json({ error: "Failed to complete login setup" });
    }
  });

  return router;
}
