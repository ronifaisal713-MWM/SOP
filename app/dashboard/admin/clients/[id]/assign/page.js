"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { AGENCY_ROLES, ALL_STAFF_ROLES } from "@/lib/roleCategory";



export default function AssignClientTeamPage() {
  const { checked, allowed } = useRequireRole(AGENCY_ROLES);
  const params = useParams();
  const { id } = params;

  const [client, setClient] = useState(null);
  const [team, setTeam] = useState([]);
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!checked || !allowed || !id) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, allowed, id]);

  async function loadData() {
    setLoading(true);

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();
    if (clientError) {
      setError(clientError.message);
      setLoading(false);
      return;
    }
    setClient(clientData);

    const { data: teamData } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ALL_STAFF_ROLES);
    setTeam(teamData || []);

    const { data: assignments } = await supabase
      .from("client_team_members")
      .select("user_id")
      .eq("client_id", id);
    setAssignedIds(new Set((assignments || []).map((a) => a.user_id)));

    setLoading(false);
  }

  async function toggleAssignment(userId) {
    const isAssigned = assignedIds.has(userId);
    setSaving(true);

    if (isAssigned) {
      await supabase
        .from("client_team_members")
        .delete()
        .eq("client_id", id)
        .eq("user_id", userId);
      setAssignedIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } else {
      await supabase.from("client_team_members").insert({ client_id: id, user_id: userId });
      setAssignedIds((prev) => new Set(prev).add(userId));
    }

    setSaving(false);
  }

  if (!checked || loading) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        This page is for your agency's team only. You don't have access.
      </main>
    );
  }

  if (error || !client) {
    return (
      <main className="min-h-screen flex items-center justify-center text-red-600 text-sm">
        {error || "Client not found"}
      </main>
    );
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-lg mx-auto">
        <a href="/dashboard/admin/clients" className="text-sm text-slate-500 hover:underline">
          ← Clients
        </a>

        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm mt-4">
          <h1 className="text-xl font-semibold text-slate-800 mb-1">{client.company_name}</h1>
          <p className="text-sm text-slate-400 mb-6">
            Choose which team members are assigned to this client. Assigned members will show up
            as the point of contact on this client's tasks.
          </p>

          <div className="space-y-2">
            {team.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-3 border border-slate-200 rounded-md px-3 py-2 cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={assignedIds.has(m.id)}
                  disabled={saving}
                  onChange={() => toggleAssignment(m.id)}
                />
                <span className="text-sm text-slate-700">{m.full_name || "Unnamed"}</span>
                <span className="text-xs text-slate-400 ml-auto">{m.role}</span>
              </label>
            ))}

            {team.length === 0 && (
              <p className="text-sm text-slate-400">
                No team members yet. Add one from the Team page first.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
