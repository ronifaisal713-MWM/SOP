"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { AGENCY_ROLES, ALL_STAFF_ROLES } from "@/lib/roleCategory";

function formatHours(totalSeconds) {
  if (!totalSeconds) return "0h";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export default function ReportsPage() {
  const { checked, allowed, role } = useRequireRole(ALL_STAFF_ROLES);
  const isAgency = AGENCY_ROLES.includes(role);

  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState({ newRequirements: 0, completedTasks: 0 });
  const [clientRows, setClientRows] = useState([]);
  const [teamRows, setTeamRows] = useState([]);

  useEffect(() => {
    if (!checked || !allowed) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, allowed]);

  async function loadData() {
    setLoading(true);
    const monthStart = startOfMonth();

    // Clients this viewer can see -- RLS already limits this to the
    // agency's clients, or just the ones a staff member is assigned to.
    const { data: clients } = await supabase.from("clients").select("id, company_name");
    const clientMap = {};
    (clients || []).forEach((c) => (clientMap[c.id] = c.company_name));

    // Tasks, with their requirement's client_id embedded.
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, status, created_at, updated_at, requirements(client_id)");

    const { data: requirements } = await supabase
      .from("requirements")
      .select("id, created_at");

    const newRequirements = (requirements || []).filter((r) => r.created_at >= monthStart).length;
    const completedTasks = (tasks || []).filter(
      (t) => t.status === "done" && t.updated_at >= monthStart
    ).length;
    setMonthly({ newRequirements, completedTasks });

    // ---- Per-client breakdown ----
    const byClient = {};
    (tasks || []).forEach((t) => {
      const clientId = t.requirements?.client_id;
      if (!clientId) return;
      if (!byClient[clientId]) {
        byClient[clientId] = { total: 0, completed: 0, pendingApproval: 0, inProgress: 0 };
      }
      byClient[clientId].total += 1;
      if (t.status === "done" || t.status === "approved") byClient[clientId].completed += 1;
      else if (t.status === "client_review") byClient[clientId].pendingApproval += 1;
      else byClient[clientId].inProgress += 1;
    });
    setClientRows(
      Object.entries(byClient)
        .map(([clientId, stats]) => ({ clientId, name: clientMap[clientId] || "Unknown", ...stats }))
        .sort((a, b) => b.total - a.total)
    );

    // ---- Per-team-member breakdown (agency only) ----
    if (isAgency) {
      const { data: team } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ALL_STAFF_ROLES);
      const teamMap = {};
      (team || []).forEach((m) => (teamMap[m.id] = m.full_name));

      const taskStatusMap = {};
      (tasks || []).forEach((t) => (taskStatusMap[t.id] = t.status));

      const taskIds = (tasks || []).map((t) => t.id);
      const { data: assigneeRows } =
        taskIds.length > 0
          ? await supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds)
          : { data: [] };

      const byMember = {};
      (assigneeRows || []).forEach((row) => {
        const status = taskStatusMap[row.task_id];
        if (!byMember[row.user_id]) byMember[row.user_id] = { total: 0, completed: 0, seconds: 0 };
        byMember[row.user_id].total += 1;
        if (status === "done" || status === "approved") byMember[row.user_id].completed += 1;
      });

      // Logged time per person -- counted from their own entries, not
      // from assignment, since someone can log time on a task they're
      // not formally assigned to.
      const { data: timeRows } =
        taskIds.length > 0
          ? await supabase
              .from("time_entries")
              .select("user_id, duration_seconds")
              .in("task_id", taskIds)
          : { data: [] };

      (timeRows || []).forEach((row) => {
        if (!row.user_id) return;
        if (!byMember[row.user_id]) byMember[row.user_id] = { total: 0, completed: 0, seconds: 0 };
        byMember[row.user_id].seconds += Math.max(0, row.duration_seconds || 0);
      });

      setTeamRows(
        Object.entries(byMember)
          .map(([userId, stats]) => ({ userId, name: teamMap[userId] || "Unnamed", ...stats }))
          .sort((a, b) => b.total - a.total)
      );
    }

    setLoading(false);
  }

  if (!checked) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  if (!allowed) {
    return (
      <main className="flex items-center justify-center py-20 text-slate-500 text-sm">
        This page is for agency staff only. You don't have access.
      </main>
    );
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-brand">Reports</h1>
          <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
            ← Back to dashboard
          </a>
        </div>

        {loading && <p className="text-slate-400 text-sm">Loading...</p>}

        {!loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                <p className="text-sm text-slate-500">New Requirements This Month</p>
                <p className="text-2xl font-bold text-slate-800">{monthly.newRequirements}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                <p className="text-sm text-slate-500">Tasks Completed This Month</p>
                <p className="text-2xl font-bold text-slate-800">{monthly.completedTasks}</p>
              </div>
            </div>

            <h2 className="text-sm font-semibold text-slate-600 mb-2">By Client</h2>
            {clientRows.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-8">
                <p className="text-center text-xs text-slate-300 py-8">No task data yet.</p>
              </div>
            ) : (
              <>
                {/* Mobile: stacked cards */}
                <div className="md:hidden space-y-3 mb-8">
                  {clientRows.map((row) => (
                    <a
                      key={row.clientId}
                      href={`/dashboard/clients/${row.clientId}`}
                      className="block bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
                    >
                      <p className="font-medium text-slate-800">{row.name}</p>
                      <div className="grid grid-cols-4 gap-2 mt-2 text-center">
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{row.total}</p>
                          <p className="text-[10px] text-slate-400">Total</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{row.inProgress}</p>
                          <p className="text-[10px] text-slate-400">In Progress</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{row.pendingApproval}</p>
                          <p className="text-[10px] text-slate-400">Pending</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{row.completed}</p>
                          <p className="text-[10px] text-slate-400">Done</p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm mb-8">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-500 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Client</th>
                        <th className="px-4 py-3 font-medium">Total Tasks</th>
                        <th className="px-4 py-3 font-medium">In Progress</th>
                        <th className="px-4 py-3 font-medium">Pending Approval</th>
                        <th className="px-4 py-3 font-medium">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientRows.map((row) => (
                        <tr key={row.clientId} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <a href={`/dashboard/clients/${row.clientId}`} className="hover:underline">
                              {row.name}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.total}</td>
                          <td className="px-4 py-3 text-slate-600">{row.inProgress}</td>
                          <td className="px-4 py-3 text-slate-600">{row.pendingApproval}</td>
                          <td className="px-4 py-3 text-slate-600">{row.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {isAgency && (
              <>
                <h2 className="text-sm font-semibold text-slate-600 mb-2">By Team Member</h2>
                {teamRows.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                    <p className="text-center text-xs text-slate-300 py-8">No assigned tasks yet.</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile: stacked cards */}
                    <div className="md:hidden space-y-3">
                      {teamRows.map((row) => (
                        <div key={row.userId} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                          <p className="font-medium text-slate-800">{row.name}</p>
                          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                            <div>
                              <p className="text-sm font-semibold text-slate-700">{row.total}</p>
                              <p className="text-[10px] text-slate-400">Assigned</p>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-700">{row.completed}</p>
                              <p className="text-[10px] text-slate-400">Completed</p>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-700">
                                {formatHours(row.seconds)}
                              </p>
                              <p className="text-[10px] text-slate-400">Logged</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop: table */}
                    <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-500 text-left">
                          <tr>
                            <th className="px-4 py-3 font-medium">Team Member</th>
                            <th className="px-4 py-3 font-medium">Assigned</th>
                            <th className="px-4 py-3 font-medium">Completed</th>
                            <th className="px-4 py-3 font-medium">Time Logged</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamRows.map((row) => (
                            <tr key={row.userId} className="border-t border-slate-100">
                              <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                              <td className="px-4 py-3 text-slate-600">{row.total}</td>
                              <td className="px-4 py-3 text-slate-600">{row.completed}</td>
                              <td className="px-4 py-3 text-slate-600">{formatHours(row.seconds)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
