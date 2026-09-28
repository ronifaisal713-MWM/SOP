"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";

const APPROVER_ROLES = ["super_admin", "admin", "project_manager", "team_lead"];

const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function LeaveManagePage() {
  const { checked, allowed, user } = useRequireRole(APPROVER_ROLES);

  const [requests, setRequests] = useState([]);
  const [types, setTypes] = useState([]);
  const [nameMap, setNameMap] = useState({});
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewNote, setReviewNote] = useState({});

  useEffect(() => {
    if (!checked || !allowed || !user) return;
    load();

    // An approver sitting on this page is exactly who needs to see a
    // request the moment it arrives.
    const channel = supabase
      .channel("leave-requests-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () =>
        load({ silent: true })
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, allowed, user]);

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);

    const [{ data: requestRows }, { data: typeRows }] = await Promise.all([
      supabase.from("leave_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("leave_types").select("*").order("sort_order"),
    ]);

    const rows = requestRows || [];
    setRequests(rows);
    setTypes(typeRows || []);

    const ids = [...new Set(rows.map((r) => r.user_id))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", ids);
      const map = {};
      (profiles || []).forEach((p) => (map[p.id] = p));
      setNameMap(map);
    }

    setLoading(false);
  }

  async function review(requestId, status) {
    setError("");
    const { error: reviewError } = await supabase
      .from("leave_requests")
      .update({ status, review_note: reviewNote[requestId] || null })
      .eq("id", requestId);

    if (reviewError) {
      setError(reviewError.message);
      return;
    }
    setReviewNote((prev) => ({ ...prev, [requestId]: "" }));
    load({ silent: true });
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }
  if (!allowed) return null;

  const visible = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  // Who's off right now or soon -- the thing you actually need before
  // assigning work, rather than having to read the whole list.
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveNow = requests.filter(
    (r) => r.status === "approved" && r.start_date <= today && r.end_date >= today
  );
  const upcoming = requests
    .filter((r) => r.status === "approved" && r.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 5);

  return (
    <main className="px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand">Leave Management</h1>
            <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
              ← Back to dashboard
            </a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/dashboard/leave" className="text-sm text-slate-500 hover:underline">
              My Leave
            </a>
            <a
              href="/dashboard/leave/settings"
              className="text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition"
            >
              ⚙ Settings
            </a>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {(onLeaveNow.length > 0 || upcoming.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">On leave today</h2>
              {onLeaveNow.length === 0 ? (
                <p className="text-xs text-slate-400">Everyone is in.</p>
              ) : (
                onLeaveNow.map((r) => (
                  <p key={r.id} className="text-xs text-slate-600">
                    {nameMap[r.user_id]?.full_name || "Someone"} — until {r.end_date}
                  </p>
                ))
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Coming up</h2>
              {upcoming.length === 0 ? (
                <p className="text-xs text-slate-400">Nothing scheduled.</p>
              ) : (
                upcoming.map((r) => (
                  <p key={r.id} className="text-xs text-slate-600">
                    {nameMap[r.user_id]?.full_name || "Someone"} — {r.start_date}
                    {r.end_date !== r.start_date && ` → ${r.end_date}`}
                  </p>
                ))
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-4 flex-wrap">
          {["pending", "approved", "rejected", "all"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-md transition ${
                filter === f ? "bg-brand text-white" : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              {f}
              {f === "pending" && pendingCount > 0 && ` (${pendingCount})`}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {visible.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
              Nothing here.
            </div>
          )}

          {visible.map((r) => {
            const type = types.find((t) => t.id === r.leave_type_id);
            const person = nameMap[r.user_id];
            const isOwnRequest = r.user_id === user.id;

            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-slate-800 text-sm">
                      {person?.full_name || "Unnamed"}
                      {isOwnRequest && <span className="text-xs text-slate-400"> (you)</span>}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {type?.name || "Leave"} · {r.start_date}
                      {r.end_date !== r.start_date && ` → ${r.end_date}`} · {r.days}{" "}
                      {Number(r.days) === 1 ? "day" : "days"}
                      {r.is_half_day && ` (${r.half_day_period} half)`}
                    </p>
                    {r.reason && <p className="text-xs text-slate-600 mt-1">{r.reason}</p>}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>
                </div>

                {r.status === "pending" && !isOwnRequest && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <input
                      value={reviewNote[r.id] || ""}
                      onChange={(e) => setReviewNote((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="Optional note to the requester..."
                      className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => review(r.id, "approved")}
                        className="px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => review(r.id, "rejected")}
                        className="px-3 py-1.5 rounded-md border border-red-300 text-red-600 text-xs font-medium hover:bg-red-50 transition"
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                )}

                {r.status === "pending" && isOwnRequest && (
                  <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    Someone else has to review your own request.
                  </p>
                )}

                {r.reviewed_by && (
                  <p className="text-xs text-slate-400 mt-2">
                    Reviewed by {nameMap[r.reviewed_by]?.full_name || "someone"}
                    {r.review_note && ` — ${r.review_note}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
