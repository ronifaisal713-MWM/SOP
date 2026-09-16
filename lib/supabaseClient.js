import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Warn instead of throwing, so `next build` doesn't fail before .env.local
  // is set up (e.g. on first clone, or in CI without secrets configured yet).
  // Real Supabase calls will fail at runtime until real values are provided.
  console.warn(
    "Supabase env vars are missing. Copy .env.example to .env.local and fill in your project's URL and anon key."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);
