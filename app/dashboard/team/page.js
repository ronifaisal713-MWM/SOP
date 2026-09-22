"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";

const ROLE_LABEL = {
  super_admin: "Owner",
  admin: "Admin",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  employee: "Employee",
};

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ClientTeamPage() {
  const { user, checked } = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [assignedTeam, setAssignedTeam] = useState([]);

  useEffect(() => {
    if (!checked || !user) return;

    supabase
      .from("client_users")
      .select("client_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data: clientUser }) => {
        if (!clientUser?.client_id) {
          setLoading(false);
          return;
        }
        const { data: assignments } = await supabase
          .from("client_team_members")
          .select("user_id")
          .eq("client_id", clientUser.client_id);
        const staffIds = (assignments || []).map((a) => a.user_id);
        if (staffIds.length > 0) {
          const { data: staffProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .in("id", staffIds);
          setAssignedTeam(staffProfiles || []);
        }
        setLoading(false);
      });
  }, [checked, user]);

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-brand">Your Team</h1>
          <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
            ← Back to dashboard
          </a>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          {assignedTeam.length === 0 ? (
            <p className="text-sm text-slate-400">
              No team members have been assigned to your account yet.
            </p>
          ) : (
            <div className="space-y-3">
              {assignedTeam.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {initials(m.full_name)}
                  </div>
                  <div>
                    <p className="text-sm text-slate-700">{m.full_name || "Unnamed"}</p>
                    <p className="text-xs text-slate-400">{ROLE_LABEL[m.role] || m.role}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-100">
            You can @mention any of these teammates in chat.
          </p>
        </div>
      </div>
    </main>
  );
}
