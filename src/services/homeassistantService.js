import { supabase } from "../libs/supabaseClient.js";

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
    return { status: "need_setup_credentials", message: "need to setup credentials" };
  }

  let expiredTokenFound = false;
  let missingFarmFound = false;
  let invalidHaCredentialsFound = false;
  let validCredentialsResult = null;

  for (const row of userHaRows) {
    const ha_token = row.ha_token;
    if (!ha_token) {
      continue;
    }

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

    const { data: farmRow, error: farmError } = await supabase
      .from("farm")
      .select("id, ha_instance_id, ha_url")
      .eq("id", farmTokenRow.farm_id)
      .single();

    if (farmError || !farmRow?.ha_url) {
      missingFarmFound = true;
      continue;
    }

    const endpoint = `${farmRow.ha_url.replace(/\/$/, "")}/api/config`;
    let haResponse;

    try {
      haResponse = await fetch(endpoint, {
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

    let haConfig;
    try {
      haConfig = await haResponse.json();
    } catch (jsonError) {
      console.error("Failed to parse Home Assistant response:", jsonError);
      invalidHaCredentialsFound = true;
      continue;
    }

    const ha_instance_id = haConfig.uuid || haConfig?.homeassistant?.uuid;
    if (!ha_instance_id) {
      invalidHaCredentialsFound = true;
      continue;
    }

    const { error: updateError } = await supabase
      .from("farm")
      .update({ ha_instance_id })
      .eq("id", farmRow.id);

    if (updateError) {
      console.error("Failed to update farm ha_instance_id:", updateError);
    }

    validCredentialsResult = {
      status: "valid",
      message: "credentials are valid",
      farm_id: farmRow.id,
      ha_url: farmRow.ha_url,
      ha_instance_id,
    };

    break;
  }

  if (validCredentialsResult) {
    return validCredentialsResult;
  }

  if (expiredTokenFound) {
    return { status: "expired", message: "ha token expired" };
  }

  if (missingFarmFound) {
    return { status: "expired", message: "token expired" };
  }

  if (invalidHaCredentialsFound) {
    return { status: "invalid", message: "invalid credentials" };
  }

  return { status: "invalid", message: "invalid credentials" };
}
