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
  ]);

  if (error) {
    return { success: false, error };
  }

  return { success: true, user: data?.[0] ?? null };
}
