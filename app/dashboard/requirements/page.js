"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";

const STATUS_STYLES = {
  new: "bg-blue-100 text-blue-700",
  reviewing: "bg-amber-100 text-amber-700",
  accepted: "bg-indigo-100 text-indigo-700",
  planned: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-amber-100 text-amber-700",
  internal_review: "bg-purple-100 text-purple-700",
  client_review: "bg-purple-100 text-purple-700",
  revision: "bg-red-100 text-red-700",
  approved: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  completed: "bg-slate-200 text-slate-700",
};

const PRIORITY_ICON = { urgent: "🔴", high: "🟠", normal: "🟡", low: "🟢" };

export default function RequirementsListPage() {
  const { checked } = useRequireAuth();
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!checked) return;

    supabase
      .from("requirements")
      .select("*, clients(company_name)")
      .order("created_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setRequirements(data || []);
        }
        setLoading(false);
      });
  }, [checked]);

  if (!checked) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-brand">My Requirements</h1>
            <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
              ← Back to dashboard
            </a>
          </div>
          <a
            href="/dashboard/requirements/new"
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
          >
            + New Requirement
          </a>
        </div>

        {loading && <p className="text-slate-400 text-sm">Loading requirements...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && requirements.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
            No requirements yet. Click "+ New Requirement" above to create the first one.
          </div>
        )}

        {requirements.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {requirements.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => (window.location.href = `/dashboard/requirements/${r.id}`)}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{r.title}</td>
                    <td className="px-4 py-3 text-slate-500">{r.clients?.company_name || "-"}</td>
                    <td className="px-4 py-3 text-slate-500">{r.category || "-"}</td>
                    <td className="px-4 py-3">
                      {PRIORITY_ICON[r.priority] || ""} {r.priority}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.deadline || "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_STYLES[r.status] || "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.status}
                      </span>
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
