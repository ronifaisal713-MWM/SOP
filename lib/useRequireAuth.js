"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Simple client-side guard: redirects to /login if there's no active
// Supabase session. Returns the current user (or null while checking).
export function useRequireAuth() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      if (!data.session) {
        router.replace("/login");
      } else {
        setUser(data.session.user);
      }
      setChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
      } else {
        setUser(session.user);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  return { user, checked };
}
