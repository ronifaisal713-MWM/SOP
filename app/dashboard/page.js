"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ALL_STAFF_ROLES } from "@/lib/roleCategory";

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

export default function DashboardPage() {
  const { user, checked } = useRequireAuth();
  const [counts, setCounts] = useState({
    requirements: null,
    activeTasks: null,
    pendingApprovals: null,
    completed: null,
  });
  const [isStaff, setIsStaff] = useState(false);
  const [assignedTeam, setAssignedTeam] = useState([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    if (!checked || !user) return;

    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setIsStaff(!!data?.role && ALL_STAFF_ROLES.includes(data.role));
        setIsClient(!!data?.role && ["client_admin", "client_user"].includes(data.role));
      });

    supabase
      .from("client_users")
      .select("client_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data: clientUser }) => {
        if (!clientUser?.client_id) return;
        const { data: assignments } = await supabase
          .from("client_team_members")
          .select("user_id")
          .eq("client_id", clientUser.client_id);
        const staffIds = (assignments || []).map((a) => a.user_id);
        if (staffIds.length === 0) return;
        const { data: staffProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", staffIds);
        setAssignedTeam(staffProfiles || []);
      });

    supabase
      .from("requirements")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setCounts((c) => ({ ...c, requirements: count ?? 0 })));

    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .not("status", "in", "(done,approved)")
      .then(({ count }) => setCounts((c) => ({ ...c, activeTasks: count ?? 0 })));

    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "client_review")
      .then(({ count }) => setCounts((c) => ({ ...c, pendingApprovals: count ?? 0 })));

    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "done")
      .then(({ count }) => setCounts((c) => ({ ...c, completed: count ?? 0 })));
  }, [checked, user]);

  if (!checked) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  const stats = [
    { label: "Active Tasks", value: counts.activeTasks ?? "-" },
    { label: "Pending Approvals", value: counts.pendingApprovals ?? "-" },
    { label: "Requirements", value: counts.requirements ?? "-" },
    { label: "Completed", value: counts.completed ?? "-" },
  ];

  return (
    <main className="px-6 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
          {user?.email && <p className="text-sm text-slate-500">Signed in as {user.email}</p>}
        </div>
        {isStaff && (
          <a
            href="/dashboard/reports"
            className="px-4 py-2 rounded-md border border-brand text-brand text-sm font-medium hover:bg-slate-100 transition"
          >
            View Reports
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      <p className="text-slate-400 text-sm mt-8">
        All four numbers above come directly from Supabase and are scoped to what you have access
        to (your agency's data, your assigned clients, or your own tasks).
      </p>

      {isClient && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm mt-6 max-w-md">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Your Team</h2>
          {assignedTeam.length === 0 ? (
            <p className="text-xs text-slate-400">
              No team members have been assigned to your account yet.
            </p>
          ) : (
            <div className="space-y-2">
              {assignedTeam.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
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
        </div>
      )}
    </main>
  );
}
