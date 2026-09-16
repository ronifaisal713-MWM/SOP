"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Client-side guard: redirects to /login if not signed in, and reports
// whether the current user's `profiles.role` is in `allowedRoles`.
// Real enforcement for anything sensitive (like creating users) still
// happens server-side in the API route -- this hook only controls what
// the UI shows.
export function useRequireRole(allowedRoles) {
  const router = useRouter();
  const [state, setState] = useState({ checked: false, allowed: false, user: null, role: null });

  useEffect(() => {
    let isMounted = true;

    async function check() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const user = sessionData.session.user;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!isMounted) return;

      const role = profile?.role || null;
      setState({
        checked: true,
        allowed: !!role && allowedRoles.includes(role),
        user,
        role,
      });
    }

    check();
    return () => {
      isMounted = false;
    };
  }, [router, allowedRoles]);

  return state;
}
