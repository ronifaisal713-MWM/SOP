"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Separate from useRequireRole: is_platform_owner is an independent
// flag on a profile, not a role -- an account can be an Agency owner
// (role = super_admin) AND the platform owner at the same time. Pages
// under /dashboard/platform gate on this flag instead of a role.
export function useRequirePlatformOwner() {
  const router = useRouter();
  const [state, setState] = useState({ checked: false, allowed: false, user: null });

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
        .select("is_platform_owner")
        .eq("id", user.id)
        .single();

      if (!isMounted) return;
      setState({ checked: true, allowed: !!profile?.is_platform_owner, user });
    }

    check();
    return () => {
      isMounted = false;
    };
  }, [router]);

  return state;
}
