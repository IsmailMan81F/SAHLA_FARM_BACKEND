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

export async function createLoginNotification(user_id) {
  const notificationId = randomUUID();
  const now = new Date();
  const timestamp = now.toISOString();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const description = `Someone login to your account at ${hh}:${mm}`;

  const { data: notifData, error: notifError } = await supabase.from("notification").insert([
    {
      id: notificationId,
      timestamp,
      title: "New login to the account",
      description,
    },
  ]);

  if (notifError) {
    console.error("Failed to create login notification:", notifError);
    return { success: false, error: notifError };
  }

  const { data: userNotifData, error: userNotifError } = await supabase.from("notification_user").insert([
    {
      notification_id: notificationId,
      user_id,
      status: "unread",
    },
  ]);

  if (userNotifError) {
    console.error("Failed to create notification_user for login:", userNotifError);
    return { success: false, error: userNotifError };
  }

  return { success: true, notification: notifData?.[0] };
}