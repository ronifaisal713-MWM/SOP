"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";

const STAFF_ROLES = ["super_admin", "admin", "project_manager", "team_lead", "employee"];

export default function ClientsListPage() {
  const { checked, allowed } = useRequireRole(STAFF_ROLES);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!checked || !allowed) return;
    supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (fetchError) setError(fetchError.message);
        setClients(data || []);
        setLoading(false);
      });
  }, [checked, allowed]);

  if (!checked) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        This page is for team members only. You don't have access.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-brand">Clients</h1>
            <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
              ← Back to dashboard
            </a>
          </div>
          <a
            href="/dashboard/admin/clients/new"
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
          >
            + New Client
          </a>
        </div>

        {loading && <p className="text-slate-400 text-sm">Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && clients.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
            No clients yet. Click "+ New Client" above to add the first one.
          </div>
        )}

        {clients.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Team</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.company_name}</td>
                    <td className="px-4 py-3 text-slate-500">{c.contact_person || "-"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.email || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/dashboard/admin/clients/${c.id}/assign`}
                        className="text-brand text-xs hover:underline"
                      >
                        Assign Team
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
