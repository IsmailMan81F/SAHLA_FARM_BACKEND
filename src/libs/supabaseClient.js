import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://idyfxzvhpeusxwzvxkmh.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY ="sb_secret_HHS4VMCugQZ5Nti-5oRCeg_iZ8lWTS1";

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in the environment to initialize Supabase.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
