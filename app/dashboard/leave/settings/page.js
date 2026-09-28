"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { AGENCY_ROLES } from "@/lib/roleCategory";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Only events worth interrupting an inbox over. Chat, mentions and
// status moves stay in-app and push -- emailing those would bury the
// ones that actually need a decision.
const EMAIL_EVENTS = [
  {
    key: "leave_request",
    label: "Someone requests leave",
    hint: "Goes to whoever can approve it.",
    fixedRecipient: false,
  },
  {
    key: "leave_reviewed",
    label: "Leave approved or rejected",
    hint: "Always goes to the person who asked — this just turns it on or off.",
    fixedRecipient: true,
  },
  {
    key: "new_requirement",
    label: "New requirement submitted",
    hint: "A client (or teammate) files new work.",
    fixedRecipient: false,
  },
  {
    key: "client_decision",
    label: "Client approves or requests revision",
    hint: "The client has acted on work you sent them.",
    fixedRecipient: false,
  },
];

const RECIPIENT_MODES = [
  { value: "off", label: "No email" },
  { value: "owner", label: "Owner only" },
  { value: "admins", label: "Owner + Admins" },
  { value: "approvers", label: "Owner, Admins, PMs, Team Leads" },
  { value: "specific", label: "Specific people..." },
];

export default function LeaveSettingsPage() {
  const { checked, allowed, user } = useRequireRole(AGENCY_ROLES);

  const [orgId, setOrgId] = useState(null);
  const [weekendDays, setWeekendDays] = useState([5, 6]);
  const [types, setTypes] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [staff, setStaff] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const [newType, setNewType] = useState({ name: "", days: "", isPaid: true, color: "#1F4E79" });
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "" });
  const [emailRules, setEmailRules] = useState([]);

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

    const [{ data: settings }, { data: typeRows }, { data: holidayRows }, { data: staffRows }] =
      await Promise.all([
        supabase.from("leave_settings").select("*").eq("organization_id", org).maybeSingle(),
        supabase.from("leave_types").select("*").order("sort_order"),
        supabase.from("holidays").select("*").order("holiday_date"),
        supabase.from("profiles").select("id, full_name, role").eq("organization_id", org),
      ]);

    if (settings?.weekend_days) setWeekendDays(settings.weekend_days);
    setTypes(typeRows || []);
    setHolidays(holidayRows || []);
    setStaff(staffRows || []);

    const { data: balanceRows } = await supabase.from("leave_balances").select("*").eq("year", year);
    setBalances(balanceRows || []);

    const { data: ruleRows } = await supabase
      .from("email_notification_rules")
      .select("*")
      .eq("organization_id", org);
    setEmailRules(ruleRows || []);

    setLoading(false);
  }

  function flash(msg) {
    setSaved(msg);
    setTimeout(() => setSaved(""), 2500);
  }

  async function saveWeekend(days) {
    setWeekendDays(days);
    const { error: e } = await supabase
      .from("leave_settings")
      .upsert({ organization_id: orgId, weekend_days: days, updated_at: new Date().toISOString() });
    if (e) setError(e.message);
    else flash("Weekend updated");
  }

  function toggleWeekendDay(dayIndex) {
    const next = weekendDays.includes(dayIndex)
      ? weekendDays.filter((d) => d !== dayIndex)
      : [...weekendDays, dayIndex].sort();
    saveWeekend(next);
  }

  async function addType(e) {
    e.preventDefault();
    if (!newType.name.trim()) return;

    const { error: e2 } = await supabase.from("leave_types").insert({
      organization_id: orgId,
      name: newType.name.trim(),
      default_days: Number(newType.days) || 0,
      is_paid: newType.isPaid,
      color: newType.color,
      sort_order: types.length + 1,
    });

    if (e2) setError(e2.message);
    else {
      setNewType({ name: "", days: "", isPaid: true, color: "#1F4E79" });
      flash("Leave type added");
      load();
    }
  }

  async function toggleTypeActive(type) {
    await supabase.from("leave_types").update({ is_active: !type.is_active }).eq("id", type.id);
    load();
  }

  async function addHoliday(e) {
    e.preventDefault();
    if (!newHoliday.date || !newHoliday.name.trim()) return;

    const { error: e2 } = await supabase.from("holidays").insert({
      organization_id: orgId,
      holiday_date: newHoliday.date,
      name: newHoliday.name.trim(),
      created_by: user.id,
    });

    if (e2) setError(e2.message);
    else {
      setNewHoliday({ date: "", name: "" });
      flash("Holiday added — everyone has been notified");
      load();
    }
  }

  async function removeHoliday(id) {
    await supabase.from("holidays").delete().eq("id", id);
    load();
  }

  async function setEntitlement(userId, typeId, value) {
    const entitled = Number(value) || 0;
    const { error: e } = await supabase
      .from("leave_balances")
      .upsert(
        { user_id: userId, leave_type_id: typeId, year, entitled, updated_at: new Date().toISOString() },
        { onConflict: "user_id,leave_type_id,year" }
      );
    if (e) setError(e.message);
    else {
      flash("Entitlement saved");
      load();
    }
  }

  async function setEmailRule(eventKey, mode, ids = []) {
    const { error: e } = await supabase.from("email_notification_rules").upsert(
      {
        organization_id: orgId,
        event_key: eventKey,
        recipient_mode: mode,
        recipient_ids: ids,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,event_key" }
    );
    if (e) setError(e.message);
    else {
      flash("Email setting saved");
      load();
    }
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }
  if (!allowed) return null;

  return (
    <main className="px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Leave Settings</h1>
          <a href="/dashboard/leave/manage" className="text-sm text-slate-500 hover:underline">
            ← Leave Management
          </a>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">{saved}</p>}

        {/* Weekend */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Weekend Days</h2>
          <p className="text-xs text-slate-400 mb-3">
            These are skipped when counting leave days.
          </p>
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((name, i) => (
              <button
                key={name}
                onClick={() => toggleWeekendDay(i)}
                className={`text-xs px-3 py-1.5 rounded-md border transition ${
                  weekendDays.includes(i)
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {/* Leave types */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Leave Types</h2>

          <div className="space-y-2 mb-4">
            {types.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-2 p-2 rounded-md border ${
                  t.is_active ? "border-slate-100 bg-slate-50" : "border-slate-100 opacity-50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
                  <span className="text-sm text-slate-700 truncate">{t.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {t.default_days}d {t.is_paid ? "· paid" : "· unpaid"}
                  </span>
                </div>
                <button
                  onClick={() => toggleTypeActive(t)}
                  className="text-xs text-slate-400 hover:text-brand flex-shrink-0"
                >
                  {t.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={addType} className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-medium text-slate-600">Add a type</p>
            <div className="flex gap-2 flex-wrap">
              <input
                value={newType.name}
                onChange={(e) => setNewType((n) => ({ ...n, name: e.target.value }))}
                placeholder="e.g. Study Leave"
                className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.5"
                value={newType.days}
                onChange={(e) => setNewType((n) => ({ ...n, days: e.target.value }))}
                placeholder="Days"
                className="w-20 border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              />
              <input
                type="color"
                value={newType.color}
                onChange={(e) => setNewType((n) => ({ ...n, color: e.target.value }))}
                className="w-10 h-9 border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={newType.isPaid}
                  onChange={(e) => setNewType((n) => ({ ...n, isPaid: e.target.checked }))}
                />
                Paid leave
              </label>
              <button
                type="submit"
                className="text-xs px-3 py-1.5 rounded-md bg-brand text-white font-medium hover:bg-brand-light transition"
              >
                Add Type
              </button>
            </div>
          </form>
        </div>

        {/* Holidays */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Holidays</h2>
          <p className="text-xs text-slate-400 mb-3">
            Adding one notifies everyone, and excludes that date from leave counts.
          </p>

          <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
            {holidays.length === 0 && <p className="text-xs text-slate-400">None added yet.</p>}
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-700 truncate">
                  <span className="text-slate-400 text-xs">{h.holiday_date}</span> — {h.name}
                </span>
                <button
                  onClick={() => removeHoliday(h.id)}
                  className="text-xs text-red-500 hover:underline flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={addHoliday} className="border-t border-slate-100 pt-3 flex gap-2 flex-wrap">
            <input
              type="date"
              value={newHoliday.date}
              onChange={(e) => setNewHoliday((h) => ({ ...h, date: e.target.value }))}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            />
            <input
              value={newHoliday.name}
              onChange={(e) => setNewHoliday((h) => ({ ...h, name: e.target.value }))}
              placeholder="e.g. Victory Day"
              className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded-md bg-brand text-white font-medium hover:bg-brand-light transition"
            >
              Add
            </button>
          </form>
        </div>

        {/* Email notifications */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Email Notifications</h2>
          <p className="text-xs text-slate-400 mb-4">
            Choose who gets an email for each event. Everything else stays in-app only.
          </p>

          <div className="space-y-4">
            {EMAIL_EVENTS.map((ev) => {
              const rule = emailRules.find((r) => r.event_key === ev.key);
              const mode = rule?.recipient_mode || "off";
              const ids = rule?.recipient_ids || [];

              return (
                <div key={ev.key} className="border-b border-slate-100 last:border-0 pb-4 last:pb-0">
                  <p className="text-sm text-slate-700">{ev.label}</p>
                  <p className="text-xs text-slate-400 mb-2">{ev.hint}</p>

                  {ev.fixedRecipient ? (
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={mode !== "off"}
                        onChange={(e) => setEmailRule(ev.key, e.target.checked ? "owner" : "off")}
                      />
                      Send this email
                    </label>
                  ) : (
                    <>
                      <select
                        value={mode}
                        onChange={(e) => setEmailRule(ev.key, e.target.value, ids)}
                        className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
                      >
                        {RECIPIENT_MODES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>

                      {mode === "specific" && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {staff.map((s) => (
                            <label
                              key={s.id}
                              className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
                            >
                              <input
                                type="checkbox"
                                checked={ids.includes(s.id)}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...ids, s.id]
                                    : ids.filter((x) => x !== s.id);
                                  setEmailRule(ev.key, "specific", next);
                                }}
                              />
                              {s.full_name || "Unnamed"}
                            </label>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Entitlements */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Entitlements ({year})</h2>
          <p className="text-xs text-slate-400 mb-3">
            Leave blank to use the type&apos;s default. Set a number to override it for that person.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs">
                  <th className="py-2 pr-3 font-medium">Team Member</th>
                  {types
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <th key={t.id} className="py-2 px-2 font-medium whitespace-nowrap">
                        {t.name}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">
                      {s.full_name || "Unnamed"}
                    </td>
                    {types
                      .filter((t) => t.is_active)
                      .map((t) => {
                        const b = balances.find(
                          (x) => x.user_id === s.id && x.leave_type_id === t.id
                        );
                        return (
                          <td key={t.id} className="py-2 px-2">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              defaultValue={b?.entitled ?? ""}
                              placeholder={String(t.default_days)}
                              onBlur={(e) => {
                                if (e.target.value !== String(b?.entitled ?? "")) {
                                  setEntitlement(s.id, t.id, e.target.value);
                                }
                              }}
                              className="w-16 border border-slate-200 rounded px-2 py-1 text-xs"
                            />
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
