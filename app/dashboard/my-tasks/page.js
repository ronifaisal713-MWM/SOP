"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import ChatWidget from "@/components/ChatWidget";
import TaskChat from "@/components/TaskChat";

const COLUMNS = [
  { key: "incoming", label: "Incoming" },
  { key: "processing", label: "Processing" },
  { key: "internal_review", label: "Internal Review" },
  { key: "outgoing", label: "Outgoing" },
  { key: "client_review", label: "Needs Your Review" },
  { key: "revision", label: "Revision Requested" },
  { key: "approved", label: "Approved" },
  { key: "done", label: "Done" },
];

const PRIORITY_ICON = { urgent: "🔴", high: "🟠", normal: "🟡", low: "🟢" };

export default function MyTasksPage() {
  const { user, checked } = useRequireAuth();
  const [tasks, setTasks] = useState([]);
  const [assigneesByTask, setAssigneesByTask] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revisionNoteFor, setRevisionNoteFor] = useState(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openChatTask, setOpenChatTask] = useState(null);

  useEffect(() => {
    if (!checked || !user) return;
    loadTasks();

    // Visiting this board is exactly "seeing there's a task update" --
    // clear the sidebar/tab badge without waiting for the bell.
    supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .ilike("link", "/dashboard/tasks%")
      .then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user]);

  async function loadTasks() {
    setLoading(true);
    // RLS already scopes this to only the signed-in client's own tasks.
    const { data, error: fetchError } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: true });

    if (fetchError) setError(fetchError.message);
    const taskList = data || [];
    setTasks(taskList);

    const taskIds = taskList.map((t) => t.id);
    if (taskIds.length > 0) {
      const { data: assigneeRows } = await supabase
        .from("task_assignees")
        .select("task_id, user_id")
        .in("task_id", taskIds);

      const rows = assigneeRows || [];
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      let nameMap = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        (profiles || []).forEach((p) => (nameMap[p.id] = p.full_name));
      }

      const byTask = {};
      rows.forEach((r) => {
        if (!byTask[r.task_id]) byTask[r.task_id] = [];
        byTask[r.task_id].push(nameMap[r.user_id] || "Unnamed");
      });
      setAssigneesByTask(byTask);
    }

    setLoading(false);
  }

  async function handleApprove(task) {
    setSubmitting(true);
    setError("");

    const { error: approvalError } = await supabase.from("approvals").insert({
      task_id: task.id,
      approved_by: user.id,
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    if (approvalError) {
      setError(approvalError.message);
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: "approved" })
      .eq("id", task.id);
    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "approved" } : t)));
    setSubmitting(false);
  }

  async function handleRequestRevision(task) {
    if (!revisionNote.trim()) return;
    setSubmitting(true);
    setError("");

    const { error: approvalError } = await supabase.from("approvals").insert({
      task_id: task.id,
      approved_by: user.id,
      status: "revision_requested",
      comment: revisionNote.trim(),
    });
    if (approvalError) {
      setError(approvalError.message);
      setSubmitting(false);
      return;
    }

    // Also drop the note into the task's chat (as a client-visible
    // message) so the team sees it right where they're already working.
    await supabase.from("messages").insert({
      task_id: task.id,
      sender_id: user.id,
      body: `Revision requested: ${revisionNote.trim()}`,
      visibility: "client",
    });

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: "revision" })
      .eq("id", task.id);
    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "revision" } : t)));
    setRevisionNoteFor(null);
    setRevisionNote("");
    setSubmitting(false);
  }

  if (!checked) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  return (
    <main className="px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-brand">My Tasks</h1>
        <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to dashboard
        </a>
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
                      <p className="text-slate-400 text-xs mb-1 truncate">
                        {assigneesByTask[t.id]?.length > 0
                          ? assigneesByTask[t.id].join(", ")
                          : "Unassigned"}
                      </p>
                      <p className="text-slate-400 text-xs mb-2">
                        {PRIORITY_ICON[t.priority] || ""} {t.priority}
                        {t.deadline ? ` · due ${t.deadline}` : ""}
                      </p>
                      <button
                        onClick={() => setOpenChatTask(t)}
                        className="text-xs text-brand hover:underline block mb-2"
                      >
                        💬 View &amp; Chat
                      </button>

                      {t.status === "client_review" && (
                        <div className="border-t border-slate-100 pt-2 mt-2 space-y-2">
                          <button
                            onClick={() => handleApprove(t)}
                            disabled={submitting}
                            className="w-full text-xs bg-green-600 text-white rounded-md py-1.5 font-medium hover:bg-green-700 transition disabled:opacity-50"
                          >
                            ✓ Approve
                          </button>

                          {revisionNoteFor === t.id ? (
                            <div>
                              <textarea
                                value={revisionNote}
                                onChange={(e) => setRevisionNote(e.target.value)}
                                placeholder="What needs to change?"
                                rows={2}
                                className="w-full border border-slate-200 rounded-md text-xs px-2 py-1"
                              />
                              <div className="flex gap-1 mt-1">
                                <button
                                  onClick={() => handleRequestRevision(t)}
                                  disabled={submitting || !revisionNote.trim()}
                                  className="flex-1 text-xs bg-red-500 text-white rounded-md py-1 font-medium hover:bg-red-600 transition disabled:opacity-50"
                                >
                                  Send
                                </button>
                                <button
                                  onClick={() => {
                                    setRevisionNoteFor(null);
                                    setRevisionNote("");
                                  }}
                                  className="flex-1 text-xs border border-slate-200 rounded-md py-1 text-slate-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setRevisionNoteFor(t.id)}
                              className="w-full text-xs border border-red-300 text-red-600 rounded-md py-1.5 font-medium hover:bg-red-50 transition"
                            >
                              ✕ Request Revision
                            </button>
                          )}
                        </div>
                      )}
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

      {openChatTask && (
        <ChatWidget
          title={`💬 ${openChatTask.title}`}
          open={true}
          onToggle={() => setOpenChatTask(null)}
          onClose={() => setOpenChatTask(null)}
        >
          <TaskChat taskId={openChatTask.id} currentUser={user} isStaff={false} />
        </ChatWidget>
      )}
    </main>
  );
}
