import { supabase } from "../libs/supabaseClient.js";

export async function verifyUser(token) {
  if (!token) {
    return { unauthorized: true };
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user?.id) {
    return { unauthorized: true };
  }

  return {
    unauthorized: false,
    user_id: data.user.id,
  };
}
