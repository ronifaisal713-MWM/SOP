"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { PLATFORM_ROLES } from "@/lib/roleCategory";

export default function PlatformHomePage() {
  const { checked, allowed, user } = useRequireRole(PLATFORM_ROLES);
  const [counts, setCounts] = useState({
    organizations: null,
    agencyUsers: null,
    clients: null,
    pendingRequests: null,
  });

  useEffect(() => {
    if (!checked || !allowed) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, allowed]);

  async function load() {
    const { count: orgCount } = await supabase
      .from("organizations")
      .select("*", { count: "exact", head: true });

    const { count: agencyUserCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .not("organization_id", "is", null);

    const { count: clientCount } = await supabase
      .from("clients")
      .select("*", { count: "exact", head: true });

    const { count: pendingCount } = await supabase
      .from("email_change_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    setCounts({
      organizations: orgCount ?? 0,
      agencyUsers: agencyUserCount ?? 0,
      clients: clientCount ?? 0,
      pendingRequests: pendingCount ?? 0,
    });
  }

  if (!checked) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }
  if (!allowed) {
    return (
      <main className="flex items-center justify-center py-20 text-slate-500 text-sm">
        This page is for the Platform Owner only.
      </main>
    );
  }

  const stats = [
    { label: "Agencies", value: counts.organizations ?? "-" },
    { label: "Agency Users (staff+owners)", value: counts.agencyUsers ?? "-" },
    { label: "Total Clients", value: counts.clients ?? "-" },
    { label: "Pending Email Requests", value: counts.pendingRequests ?? "-" },
  ];

  return (
    <main className="px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand">Platform Overview</h1>
            {user?.email && <p className="text-sm text-slate-500">Signed in as {user.email}</p>}
          </div>
          <a
            href="/dashboard/platform/email-requests"
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
          >
            Email Requests
          </a>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <p className="text-sm text-slate-500">{s.label}</p>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
            </div>
          ))}
        </div>

        <p className="text-slate-400 text-sm mt-8">
          As Platform Owner, you oversee the SaaS itself -- not individual agencies' client data,
          tasks, or chats. Those stay private to each agency.
        </p>
      </div>
    </main>
  );
}
