"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { categoryForRole } from "@/lib/roleCategory";

const NAV_BY_CATEGORY = {
  agency: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/admin/clients", label: "Clients" },
    { href: "/dashboard/admin/team", label: "Team" },
    { href: "/dashboard/tasks", label: "Task Board" },
    { href: "/dashboard/requirements", label: "Requirements" },
  ],
  staff: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/tasks", label: "Task Board" },
    { href: "/dashboard/requirements", label: "Requirements" },
  ],
  client: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/requirements", label: "Requirements" },
  ],
};

// This layout wraps every /dashboard/* page, so the top bar -- and which
// links appear on it -- is always the same no matter which page you're
// on. It's also where the "does this URL even belong to my portal?" auth
// check lives once, instead of being duplicated per page.
export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [category, setCategory] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionData.session.user.id)
        .single();

      if (!isMounted) return;
      setCategory(categoryForRole(profile?.role));
      setChecked(true);
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const navItems = NAV_BY_CATEGORY[category] || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10 flex-wrap gap-3">
        <div className="flex items-center gap-5 flex-wrap">
          <span className="font-semibold text-brand">Agency OS</span>
          {checked &&
            navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-slate-600 hover:text-brand transition"
              >
                {item.label}
              </a>
            ))}
        </div>
        {checked && (
          <button
            onClick={handleSignOut}
            className="text-sm text-slate-500 hover:text-brand transition"
          >
            Sign Out
          </button>
        )}
      </header>

      {checked ? (
        children
      ) : (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>
      )}
    </div>
  );
}
