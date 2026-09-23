"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0 && m === 0) return "0m";
  return `${h > 0 ? `${h}h ` : ""}${m}m`;
}

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Embedded on the Task detail page. Staff/Agency can start/stop a
// timer or log time manually; the client sees the same list and total
// read-only, for the same transparency the rest of the app follows.
export default function TimeTracker({ taskId, currentUser, isStaff }) {
  const [entries, setEntries] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [activeEntry, setActiveEntry] = useState(null); // this user's running timer, if any (may belong to a different task)
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("time_entries")
      .select("*")
      .eq("task_id", taskId)
      .order("started_at", { ascending: false });

    const rows = data || [];
    setEntries(rows);

    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      const map = {};
      (profiles || []).forEach((p) => (map[p.id] = p.full_name));
      setProfileMap(map);
    }

    if (isStaff && currentUser) {
      const { data: active } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", currentUser.id)
        .is("ended_at", null)
        .maybeSingle();
      setActiveEntry(active || null);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    if (!activeEntry || activeEntry.task_id !== taskId) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(activeEntry.started_at).getTime()) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeEntry, taskId]);

  async function handleStart() {
    setError("");
    if (activeEntry) {
      setError(
        activeEntry.task_id === taskId
          ? "Timer is already running on this task."
          : "You have a timer running on another task -- stop it first."
      );
      return;
    }
    const { data, error: insertError } = await supabase
      .from("time_entries")
      .insert({ task_id: taskId, user_id: currentUser.id })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setActiveEntry(data);
  }

  async function handleStop() {
    if (!activeEntry) return;
    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - new Date(activeEntry.started_at).getTime()) / 1000);

    await supabase
      .from("time_entries")
      .update({ ended_at: endedAt.toISOString(), duration_seconds: durationSeconds })
      .eq("id", activeEntry.id);

    setActiveEntry(null);
    load();
  }

  async function handleAddManual(e) {
    e.preventDefault();
    const h = parseInt(manualHours || "0", 10);
    const m = parseInt(manualMinutes || "0", 10);
    const totalSeconds = h * 3600 + m * 60;
    if (totalSeconds <= 0) {
      setError("Enter a duration greater than 0.");
      return;
    }

    const now = new Date();
    const startedAt = new Date(now.getTime() - totalSeconds * 1000);

    const { error: insertError } = await supabase.from("time_entries").insert({
      task_id: taskId,
      user_id: currentUser.id,
      started_at: startedAt.toISOString(),
      ended_at: now.toISOString(),
      duration_seconds: totalSeconds,
      notes: manualNotes.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setManualHours("");
    setManualMinutes("");
    setManualNotes("");
    setShowManual(false);
    setError("");
    load();
  }

  async function handleDelete(entryId) {
    await supabase.from("time_entries").delete().eq("id", entryId);
    load();
  }

  const totalSeconds =
    entries.reduce((sum, e) => sum + (e.duration_seconds || 0), 0) +
    (activeEntry?.task_id === taskId ? elapsed : 0);
  const isRunningHere = activeEntry?.task_id === taskId;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <p className="text-sm text-slate-600">
          Total time: <span className="font-semibold text-slate-800">{formatDuration(totalSeconds)}</span>
        </p>

        {isStaff && (
          <div className="flex items-center gap-2">
            {isRunningHere ? (
              <button
                onClick={handleStop}
                className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 transition"
              >
                ⏹ Stop ({formatDuration(elapsed)})
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="text-xs px-3 py-1.5 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 transition"
              >
                ▶ Start Timer
              </button>
            )}
            <button
              onClick={() => setShowManual((s) => !s)}
              className="text-xs text-brand hover:underline"
            >
              + Log manually
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {showManual && (
        <form onSubmit={handleAddManual} className="border border-slate-200 rounded-md p-3 mb-3 space-y-2">
          <div className="flex gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Hours</label>
              <input
                type="number"
                min="0"
                value={manualHours}
                onChange={(e) => setManualHours(e.target.value)}
                className="w-20 border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Minutes</label>
              <input
                type="number"
                min="0"
                max="59"
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
                className="w-20 border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </div>
          </div>
          <input
            value={manualNotes}
            onChange={(e) => setManualNotes(e.target.value)}
            placeholder="What was worked on (optional)"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded-md bg-brand text-white font-medium hover:bg-brand-light transition"
            >
              Add Entry
            </button>
            <button
              type="button"
              onClick={() => setShowManual(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-slate-300">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-slate-300">No time logged yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-md px-2 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center text-[9px] font-semibold flex-shrink-0">
                  {initials(profileMap[e.user_id])}
                </span>
                <span className="truncate">
                  {profileMap[e.user_id] || "Unknown"} — {formatDuration(e.duration_seconds || 0)}
                  {e.notes && <span className="text-slate-400"> · {e.notes}</span>}
                </span>
              </div>
              {isStaff && (
                <button
                  onClick={() => handleDelete(e.id)}
                  className="text-red-500 hover:underline flex-shrink-0 ml-2"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
