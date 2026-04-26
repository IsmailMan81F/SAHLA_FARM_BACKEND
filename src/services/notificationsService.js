import { supabase } from "../libs/supabaseClient.js";

export async function fetchUserUnreadNotifications(user_id, limit) {
  const { data, error } = await supabase
    .from("notification_user")
    .select("notification_id")
    .eq("user_id", user_id)
    .eq("status", "unread")
    .limit(limit);

  if (error) {
    return { success: false, error };
  }

  const notificationIds = data.map((row) => row.notification_id).filter(Boolean);
  if (!notificationIds.length) {
    return { success: true, notifications: [] };
  }

  const { data: notifications, error: notificationError } = await supabase
    .from("notification")
    .select("id, timestamp, title, description")
    .in("id", notificationIds)
    .order("timestamp", { ascending: false });

  if (notificationError) {
    return { success: false, error: notificationError };
  }

  return { success: true, notifications };
}

export async function fetchFarmNotifications(farm_id, limit) {
  const { data, error } = await supabase
    .from("notification_farm")
    .select("notification_id")
    .eq("farm_id", farm_id)
    .limit(limit);

  if (error) {
    return { success: false, error };
  }

  const notificationIds = data.map((row) => row.notification_id).filter(Boolean);
  if (!notificationIds.length) {
    return { success: true, notifications: [] };
  }

  const { data: notifications, error: notificationError } = await supabase
    .from("notification")
    .select("id, timestamp, title, description")
    .in("id", notificationIds)
    .order("timestamp", { ascending: false });

  if (notificationError) {
    return { success: false, error: notificationError };
  }

  return { success: true, notifications };
}

export async function updateNotificationStatus(user_id, notification_id, status) {
  if (!status || !["read", "unread"].includes(status)) {
    return { success: false, error: "Invalid status. Must be 'read' or 'unread'" };
  }

  const { data, error } = await supabase
    .from("notification_user")
    .update({ status })
    .eq("user_id", user_id)
    .eq("notification_id", notification_id);

  if (error) {
    return { success: false, error };
  }

  return { success: true, data };
}

export async function updateAllNotificationStatus(user_id, status) {
  if (!status || !["read", "unread"].includes(status)) {
    return { success: false, error: "Invalid status. Must be 'read' or 'unread'" };
  }

  const { data, error } = await supabase
    .from("notification_user")
    .update({ status })
    .eq("user_id", user_id);

  if (error) {
    return { success: false, error };
  }

  return { success: true, data };
}
