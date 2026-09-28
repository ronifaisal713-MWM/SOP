"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { ALL_STAFF_ROLES } from "@/lib/roleCategory";

const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function MyLeavePage() {
  const { checked, allowed, user } = useRequireRole(ALL_STAFF_ROLES);

  const [orgId, setOrgId] = useState(null);
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    startHalf: false,
    endHalf: false,
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const year = new Date().getFullYear();

  useEffect(() => {
    if (!checked || !allowed || !user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, allowed, user]);

  async function load() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    const org = profile?.organization_id || null;
    setOrgId(org);

    const [{ data: typeRows }, { data: balanceRows }, { data: requestRows }, { data: holidayRows }] =
      await Promise.all([
        supabase
          .from("leave_types")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("leave_balances").select("*").eq("user_id", user.id).eq("year", year),
        supabase
          .from("leave_requests")
          .select("*")
          .eq("user_id", user.id)
          .order("start_date", { ascending: false }),
        supabase
          .from("holidays")
          .select("*")
          .gte("holiday_date", `${year}-01-01`)
          .order("holiday_date"),
      ]);

    setTypes(typeRows || []);
    setBalances(balanceRows || []);
    setRequests(requestRows || []);
    setHolidays(holidayRows || []);
    setLoading(false);
  }

  function balanceFor(typeId) {
    const t = types.find((x) => x.id === typeId);
    const b = balances.find((x) => x.leave_type_id === typeId);
    const entitled = Number(b?.entitled ?? t?.default_days ?? 0) + Number(b?.carried_forward || 0);
    const used = Number(b?.used || 0);
    return { entitled, used, remaining: entitled - used };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.leaveTypeId || !form.startDate || !form.endDate) {
      setError("Please fill in the leave type and dates.");
      return;
    }

    setSubmitting(true);

    // days is computed by the database trigger -- sending 0 here is a
    // placeholder the trigger overwrites, so the stored figure always
    // reflects the real working-day count.
    const { error: insertError } = await supabase.from("leave_requests").insert({
      organization_id: orgId,
      user_id: user.id,
      leave_type_id: form.leaveTypeId,
      start_date: form.startDate,
      end_date: form.endDate || form.startDate,
      start_half: form.startHalf,
      end_half: form.endHalf,
      days: 0,
      reason: form.reason || null,
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setShowForm(false);
    setForm({
      leaveTypeId: "",
      startDate: "",
      endDate: "",
      startHalf: false,
      endHalf: false,
      reason: "",
    });
    load();
  }

  async function handleCancel(requestId) {
    if (!confirm("Cancel this leave request?")) return;
    const { error: cancelError } = await supabase
      .from("leave_requests")
      .update({ status: "cancelled" })
      .eq("id", requestId);
    if (cancelError) setError(cancelError.message);
    load();
  }

  // Rough preview only -- the authoritative count comes from the
  // database, which knows the weekend config and holiday list.
  let estimatedDays = null;
  if (form.startDate && form.endDate) {
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (end >= start) {
      const weekendSet = new Set([5, 6]);
      const holidaySet = new Set(holidays.map((h) => h.holiday_date));
      let count = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (!weekendSet.has(d.getDay()) && !holidaySet.has(iso)) count += 1;
      }
      if (form.startHalf) count -= 0.5;
      if (form.endHalf && form.endDate !== form.startDate) count -= 0.5;
      estimatedDays = count > 0 ? count : null;
    }
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }
  if (!allowed) return null;

  const upcomingHolidays = holidays.filter((h) => new Date(h.holiday_date) >= new Date()).slice(0, 5);

  return (
    <main className="px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand">My Leave</h1>
            <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
              ← Back to dashboard
            </a>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
          >
            + Request Leave
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {/* Balances */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {types.map((t) => {
            const { entitled, used, remaining } = balanceFor(t.id);
            return (
              <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  <p className="text-xs text-slate-500 truncate">{t.name}</p>
                </div>
                <p className="text-xl font-bold text-slate-800">{remaining}</p>
                <p className="text-[10px] text-slate-400">
                  {used} used of {entitled}
                </p>
              </div>
            );
          })}
        </div>

        {upcomingHolidays.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm mb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Upcoming Holidays</h2>
            <div className="space-y-1">
              {upcomingHolidays.map((h) => (
                <p key={h.id} className="text-xs text-slate-600">
                  <span className="text-slate-400">{h.holiday_date}</span> — {h.name}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Request history */}
        <h2 className="text-sm font-semibold text-slate-700 mb-2">My Requests</h2>
        <div className="space-y-2">
          {requests.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
              No leave requests yet.
            </div>
          )}

          {requests.map((r) => {
            const type = types.find((t) => t.id === r.leave_type_id);
            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-slate-800 text-sm">
                      {type?.name || "Leave"}
                      {(r.start_half || r.end_half) && (
                        <span className="text-xs text-slate-400 font-normal">
                          {" "}
                          {r.start_half && r.end_half
                            ? "(half days at both ends)"
                            : r.start_half
                            ? "(starts midday)"
                            : "(ends midday)"}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {r.start_date}
                      {r.end_date !== r.start_date && ` → ${r.end_date}`} · {r.days}{" "}
                      {Number(r.days) === 1 ? "day" : "days"}
                    </p>
                    {r.reason && <p className="text-xs text-slate-600 mt-1">{r.reason}</p>}
                    {r.review_note && (
                      <p className="text-xs text-slate-500 mt-1 italic">Note: {r.review_note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                    {r.status === "pending" && (
                      <button
                        onClick={() => handleCancel(r.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Request form */}
        {showForm && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 px-4 py-8">
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-slate-200 rounded-lg p-5 shadow-lg space-y-3 w-full max-w-md max-h-[85vh] overflow-y-auto"
            >
              <h3 className="text-sm font-semibold text-slate-700">Request Leave</h3>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Leave Type *</label>
                <select
                  required
                  value={form.leaveTypeId}
                  onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">-- Select --</option>
                  {types.map((t) => {
                    const { remaining } = balanceFor(t.id);
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name} ({remaining} left)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">From *</label>
                  <input
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        startDate: e.target.value,
                        // Keep a single-date request coherent -- the end
                        // can't sit before the start.
                        endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate,
                      }))
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-500 mt-1.5">
                    <input
                      type="checkbox"
                      checked={form.startHalf}
                      onChange={(e) => setForm((f) => ({ ...f, startHalf: e.target.checked }))}
                    />
                    Half day (from afternoon)
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">To *</label>
                  <input
                    type="date"
                    required
                    value={form.endDate}
                    min={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                  {/* On a single date the two halves mean the same day,
                      so only one checkbox is offered. */}
                  {form.endDate && form.endDate !== form.startDate && (
                    <label className="flex items-center gap-2 text-xs text-slate-500 mt-1.5">
                      <input
                        type="checkbox"
                        checked={form.endHalf}
                        onChange={(e) => setForm((f) => ({ ...f, endHalf: e.target.checked }))}
                      />
                      Half day (until midday)
                    </label>
                  )}
                </div>
              </div>

              {estimatedDays !== null && (
                <p className="text-xs text-brand bg-brand/5 rounded-md px-3 py-2">
                  Approximately <strong>{estimatedDays}</strong>{" "}
                  {estimatedDays === 1 ? "day" : "days"} — the exact figure is confirmed on submit,
                  after weekends and holidays are excluded.
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Reason</label>
                <textarea
                  rows={3}
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <p className="text-xs text-slate-400">
                Weekends and holidays are excluded from the day count automatically.
              </p>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError("");
                  }}
                  className="px-4 py-2 rounded-md border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
