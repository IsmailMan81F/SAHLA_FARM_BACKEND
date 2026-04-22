import express from "express";
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
    const { email, username, age, password, address } = req.body;

    if (!email || !username || !password || !address || age === undefined) {
      return res.status(400).json({
        error: "Email, username, password, age, and address are required",
      });
    }

    const normalizedAge = Number(age);
    if (Number.isNaN(normalizedAge)) {
      return res.status(400).json({ error: "Age must be a valid number" });
    }

    try {
      // Check if email already exists in users table
      const { data: existingEmail } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

      if (existingEmail) {
        return res.status(409).json({ error: "User already exists" });
      }

      // Check if username already exists in users table
      const { data: existingUsername } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .single();

      if (existingUsername) {
        return res.status(409).json({ error: "User already exists" });
      }

      // Create auth user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUpWithPassword({
        email,
        password,
      });

      if (authError || !authData?.user?.id) {
        console.error("Auth signup failed:", authError);
        return res.status(400).json({ error: authError?.message || "Signup failed" });
      }

      // Create user profile in users table
      const now = new Date().toISOString();
      const { data: userData, error: userError } = await supabase.from("users").insert([
        {
          id: authData.user.id,
          email,
          username,
          age: normalizedAge,
          address,
          created_at: now,
          updated_at: now,
        },
      ]);

      if (userError) {
        console.error("Failed to create user profile:", userError);
        return res.status(400).json({ error: "Failed to create user profile" });
      }

      return res.status(201).json({
        message: "User registered successfully",
        user_id: authData.user.id,
        token: authData.session?.access_token || null,
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
