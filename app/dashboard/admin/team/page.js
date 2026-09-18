"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";

const STAFF_ROLES = ["super_admin", "admin", "project_manager", "team_lead", "employee"];

const ROLE_LABEL = {
  super_admin: "Owner",
  admin: "Admin",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  employee: "Employee",
};

export default function TeamListPage() {
  const { checked, allowed, user } = useRequireRole(STAFF_ROLES);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!checked || !allowed) return;
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", STAFF_ROLES)
      .then(({ data }) => {
        setTeam(data || []);
        setLoading(false);
      });
  }, [checked, allowed]);

  if (!checked) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        This page is for your agency's team only. You don't have access.
      </main>
    );
  }

  function initials(name) {
    if (!name) return "?";
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-brand">Team</h1>
            <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
              ← Back to dashboard
            </a>
          </div>
          <a
            href="/dashboard/admin/team/new"
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
          >
            + Add Team Member
          </a>
        </div>

        {loading && <p className="text-slate-400 text-sm">Loading...</p>}

        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {team.map((m) => (
              <div
                key={m.id}
                className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                  {initials(m.full_name)}
                </div>
                <div>
                  <p className="font-medium text-slate-800 text-sm">
                    {m.full_name || "Unnamed"}
                    {m.id === user?.id && <span className="text-slate-400"> (you)</span>}
                  </p>
                  <p className="text-xs text-slate-400">{ROLE_LABEL[m.role] || m.role}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
