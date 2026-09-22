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

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      // Supabase silently refreshes the access token periodically (well
      // before it expires), firing this listener with a brand new
      // `session.user` object each time -- same person, new reference.
      // Every page that does useEffect(..., [user]) would otherwise
      // re-run its whole data-fetch on every refresh, causing a
      // recurring "loading" flash and resetting scroll position. Only
      // update state for events that can actually change who's signed
      // in or their profile data.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
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
