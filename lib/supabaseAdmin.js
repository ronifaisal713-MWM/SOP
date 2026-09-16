import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Never import this file from a "use client" component --
// it uses the Supabase secret/service_role key, which bypasses Row Level
// Security and has full database + user-management access. It must only
// ever run inside API routes (app/api/**/route.js), which execute on the
// server, not in the browser.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Admin API routes (creating client accounts, etc.) will fail until it's added to your environment variables."
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  serviceRoleKey || "placeholder-service-role-key",
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);
