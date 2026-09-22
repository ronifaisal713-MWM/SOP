"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { AGENCY_ROLES, ALL_STAFF_ROLES } from "@/lib/roleCategory";

export default function ClientsListPage() {
  const { checked, allowed, role } = useRequireRole(ALL_STAFF_ROLES);
  const isAgency = AGENCY_ROLES.includes(role);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand">Clients</h1>
            <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
              ← Back to dashboard
            </a>
          </div>
          {isAgency && (
            <a
              href="/dashboard/admin/clients/new"
              className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
            >
              + New Client
            </a>
          )}
        </div>

        {loading && <p className="text-slate-400 text-sm">Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && clients.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
            No clients yet.
          </div>
        )}

        {clients.length > 0 && (
          <>
            {/* Mobile: stacked cards */}
            <div className="md:hidden space-y-3">
              {clients.map((c) => (
                <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800">{c.company_name}</p>
                    <span className="flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{c.contact_person || "-"}</p>
                  <p className="text-xs text-slate-400 truncate">{c.email || "-"}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <a href={`/dashboard/clients/${c.id}`} className="text-brand text-xs hover:underline">
                      Switch to Client →
                    </a>
                    {isAgency && (
                      <a
                        href={`/dashboard/admin/clients/${c.id}/assign`}
                        className="text-brand text-xs hover:underline"
                      >
                        Assign Team
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-500 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Open</th>
                    {isAgency && <th className="px-4 py-3 font-medium">Team</th>}
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
                          href={`/dashboard/clients/${c.id}`}
                          className="text-brand text-xs hover:underline"
                        >
                          Switch to Client →
                        </a>
                      </td>
                      {isAgency && (
                        <td className="px-4 py-3">
                          <a
                            href={`/dashboard/admin/clients/${c.id}/assign`}
                            className="text-brand text-xs hover:underline"
                          >
                            Assign Team
                          </a>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
