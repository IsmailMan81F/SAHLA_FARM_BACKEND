import { supabase } from "../libs/supabaseClient.js";
import { verifyHomeassistantCredentials } from "./homeassistantService.js";
import { v4 as uuidv4 } from "uuid";



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
      .select("id, farm_id, history_id, type, growth_stage, mode, timestamp")
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
        timestamp: cropData?.timestamp || sensorData?.[0]?.timestamp || null,
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

/**
 * Map sensor type from API to database enum format
 * @param {string} sensorType - Sensor type from API
 * @returns {string} - Mapped sensor type for database
 */
function mapSensorTypeToDatabase(sensorType) {
  const mapping = {
    "temperature": "temperature",
    "air_humidity": "humidity",
    "soil_moisture": "soil moisture",
    "humidity": "humidity",
    "luminosity": "luminosity",
  };
  return mapping[sensorType?.toLowerCase()] || sensorType;
}

/**
 * Save snapshot to database
 * @param {object} snapshot - Snapshot object containing crop, sensors, actuators, weather, notifications, location, recommendation
 * @param {string} farmId - Farm ID
 * @returns {Promise<{success: boolean, historyId: string|null, error: any}>}
 */
export async function saveToDatabase(snapshot, farmId) {
  try {
    // Generate history ID and timestamp
    const historyId = uuidv4();
    const timestamp = new Date().toISOString();

    // 1. Handle location data - only insert if farm_id doesn't exist
    if (snapshot.location) {
      const { longitude, latitude, timezone } = snapshot.location;
      
      const { data: existingLocation, error: checkError } = await supabase
        .from("location")
        .select("farm_id")
        .eq("farm_id", farmId)
        .maybeSingle();

      if (!checkError && !existingLocation) {
        const { error: locationError } = await supabase
          .from("location")
          .insert([
            {
              farm_id: farmId,
              longitude,
              latitude,
              timezone
            }
          ]);

        if (locationError) {
          console.error("Error inserting location:", locationError);
          return { success: false, historyId: null, error: locationError };
        }
      }
    }

    // 2. Save crop data
    if (snapshot.crop) {
      const { type, mode, growth_stage } = snapshot.crop;
      
      const { error: cropError } = await supabase
        .from("crop")
        .insert([
          {
            id: uuidv4(),
            farm_id: farmId,
            history_id: historyId,
            timestamp,
            type,
            growth_stage,
            mode
          }
        ]);

      if (cropError) {
        console.error("Error inserting crop:", cropError);
        return { success: false, historyId: null, error: cropError };
      }
    }

    // 3. Save sensors data
    if (snapshot.sensors && Array.isArray(snapshot.sensors)) {
      const sensorInserts = snapshot.sensors.map(sensor => ({
        id: uuidv4(),
        farm_id: farmId,
        history_id: historyId,
        timestamp,
        type: mapSensorTypeToDatabase(sensor.type),
        value: sensor.value,
        description: sensor.description
      }));

      const { error: sensorError } = await supabase
        .from("sensor")
        .insert(sensorInserts);

      if (sensorError) {
        console.error("Error inserting sensors:", sensorError);
        return { success: false, historyId: null, error: sensorError };
      }
    }

    // 4. Save actuators data
    if (snapshot.actuators && Array.isArray(snapshot.actuators)) {
      const actuatorInserts = snapshot.actuators.map(actuator => ({
        id: uuidv4(),
        farm_id: farmId,
        history_id: historyId,
        timestamp,
        type: actuator.type,
        status: actuator.status,
        control_mode: actuator.control_mode,
        run_at: actuator.run_at,
        run_until: actuator.run_until,
        duration_minutes: actuator.duration_minutes
      }));

      const { error: actuatorError } = await supabase
        .from("actuator")
        .insert(actuatorInserts);

      if (actuatorError) {
        console.error("Error inserting actuators:", actuatorError);
        return { success: false, historyId: null, error: actuatorError };
      }
    }

    // 5. Save weather data
    if (snapshot.weather) {
      const { state, summary } = snapshot.weather;
      
      const { error: weatherError } = await supabase
        .from("weather")
        .insert([
          {
            id: uuidv4(),
            farm_id: farmId,
            history_id: historyId,
            timestamp,
            state,
            summary
          }
        ]);

      if (weatherError) {
        console.error("Error inserting weather:", weatherError);
        return { success: false, historyId: null, error: weatherError };
      }
    }

    // 6. Save recommendation data
    if (snapshot.recommendation) {
      const { error: recommendationError } = await supabase
        .from("recommendation")
        .insert([
          {
            id: uuidv4(),
            farm_id: farmId,
            history_id: historyId,
            timestamp,
            body: snapshot.recommendation
          }
        ]);

      if (recommendationError) {
        console.error("Error inserting recommendation:", recommendationError);
        return { success: false, historyId: null, error: recommendationError };
      }
    }

    // 7. Save notifications data (in two tables)
    if (snapshot.notifications && Array.isArray(snapshot.notifications)) {
      for (const notification of snapshot.notifications) {
        const notificationId = uuidv4();

        // Insert into notifications table
        const { error: notificationError } = await supabase
          .from("notification")
          .insert([
            {
              id: notificationId,
              title: notification.title,
              description: notification.description,
              timestamp
            }
          ]);

        if (notificationError) {
          console.error("Error inserting notification:", notificationError);
          return { success: false, historyId: null, error: notificationError };
        }

        // Insert into notification_farm table
        const { error: notificationFarmError } = await supabase
          .from("notification_farm")
          .insert([
            {
              farm_id: farmId,
              notification_id: notificationId,
              status: "unread"
            }
          ]);

        if (notificationFarmError) {
          console.error("Error inserting notification_farm:", notificationFarmError);
          return { success: false, historyId: null, error: notificationFarmError };
        }
      }
    }

    return { success: true, historyId, error: null };
  } catch (err) {
    console.error("Error saving to database:", err);
    return { success: false, historyId: null, error: err };
  }
}


/**
 * Fetch paginated history list with crop and weather data
 * @param {string} farmId - Farm ID
 * @param {number} offset - Number of records to skip
 * @param {number} limit - Max number of records to return
 * @returns {Promise<{success: boolean, data: Array|null, error: any}>}
 */
export async function fetchHistoryPaginated(farmId, offset, limit) {
  try {
    // Fetch crop data with pagination
    const { data: cropData, error: cropError } = await supabase
      .from("crop")
      .select("id, history_id, type, growth_stage, timestamp")
      .eq("farm_id", farmId)
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    if (cropError) {
      return { success: false, data: null, error: cropError };
    }

    if (!cropData || cropData.length === 0) {
      return { success: true, data: [], error: null };
    }

    // Get unique history IDs from crop data
    const historyIds = [...new Set(cropData.map(row => row.history_id))];

    // Fetch weather data for all history IDs
    const { data: weatherData, error: weatherError } = await supabase
      .from("weather")
      .select("history_id, state, timestamp")
      .eq("farm_id", farmId)
      .in("history_id", historyIds);

    if (weatherError) {
      console.error("Error fetching weather data:", weatherError);
    }

    // Create a map for quick weather lookup
    const weatherMap = {};
    for (const w of weatherData || []) {
      weatherMap[w.history_id] = w;
    }

    // Build the response array
    const historyList = cropData.map(crop => {
      const weather = weatherMap[crop.history_id];
      return {
        id: crop.history_id,
        timestamp: crop.timestamp,
        crop: {
          type: crop.type,
          growth_stage: crop.growth_stage
        },
        weather: weather ? {
          state: weather.state
        } : null
      };
    });

    // Remove duplicates (keep first occurrence for each history_id)
    const uniqueHistoryMap = new Map();
    for (const item of historyList) {
      if (!uniqueHistoryMap.has(item.id)) {
        uniqueHistoryMap.set(item.id, item);
      }
    }

    return { success: true, data: Array.from(uniqueHistoryMap.values()), error: null };
  } catch (err) {
    console.error("Error fetching paginated history:", err);
    return { success: false, data: null, error: err };
  }
}

