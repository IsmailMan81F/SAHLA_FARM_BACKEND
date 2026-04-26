import { supabase } from "../libs/supabaseClient.js";

export async function createUserProfile({ id, email, username, age, address }) {
  const now = new Date().toISOString();

  const { data, error } = await supabase.from("users").insert([
    {
      id,
      email: email || null,
      username,
      age,
      address,
      created_at: now,
      updated_at: now,
    },
  ]).select();

  if (error) {
    return { success: false, error };
  }

  return { success: true, user: data?.[0] ?? null };
}

export async function updateUserLastLogin(user_id) {
  const now = new Date().toISOString();

  const { data, error } = await supabase.from("users").update({ last_login_at: now }).eq("id", user_id).select();

  console.log(data)
  if (error) {
    return { success: false, error };
  }
  return { success: true, user: data?.[0] ?? null };
}
