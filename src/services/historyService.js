import { supabase } from "../libs/supabaseClient.js";
import { verifyHomeassistantCredentials } from "./homeassistantService.js";



/**
 * Verify access token and extract user_id
 * @param {string} token - Access token
 * @returns {Promise<{unauthorized: boolean, user_id: string|null}>}
 */
export async function verifyAccessToken(token) {
  if (!token) {
    return { unauthorized: true, user_id: null };
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { unauthorized: true, user_id: null };
  }

  return { unauthorized: false, user_id: user.id };
}

/**
 * Get user's HA tokens from user_ha table
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, tokens: Array, error: any}>}
 */
export async function getUserHaTokens(userId) {
  const { data, error } = await supabase
    .from("user_ha")
    .select("ha_token")
    .eq("user_id", userId);

  if (error) {
    return { success: false, tokens: [], error };
  }

  return { success: true, tokens: data || [], error: null };
}

/**
 * Get active farm token by HA token
 * @param {string} haToken - HA token
 * @returns {Promise<{success: boolean, farmToken: object|null, error: any}>}
 */
export async function getActiveFarmToken(haToken) {
  const { data, error } = await supabase
    .from("farm_tokens")
    .select("farm_id, ha_token, status, created_at, last_used_at, owner_user_id")
    .eq("ha_token", haToken)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return { success: false, farmToken: null, error };
  }

  return { success: true, farmToken: data, error: null };
}

/**
 * Get farm by ID
 * @param {string} farmId - Farm ID
 * @returns {Promise<{success: boolean, farm: object|null, error: any}>}
 */
export async function getFarmById(farmId) {
  const { data, error } = await supabase
    .from("farm")
    .select("id, ha_instance_id, ha_url")
    .eq("id", farmId)
    .maybeSingle();

  if (error) {
    return { success: false, farm: null, error };
  }

  return { success: true, farm: data, error: null };
}

/**
 * Get user's preference units for mapping sensor values
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, units: object, error: any}>}
 */
export async function getUserPreferenceUnits(userId) {
  const { data, error } = await supabase
    .from("preferences_unit")
    .select("name, symbol")
    .eq("user_id", userId);

  if (error) {
    return { success: false, units: {}, error };
  }

  // Map units by name for easy lookup
  const unitsMap = {};
  for (const row of data || []) {
    if (row.name) {
      unitsMap[row.name.toLowerCase()] = row.symbol;
    }
  }

  return { success: true, units: unitsMap, error: null };
}

/**
 * Map sensor type to preference unit name
 * @param {string} sensorType - Sensor type from database
 * @returns {string} - Unit name for preferences_unit table
 */
function mapSensorTypeToUnitName(sensorType) {
  const mapping = {
    "soil_moisture": "soil moisture",
    "temperature": "temperature",
    "air_humidity": "humidity",
    "humidity": "humidity",
    "light_intensity": "luminosity",
    "luminosity": "luminosity",
  };
  return mapping[sensorType?.toLowerCase()] || null;
}

/**
 * Fetch history by ID with all related data (crop, sensors, actuators, weather, recommendation)
 * @param {string} farmId - Farm ID
 * @param {string} historyId - History ID
 * @param {string} userId - User ID for unit mapping
 * @returns {Promise<{success: boolean, data: object|null, error: any}>}
 */
export async function fetchHistoryById(farmId, historyId, userId) {
  try {
    // 1. Fetch crop data
    const { data: cropData, error: cropError } = await supabase
      .from("crop")
      .select("id, farm_id, history_id, type, growth_stage, mode")
      .eq("farm_id", farmId)
      .eq("history_id", historyId)
      .maybeSingle();

    if (cropError) {
      return { success: false, data: null, error: cropError };
    }

    // 2. Fetch sensor data
    const { data: sensorData, error: sensorError } = await supabase
      .from("sensor")
      .select("id, farm_id, history_id, type, value, description, timestamp")
      .eq("farm_id", farmId)
      .eq("history_id", historyId);

    if (sensorError) {
      return { success: false, data: null, error: sensorError };
    }

    // 3. Fetch actuator data
    const { data: actuatorData, error: actuatorError } = await supabase
      .from("actuator")
      .select("id, farm_id, history_id, type, status, control_mode, run_at, duration, run_until")
      .eq("farm_id", farmId)
      .eq("history_id", historyId);

    if (actuatorError) {
      return { success: false, data: null, error: actuatorError };
    }

    // 4. Fetch weather data
    const { data: weatherData, error: weatherError } = await supabase
      .from("weather")
      .select("id, farm_id, history_id, state, summary, timestamp")
      .eq("farm_id", farmId)
      .eq("history_id", historyId)
      .maybeSingle();

    if (weatherError) {
      return { success: false, data: null, error: weatherError };
    }

    // 5. Fetch recommendation data
    const { data: recommendationData, error: recommendationError } = await supabase
      .from("recommendation")
      .select("id, farm_id, history_id, body, timestamp")
      .eq("farm_id", farmId)
      .eq("history_id", historyId)
      .maybeSingle();

    if (recommendationError) {
      return { success: false, data: null, error: recommendationError };
    }

    // 6. Get user preference units for sensor mapping
    const { success: unitsSuccess, units: unitsMap, error: unitsError } = await getUserPreferenceUnits(userId);
    
    if (!unitsSuccess) {
      console.error("Failed to fetch preference units:", unitsError);
    }

    // 7. Format sensors with units
    const formattedSensors = (sensorData || []).map(sensor => {
      const unitName = mapSensorTypeToUnitName(sensor.type);
      const unit = unitName ? unitsMap[unitName] : null;
      
      return {
        id: sensor.id,
        type: sensor.type,
        unit: unit,
        value: sensor.value,
        description: sensor.description
      };
    });

    // 8. Format actuators
    const formattedActuators = (actuatorData || []).map(actuator => {
      let durationMinutes = null;
      let runUntil = null;

      if (actuator.duration && actuator.run_at) {
        durationMinutes = actuator.duration;
        if (actuator.run_until) {
          runUntil = actuator.run_until;
        }
      }

      return {
        id: actuator.id,
        type: actuator.type,
        status: actuator.status,
        control_mode: actuator.control_mode,
        run_at: actuator.run_at,
        duration_minutes: durationMinutes,
        run_until: runUntil
      };
    });

    // 9. Build the response object
    const response = {
      run: {
        id: historyId,
        timestamp: cropData?.created_at || sensorData?.[0]?.timestamp || null,
        crop: cropData ? {
          type: cropData.type,
          mode: cropData.mode,
          growth_stage: cropData.growth_stage
        } : null,
        sensors: formattedSensors,
        actuators: formattedActuators,
        weather: weatherData ? {
          state: weatherData.state,
          summary: weatherData.summary
        } : null,
        recommendation: recommendationData?.body || null
      }
    };

    return { success: true, data: response, error: null };
  } catch (err) {
    console.error("Error fetching history:", err);
    return { success: false, data: null, error: err };
  }
}

