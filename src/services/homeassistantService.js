import crypto from "crypto";
import { supabase } from "../libs/supabaseClient.js";
import { verifyUser } from "./authService.js";

// Generates a 20-char hex ID to write into the HA helper
function generateHaId() {
  return crypto.randomBytes(10).toString("hex"); // 20 chars
}

export async function verifyHomeassistantCredentials(user_id) {
  if (!user_id) {
    return { status: "invalid", message: "user_id is required" };
  }

  const { data: userHaRows, error: userHaError } = await supabase
    .from("user_ha")
    .select("ha_token")
    .eq("user_id", user_id);

  if (userHaError) {
    console.error("Error querying user_ha:", userHaError);
    return { status: "error", message: "Failed to query credentials" };
  }

  if (!userHaRows || !userHaRows.length) {
    return {
      status: "need_setup_credentials",
      message: "need to setup credentials",
    };
  }

  let expiredTokenFound = false;
  let missingFarmFound = false;
  let invalidHaCredentialsFound = false;
  let validCredentialsResult = null;

  for (const row of userHaRows) {
    const ha_token = row.ha_token;
    if (!ha_token) continue;

    // ── Get the active farm token for this HA token
    const { data: farmTokenRow, error: farmTokenError } = await supabase
      .from("farm_tokens")
      .select("farm_id")
      .eq("ha_token", ha_token)
      .eq("status", "active")
      .maybeSingle();

    if (farmTokenError) {
      console.error("Error querying farm_tokens:", farmTokenError);
      continue;
    }

    if (!farmTokenRow?.farm_id) {
      expiredTokenFound = true;
      continue;
    }

    // ── Get the farm row to retrieve ha_url
    const { data: farmRow, error: farmError } = await supabase
      .from("farm")
      .select("id, ha_instance_id, ha_url")
      .eq("id", farmTokenRow.farm_id)
      .single();

    if (farmError || !farmRow?.ha_url) {
      missingFarmFound = true;
      continue;
    }

    const baseUrl = farmRow.ha_url.replace(/\/$/, "");

    // ===============================
    // 1. VERIFY HA IS REACHABLE
    // ===============================
    let haResponse;
    try {
      haResponse = await fetch(`${baseUrl}/api/config`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ha_token}`,
          Accept: "application/json",
        },
      });
    } catch (fetchError) {
      console.error("Home Assistant request failed:", fetchError);
      invalidHaCredentialsFound = true;
      continue;
    }

    if (!haResponse.ok) {
      invalidHaCredentialsFound = true;
      continue;
    }

    // ===============================
    // 2. CHECK THE HELPER VALUE
    // ===============================
    let ha_instance_id = null;

    const helperRes = await fetch(
      `${baseUrl}/api/states/input_text.ha_instance_id`,
      {
        headers: {
          Authorization: `Bearer ${ha_token}`,
          Accept: "application/json",
        },
      },
    );

    if (helperRes.ok) {
      const helperData = await helperRes.json();
      const helperValue = helperData?.state;

      if (
        !helperValue ||
        helperValue === "unknown" ||
        helperValue.trim() === ""
      ) {
        // ── Helper exists but EMPTY → write the stored farm ha_instance_id into it
        // (or generate a new one if farm doesn't have one yet)
        ha_instance_id = farmRow.ha_instance_id || generateHaId();

        await fetch(`${baseUrl}/api/services/input_text/set_value`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ha_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entity_id: "input_text.ha_instance_id",
            value: ha_instance_id,
          }),
        });
      } else {
        // ── Helper has a VALUE → use it
        ha_instance_id = helperValue;
      }
    } else {
      // ── Helper not found → credentials invalid, user needs to create the helper
      invalidHaCredentialsFound = true;
      continue;
    }

    // ===============================
    // 3. SYNC ha_instance_id TO FARM IF CHANGED
    // ===============================
    if (ha_instance_id && ha_instance_id !== farmRow.ha_instance_id) {
      const { error: updateError } = await supabase
        .from("farm")
        .update({ ha_instance_id })
        .eq("id", farmRow.id);

      if (updateError) {
        console.error("Failed to update farm ha_instance_id:", updateError);
      }
    }

    // ── All checks passed
    validCredentialsResult = {
      status: "valid",
      message: "credentials are valid",
      farm_id: farmRow.id,
      ha_url: farmRow.ha_url,
      ha_instance_id,
    };
    break;
  }

  if (validCredentialsResult) return validCredentialsResult;
  if (expiredTokenFound)
    return { status: "expired", message: "ha token expired" };
  if (missingFarmFound) return { status: "expired", message: "token expired" };
  if (invalidHaCredentialsFound)
    return { status: "invalid", message: "invalid credentials" };

  return { status: "invalid", message: "invalid credentials" };
}

/**
 * Verifies a frontend client's JWT token and returns their HA instance.
 *
 * @param   {string} token - The JWT Bearer token sent by the frontend client
 * @returns {Promise<{
 *   authorized     : boolean,
 *   ha_instance_id : string | null,
 *   message        : string
 * }>}
 */
export async function authenticateClient(token) {
  try {
    // Step 1: Validate the token and get user_id
    const { unauthorized, user_id } = await verifyUser(token);
    if (unauthorized || !user_id) {
      return {
        authorized: false,
        ha_instance_id: null,
        message: "Invalid or expired token"
      };
    }

    // Step 2: Query user_ha table for ha_tokens
    const { data: userHaRows, error: userHaError } = await supabase
      .from("user_ha")
      .select("ha_token")
      .eq("user_id", user_id);

    if (userHaError) {
      console.error("Error querying user_ha:", userHaError);
      return {
        authorized: false,
        ha_instance_id: null,
        message: "Failed to query user HA credentials"
      };
    }

    if (!userHaRows || userHaRows.length === 0) {
      return {
        authorized: false,
        ha_instance_id: null,
        message: "No HA tokens found for user"
      };
    }

    // Step 3: For each ha_token, check farm_tokens for active status
    for (const row of userHaRows) {
      const ha_token = row.ha_token;
      if (!ha_token) continue;

      const { data: farmTokenRow, error: farmTokenError } = await supabase
        .from("farm_tokens")
        .select("farm_id")
        .eq("ha_token", ha_token)
        .eq("status", "active")
        .maybeSingle();

      if (farmTokenError) {
        console.error("Error querying farm_tokens:", farmTokenError);
        continue;
      }

      if (!farmTokenRow?.farm_id) {
        continue; // No active token for this ha_token
      }

      // Step 4: Query farm table for ha_instance_id
      const { data: farmRow, error: farmError } = await supabase
        .from("farm")
        .select("ha_instance_id")
        .eq("id", farmTokenRow.farm_id)
        .single();

      if (farmError || !farmRow?.ha_instance_id) {
        console.error("Error querying farm or missing ha_instance_id:", farmError);
        continue;
      }

      // Found a valid one, return it
      return {
        authorized: true,
        ha_instance_id: farmRow.ha_instance_id,
        message: "Authentication successful"
      };
    }

    // No active token found across all ha_tokens
    return {
      authorized: false,
      ha_instance_id: null,
      message: "No active HA token found"
    };
  } catch (error) {
    console.error("Unexpected error in authenticateClient:", error);
    return {
      authorized: false,
      ha_instance_id: null,
      message: "Internal server error during authentication"
    };
  }
}

/**
 * Fetches the connection credentials for a given Home Assistant instance from the DB.
 *
 * @param   {string} ha_instance_id - The unique ID of the HA instance
 * @returns {Promise<{
 *   ha_url  : string,
 *   ha_token: string,
 *   message : string
 * }>}
 * @throws  {Error} if something goes wrong
 */
export async function getCredentials(ha_instance_id) {
  try {
    // Step 1: Query farm table for ha_url and farm_id using ha_instance_id
    const { data: farmRow, error: farmError } = await supabase
      .from("farm")
      .select("id, ha_url")
      .eq("ha_instance_id", ha_instance_id)
      .single();

    if (farmError || !farmRow) {
      console.error("Error querying farm or farm not found:", farmError);
      throw new Error(`Farm not found for ha_instance_id: ${ha_instance_id}`);
    }

    const farm_id = farmRow.id;
    const ha_url = farmRow.ha_url;

    if (!ha_url) {
      throw new Error(`HA URL not found for ha_instance_id: ${ha_instance_id}`);
    }

    // Step 2: Query farm_tokens for active ha_token using farm_id
    const { data: farmTokenRow, error: farmTokenError } = await supabase
      .from("farm_tokens")
      .select("ha_token")
      .eq("farm_id", farm_id)
      .eq("status", "active")
      .maybeSingle();

    if (farmTokenError) {
      console.error("Error querying farm_tokens:", farmTokenError);
      throw new Error(`Failed to query tokens for farm_id: ${farm_id}`);
    }

    if (!farmTokenRow?.ha_token) {
      throw new Error(`No active HA token found for farm_id: ${farm_id}`);
    }

    return {
      url: ha_url,
      token: farmTokenRow.ha_token,
      message: "Credentials retrieved successfully"
    };
  } catch (error) {
    console.error("Error in getCredentials:", error);
    throw error; // Re-throw with message
  }
}
