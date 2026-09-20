"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequirePlatformOwner } from "@/lib/useRequirePlatformOwner";

export default function AgencyEmailRequestsPage() {
  const { checked, allowed } = useRequirePlatformOwner();
  const [requests, setRequests] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    if (!checked || !allowed) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, allowed]);

  async function load() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("email_change_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const rows = data || [];
    setRequests(rows);

    const ids = [...new Set(rows.map((r) => r.user_id))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map = {};
      (profiles || []).forEach((p) => (map[p.id] = p.full_name));
      setProfileMap(map);
    }

    setLoading(false);
  }

  async function handleAction(requestId, action) {
    setActingId(requestId);
    setError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch("/api/admin/approve-email-change", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId, action }),
    });

    const result = await res.json();
    setActingId(null);

    if (!res.ok) {
      setError(result.error || "Something went wrong");
      return;
    }
    load();
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

  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return (
    <main className="px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-brand">Email Change Requests</h1>
          <a href="/dashboard/platform" className="text-sm text-slate-500 hover:underline">
            ← Back to dashboard
          </a>
        </div>

        {loading && <p className="text-slate-400 text-sm">Loading...</p>}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && (
          <>
            <h2 className="text-sm font-semibold text-slate-600 mb-2">Pending</h2>
            <div className="space-y-3 mb-8">
              {pending.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-slate-400 text-sm">
                  No pending requests.
                </div>
              )}
              {pending.map((r) => (
                <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                  <p className="text-sm font-medium text-slate-800">
                    {profileMap[r.user_id] || "Unknown"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {r.current_email} → <strong>{r.requested_email}</strong>
                  </p>
                  {r.reason && <p className="text-xs text-slate-400 mt-1">"{r.reason}"</p>}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleAction(r.id, "approve")}
                      disabled={actingId === r.id}
                      className="text-xs bg-green-600 text-white rounded-md px-3 py-1.5 font-medium hover:bg-green-700 transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(r.id, "reject")}
                      disabled={actingId === r.id}
                      className="text-xs border border-red-300 text-red-600 rounded-md px-3 py-1.5 font-medium hover:bg-red-50 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {reviewed.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-slate-600 mb-2">Reviewed</h2>
                <div className="space-y-2">
                  {reviewed.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white border border-slate-200 rounded-lg p-3 text-sm flex items-center justify-between"
                    >
                      <div>
                        <p className="text-slate-700">{profileMap[r.user_id] || "Unknown"}</p>
                        <p className="text-xs text-slate-400">
                          {r.current_email} → {r.requested_email}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          r.status === "approved" ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
