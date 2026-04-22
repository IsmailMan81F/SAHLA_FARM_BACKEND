import { randomUUID } from "crypto";
import { supabase } from "../libs/supabaseClient.js";

export async function createWelcomeNotification(user_id) {
  const notificationId = randomUUID();
  const now = new Date().toISOString();

  // Insert into notification table
  const { data: notifData, error: notifError } = await supabase.from("notification").insert([
    {
      id: notificationId,
      timestamp: now,
      title: "Welcome to Sahla Farm !",
      description: "Welcome to Sahla Farm, your number One farm assistant app",
    },
  ]);

  if (notifError) {
    console.error("Failed to create notification:", notifError);
    return { success: false, error: notifError };
  }

  // Insert into notification_user table
  const { data: userNotifData, error: userNotifError } = await supabase.from("notification_user").insert([
    {
      notification_id: notificationId,
      user_id,
      status: "unread",
    },
  ]);

  if (userNotifError) {
    console.error("Failed to create notification_user:", userNotifError);
    return { success: false, error: userNotifError };
  }

  return { success: true, notification: notifData?.[0] };
}