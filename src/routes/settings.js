import express from "express";
import crypto from "crypto";
import { supabase } from "../libs/supabaseClient.js";
import { verifyUser } from "../services/authService.js";
import { verifyHomeassistantCredentials } from "../services/homeassistantService.js";

function formatLanguage(value) {
  if (!value) return "English";
  const normalized = String(value).toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeUrl(url) {
  return url.replace(/\/$/, "");
}

// Generate safe 20-char ID
function generateHaId() {
  return crypto.randomBytes(10).toString("hex"); // 20 chars
}

// Call Home Assistant helper state
async function getHaHelper(haUrl, haToken) {
  const res = await fetch(
    `${normalizeUrl(haUrl)}/api/states/input_text.ha_instance_id`,
    {
      headers: {
        Authorization: `Bearer ${haToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!res.ok) return null;

  const data = await res.json();

  return data?.state || null;
}

export function createSettingsRouter() {
  const router = express.Router();

  router.get("/profile", async (req, res) => {
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

      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("id, username, email, age, address, avatar_url")
        .eq("id", user_id)
        .single();

      if (userError || !userRow) {
        console.error("Failed to fetch user profile:", userError);
        return res.status(404).json({ error: "User profile not found" });
      }

      const { data: unitRows, error: unitError } = await supabase
        .from("preferences_unit")
        .select("name, symbol")
        .eq("user_id", user_id);

      if (unitError) {
        console.error("Failed to fetch preference units:", unitError);
        return res
          .status(500)
          .json({ error: "Failed to fetch user preferences" });
      }

      const displayUnits = {
        temperature: null,
        humidity: null,
        soilMoisture: null,
        luminosity: null,
      };

      for (const row of unitRows || []) {
        if (!row?.name) continue;

        switch (row.name.toLowerCase()) {
          case "temperature":
            displayUnits.temperature = row.symbol;
            break;
          case "humidity":
            displayUnits.humidity = row.symbol;
            break;
          case "soil moisture":
            displayUnits.soilMoisture = row.symbol;
            break;
          case "luminosity":
            displayUnits.luminosity = row.symbol;
            break;
          default:
            break;
        }
      }

      const { data: languageRow, error: languageError } = await supabase
        .from("preferences_language")
        .select("language")
        .eq("user_id", user_id)
        .single();

      if (languageError) {
        console.error("Failed to fetch language preference:", languageError);
      }

      const language = formatLanguage(languageRow?.language);

      const haCredentials = await verifyHomeassistantCredentials(user_id);
      const isHaValid = haCredentials?.status === "valid";
      const haUrl = isHaValid ? haCredentials.ha_url || null : null;
      const haStatus = isHaValid ? "online" : "offline";

      return res.status(200).json({
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
        age: userRow.age,
        address: userRow.address ?? null,
        avatarUrl: userRow.avatar_url ?? null,
        haUrl,
        haStatus,
        preferences: {
          displayUnits,
          language,
        },
      });
    } catch (err) {
      console.error("Failed to load settings profile:", err);
      return res.status(500).json({ error: "Failed to load profile settings" });
    }
  });

  router.post("/editUnit", async (req, res) => {
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

      const { name, unit } = req.body;

      if (!name || !unit) {
        return res.status(400).json({ error: "name and unit are required" });
      }

      const validNames = [
        "temperature",
        "humidity",
        "soil moisture",
        "luminosity",
      ];
      if (!validNames.includes(name.toLowerCase())) {
        return res.status(400).json({
          error:
            "Invalid unit name. Must be one of: temperature, humidity, soil moisture, luminosity",
        });
      }

      const { data, error } = await supabase
        .from("preferences_unit")
        .update({ symbol: unit })
        .eq("user_id", user_id)
        .eq("name", name.toLowerCase())
        .select();

      if (error) {
        console.error("Failed to update preference unit:", error);
        return res
          .status(500)
          .json({ error: "Failed to update preference unit" });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Preference unit not found" });
      }

      return res.status(200).json({
        message: "Unit preference updated successfully",
        data: {
          name: data[0].name,
          symbol: data[0].symbol,
        },
      });
    } catch (err) {
      console.error("Failed to update unit preference:", err);
      return res
        .status(500)
        .json({ error: "Failed to update unit preference" });
    }
  });

  router.post("/editLanguage", async (req, res) => {
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

      const { language } = req.body;

      if (!language) {
        return res.status(400).json({ error: "language is required" });
      }

      const validLanguages = ["arabic", "english", "french"];
      if (!validLanguages.includes(language.toLowerCase())) {
        return res.status(400).json({
          error: "Invalid language. Must be one of: arabic, english, french",
        });
      }

      const { data, error } = await supabase
        .from("preferences_language")
        .update({ language: language.toLowerCase() })
        .eq("user_id", user_id)
        .select();

      if (error) {
        console.error("Failed to update preference language:", error);
        return res
          .status(500)
          .json({ error: "Failed to update preference language" });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Language preference not found" });
      }

      return res.status(200).json({
        message: "Language preference updated successfully",
        data: {
          language: formatLanguage(data[0].language),
        },
      });
    } catch (err) {
      console.error("Failed to update language preference:", err);
      return res
        .status(500)
        .json({ error: "Failed to update language preference" });
    }
  });

  router.post("/editProfile", async (req, res) => {
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

      const { username, email, address, age, currentPassword, newPassword } =
        req.body;

      // Check for duplicate email (excluding current user)
      if (email) {
        const { data: emailExists } = await supabase
          .from("users")
          .select("id")
          .eq("email", email)
          .neq("id", user_id)
          .maybeSingle();

        if (emailExists) {
          return res.status(409).json({ error: "Email is already used" });
        }
      }

      // Check for duplicate username (excluding current user)
      if (username) {
        const { data: usernameExists } = await supabase
          .from("users")
          .select("id")
          .eq("username", username)
          .neq("id", user_id)
          .maybeSingle();

        if (usernameExists) {
          return res.status(409).json({ error: "Username is already used" });
        }
      }

      // Get current user email for password verification
      const { data: userData, error: userFetchError } = await supabase
        .from("users")
        .select("email")
        .eq("id", user_id)
        .single();

      if (userFetchError || !userData?.email) {
        console.error("Failed to fetch user:", userFetchError);
        return res.status(500).json({ error: "Failed to fetch user data" });
      }

      // Handle password change
      const passwordBothEmpty = !currentPassword && !newPassword;
      const passwordBothProvided = currentPassword && newPassword;

      if (!passwordBothEmpty && !passwordBothProvided) {
        return res.status(400).json({
          error:
            "Both currentPassword and newPassword must be provided together or both empty",
        });
      }

      if (passwordBothProvided) {
        // Validate new password length
        if (newPassword.length < 6) {
          return res.status(400).json({
            error: "New password must contain more than 6 characters",
          });
        }

        // Verify current password by attempting sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userData.email,
          password: currentPassword,
        });

        if (signInError) {
          console.error("Current password verification failed:", signInError);
          return res
            .status(401)
            .json({ error: "Current password is incorrect" });
        }
        // Use the ADMIN API instead
        const { data: updatedAuthUser, error: updateAuthError } =
          await supabase.auth.admin.updateUserById(
            user_id, // You must pass the ID here explicitly
            { password: newPassword },
          );

        if (updateAuthError) {
          console.error("Failed to update password:", updateAuthError);
          return res.status(500).json({ error: "Failed to update password" });
        }
      }

      // Update user profile in users table
      const updateData = {};
      if (username !== undefined) updateData.username = username;
      if (email !== undefined) updateData.email = email;
      if (address !== undefined) updateData.address = address;
      if (age !== undefined) updateData.age = Number(age);
      updateData.updated_at = new Date().toISOString();

      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", user_id)
        .select();
      if (updateError) {
        console.error("Failed to update user profile:", updateError);
        return res.status(500).json({ error: "Failed to update user profile" });
      }

      return res.status(200).json({
        message: "Profile updated successfully"
      });
    } catch (err) {
      console.error("Failed to edit profile:", err);
      return res.status(500).json({ error: "Failed to edit profile" });
    }
  });

  router.post("/editAvatarUrl", async (req, res) => {
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

      const { avatarUrl } = req.body;

      if (!avatarUrl) {
        return res.status(400).json({ error: "avatarUrl is required" });
      }

      const { data, error } = await supabase
        .from("users")
        .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq("id", user_id)
        .select();

      if (error) {
        console.error("Failed to update avatar:", error);
        return res.status(500).json({ error: "Failed to update avatar" });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        message: "Avatar updated successfully",
        data: {
          avatarUrl: data[0].avatar_url,
        },
      });
    } catch (err) {
      console.error("Failed to update avatar:", err);
      return res.status(500).json({ error: "Failed to update avatar" });
    }
  });

  router.post("/editHaCredentials", async (req, res) => {
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

      const { haUrl, haToken } = req.body;
      if (!haUrl || !haToken) {
        return res
          .status(400)
          .json({ error: "haUrl and haToken are required" });
      }

      const baseUrl = normalizeUrl(haUrl);

      // ===============================
      // 1. VERIFY HA IS REACHABLE
      // ===============================
      let haResponse;
      try {
        haResponse = await fetch(`${baseUrl}/api/config`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${haToken}`,
            Accept: "application/json",
          },
        });
      } catch (fetchError) {
        console.error("Failed to reach Home Assistant:", fetchError);
        return res.status(503).json({
          status: "offline",
          error: "Home Assistant server is unreachable",
        });
      }

      if (!haResponse.ok) {
        return res.status(401).json({
          status: "offline",
          error: "Invalid Home Assistant credentials",
        });
      }

      // ===============================
      // 2. CHECK THE HELPER VALUE
      // ===============================
      const helperRes = await fetch(
        `${baseUrl}/api/states/input_text.ha_instance_id`,
        {
          headers: {
            Authorization: `Bearer ${haToken}`,
            Accept: "application/json",
          },
        },
      );

      let ha_instance_id = null;

      if (helperRes.ok) {
        const helperData = await helperRes.json();
        const helperValue = helperData?.state;

        if (
          !helperValue ||
          helperValue === "unknown" ||
          helperValue.trim() === ""
        ) {
          // ── Helper exists but is EMPTY → write a new ID into it
          ha_instance_id = generateHaId();

          await fetch(`${baseUrl}/api/services/input_text/set_value`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${haToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              entity_id: "input_text.ha_instance_id",
              value: ha_instance_id,
            }),
          });
        } else {
          // ── Helper exists and has a VALUE → use it
          ha_instance_id = helperValue;
        }
      } else {
        // ── Helper does NOT exist → return error, user must create it manually in HA
        return res.status(400).json({
          status: "offline",
          error:
            "input_text.ha_instance_id helper not found. Please create it manually in Home Assistant (Settings > Helpers > Add Helper > Text).",
        });
      }

      // ===============================
      // 3. FIND OR CREATE FARM
      // ===============================
      const { data: existingFarm, error: farmCheckError } = await supabase
        .from("farm")
        .select("id, ha_url")
        .eq("ha_instance_id", ha_instance_id)
        .maybeSingle();

      if (farmCheckError) {
        console.error("Failed to check existing farm:", farmCheckError);
        return res.status(500).json({ error: "Failed to check existing farm" });
      }

      let farm_id;

      if (existingFarm) {
        // Farm found → update URL in case it changed (e.g. ngrok)
        await supabase
          .from("farm")
          .update({ ha_url: haUrl })
          .eq("id", existingFarm.id);
        farm_id = existingFarm.id;
      } else {
        // Farm not found → create a new one
        farm_id = crypto.randomUUID();
        const { error: newFarmError } = await supabase
          .from("farm")
          .insert([{ id: farm_id, ha_url: haUrl, ha_instance_id }]);

        if (newFarmError) {
          console.error("Failed to create farm:", newFarmError);
          return res.status(500).json({ error: "Failed to create farm" });
        }
      }

      // ===============================
      // 4. EXPIRE OLD TOKENS & INSERT NEW ONE
      // ===============================

      // Fetch all previous HA tokens for this user
      const { data: userHaTokens, error: userHaError } = await supabase
        .from("user_ha")
        .select("ha_token")
        .eq("user_id", user_id);

      if (userHaError) {
        console.error("Failed to fetch user HA tokens:", userHaError);
        return res
          .status(500)
          .json({ error: "Failed to fetch user HA tokens" });
      }

      // Mark all previous tokens as expired
      for (const { ha_token } of userHaTokens || []) {
        await supabase
          .from("farm_tokens")
          .update({ status: "expired" })
          .eq("ha_token", ha_token);
      }

      // Check whether the same active token already exists for this farm/user
      const { data: existingToken, error: existingTokenError } = await supabase
        .from("farm_tokens")
        .select()
        .eq("farm_id", farm_id)
        .eq("ha_token", haToken)
        .maybeSingle();

      if (existingTokenError) {
        console.error(
          "Failed to check existing farm token:",
          existingTokenError,
        );
        return res
          .status(500)
          .json({ error: "Failed to check existing farm token" });
      }

      if (existingToken?.status === "active") {
        // The same active token has already been stored, no need to insert again.
      } else if (existingToken) {
        console.log(existingToken)
        const { error: updateTokenError } = await supabase
          .from("farm_tokens")
          .update({
            status: "active",
            last_used_at: new Date().toISOString(),
          })
          .eq("ha_token", existingToken.ha_token);

        if (updateTokenError) {
          console.error(
            "Failed to reactivate existing farm token:",
            updateTokenError,
          );
          return res.status(500).json({ error: "Failed to store farm token" });
        }
      } else {
        const { error: activeTokenError } = await supabase
          .from("farm_tokens")
          .insert([
            {
              farm_id,
              ha_token: haToken,
              status: "active",
              created_at: new Date().toISOString(),
              last_used_at: new Date().toISOString(),
              owner_user_id: user_id,
            },
          ]);

        if (activeTokenError) {
          console.error(
            "Failed to insert active farm token:",
            activeTokenError,
          );
          return res.status(500).json({ error: "Failed to store farm token" });
        }
      }

      // ===============================
      // 4b. INSERT USER_HA IF NOT EXISTS
      // ===============================
      const { data: existingUserHa, error: existingUserHaError } =
        await supabase
          .from("user_ha")
          .select()
          .eq("user_id", user_id)
          .eq("ha_token", haToken)
          .maybeSingle();

      if (existingUserHaError) {
        console.error("Failed to check existing user_ha:", existingUserHaError);
        return res
          .status(500)
          .json({ error: "Failed to check existing user_ha" });
      }

      if (!existingUserHa) {
        const { error: userHaError } = await supabase.from("user_ha").insert([
          {
            user_id,
            ha_token: haToken,
          },
        ]);

        if (userHaError) {
          console.error("Failed to insert user_ha:", userHaError);
          return res
            .status(500)
            .json({ error: "Failed to store user HA token" });
        }
      }

      // ===============================
      // 5. DONE
      // ===============================
      return res.status(200).json({
        status: "online",
        message: "Home Assistant credentials updated successfully"
      });
    } catch (err) {
      console.error("Failed to edit HA credentials:", err);
      return res.status(500).json({ error: "Failed to edit HA credentials" });
    }
  });

  return router;
}
