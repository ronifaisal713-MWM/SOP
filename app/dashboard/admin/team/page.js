"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { AGENCY_ROLES, ALL_STAFF_ROLES } from "@/lib/roleCategory";
import ChatWidget from "@/components/ChatWidget";
import StaffChat from "@/components/StaffChat";

const ROLE_LABEL = {
  super_admin: "Owner",
  admin: "Admin",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  employee: "Employee",
};

export default function TeamListPage() {
  const { checked, allowed, user } = useRequireRole(AGENCY_ROLES);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState(null);
  const [dmUser, setDmUser] = useState(null);

  useEffect(() => {
    if (!checked || !allowed) return;
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ALL_STAFF_ROLES)
      .then(({ data }) => {
        setTeam(data || []);
        setLoading(false);
      });

    supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setOrganizationId(data?.organization_id || null));
  }, [checked, allowed, user]);

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
    <main className="px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
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
                <div className="flex-1">
                  <p className="font-medium text-slate-800 text-sm">
                    {m.full_name || "Unnamed"}
                    {m.id === user?.id && <span className="text-slate-400"> (you)</span>}
                  </p>
                  <p className="text-xs text-slate-400">{ROLE_LABEL[m.role] || m.role}</p>
                </div>
                {m.id !== user?.id && (
                  <button
                    onClick={() => setDmUser(m)}
                    className="text-xs text-purple-600 hover:underline flex-shrink-0"
                  >
                    💬 Message
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {dmUser && organizationId && (
        <ChatWidget
          title={`💬 ${dmUser.full_name || "Unnamed"}`}
          open={true}
          onToggle={() => setDmUser(null)}
          onClose={() => setDmUser(null)}
        >
          <StaffChat currentUser={user} otherUserId={dmUser.id} organizationId={organizationId} />
        </ChatWidget>
      )}
    </main>
  );
}
