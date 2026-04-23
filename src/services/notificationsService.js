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
    .from("notifications_farm")
    .select("notification_id")
    .eq("farm_id", farm_id)
    .order("timestamp", { ascending: false })
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
