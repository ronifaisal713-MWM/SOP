"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";

const COLUMNS = [
  { key: "incoming", label: "Incoming" },
  { key: "processing", label: "Processing" },
  { key: "internal_review", label: "Internal Review" },
  { key: "outgoing", label: "Outgoing" },
  { key: "client_review", label: "Client Review" },
  { key: "revision", label: "Revision" },
  { key: "approved", label: "Approved" },
  { key: "done", label: "Done" },
];

const PRIORITY_ICON = { urgent: "🔴", high: "🟠", normal: "🟡", low: "🟢" };

export default function TasksKanbanPage() {
  const { checked } = useRequireAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!checked) return;
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  async function loadTasks() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: true });

    if (fetchError) setError(fetchError.message);
    setTasks(data || []);
    setLoading(false);
  }

  async function moveTask(taskId, newStatus) {
    // Optimistic update so the board feels instant.
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (updateError) {
      setError(updateError.message);
      loadTasks(); // revert to real state on failure
    }
  }

  if (!checked) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Task Board</h1>
          <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
            ← Back to dashboard
          </a>
        </div>
      </div>

      {loading && <p className="text-slate-400 text-sm">Loading...</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!loading && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="min-w-[260px] w-[260px] flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-600">{col.label}</h2>
                  <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-2 py-0.5">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2 min-h-[80px]">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-sm"
                    >
                      <p className="font-medium text-slate-800 mb-1">{t.title}</p>
                      <p className="text-slate-400 text-xs mb-2">
                        {PRIORITY_ICON[t.priority] || ""} {t.priority}
                        {t.deadline ? ` · due ${t.deadline}` : ""}
                      </p>
                      <a
                        href={`/dashboard/tasks/${t.id}`}
                        className="text-xs text-brand hover:underline block mb-2"
                      >
                        Open · Chat
                      </a>
                      <select
                        value={t.status}
                        onChange={(e) => moveTask(t.id, e.target.value)}
                        className="w-full border border-slate-200 rounded-md text-xs px-2 py-1 bg-slate-50"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  {colTasks.length === 0 && (
                    <div className="border border-dashed border-slate-200 rounded-lg p-3 text-center text-xs text-slate-300">
                      empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
