"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";
import { ALL_STAFF_ROLES } from "@/lib/roleCategory";
import ChatWidget from "@/components/ChatWidget";
import TaskChat from "@/components/TaskChat";
import TaskDetailsPanel from "@/components/TaskDetailsPanel";

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

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function AvatarStack({ names }) {
  if (!names || names.length === 0) {
    return (
      <div
        title="Unassigned"
        className="w-5 h-5 rounded-full bg-slate-300 text-white flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
      >
        ?
      </div>
    );
  }
  const shown = names.slice(0, 3);
  const overflow = names.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5 flex-shrink-0">
      {shown.map((name, i) => (
        <div
          key={i}
          title={name}
          className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center text-[9px] font-semibold border-2 border-white"
        >
          {initials(name)}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full bg-slate-300 text-white flex items-center justify-center text-[8px] font-semibold border-2 border-white">
          +{overflow}
        </div>
      )}
    </div>
  );
}

export default function TasksKanbanPage() {
  const { checked, allowed, user, role } = useRequireRole(ALL_STAFF_ROLES);
  const [tasks, setTasks] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [assigneesByTask, setAssigneesByTask] = useState({});
  const [checklistByTask, setChecklistByTask] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openChatTask, setOpenChatTask] = useState(null);
  const [openDetailsTask, setOpenDetailsTask] = useState(null);

  useEffect(() => {
    if (!checked || !allowed) return;
    loadTasks();

    // Visiting the board is exactly "seeing there's a new/updated task" --
    // clear the sidebar/tab badge for it without waiting for the bell.
    // (Deliberately does NOT touch pending @mention acknowledgments --
    // those only clear via the ✓ button in the chat itself.)
    if (user) {
      supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false)
        .ilike("link", "/dashboard/tasks%")
        .then(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, allowed, user]);

  async function loadTasks() {
    setLoading(true);
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

      let map = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        (profiles || []).forEach((p) => (map[p.id] = p.full_name));
        setProfileMap(map);
      }

      const byTask = {};
      rows.forEach((r) => {
        if (!byTask[r.task_id]) byTask[r.task_id] = [];
        byTask[r.task_id].push(map[r.user_id] || "Unnamed");
      });
      setAssigneesByTask(byTask);

      // Checklist progress, so the board shows how far along each task
      // is without having to open it.
      const { data: checklistRows } = await supabase
        .from("task_checklist_items")
        .select("task_id, is_done")
        .in("task_id", taskIds);

      const progress = {};
      (checklistRows || []).forEach((c) => {
        if (!progress[c.task_id]) progress[c.task_id] = { done: 0, total: 0 };
        progress[c.task_id].total += 1;
        if (c.is_done) progress[c.task_id].done += 1;
      });
      setChecklistByTask(progress);
    }

    setLoading(false);
  }

  async function moveTask(taskId, newStatus) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (updateError) {
      setError(updateError.message);
      loadTasks();
    }
  }

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
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
                      <div className="flex items-center gap-2 mb-1">
                        <AvatarStack names={assigneesByTask[t.id]} />
                        <p className="font-medium text-slate-800 flex-1">{t.title}</p>
                      </div>
                      <p className="text-slate-400 text-xs mb-1 truncate">
                        {assigneesByTask[t.id]?.length > 0
                          ? assigneesByTask[t.id].join(", ")
                          : "Unassigned"}
                      </p>
                      <p className="text-slate-400 text-xs mb-2">
                        {PRIORITY_ICON[t.priority] || ""} {t.priority}
                        {t.deadline ? ` · due ${t.deadline}` : ""}
                        {checklistByTask[t.id] && (
                          <>
                            {" · "}
                            <span
                              className={
                                checklistByTask[t.id].done === checklistByTask[t.id].total
                                  ? "text-green-600"
                                  : ""
                              }
                            >
                              ☑ {checklistByTask[t.id].done}/{checklistByTask[t.id].total}
                            </span>
                          </>
                        )}
                      </p>
                      <div className="flex gap-3 mb-2">
                        <button
                          onClick={() => setOpenChatTask(t)}
                          className="text-xs text-brand hover:underline"
                        >
                          💬 Chat
                        </button>
                        <button
                          onClick={() => setOpenDetailsTask(t)}
                          className="text-xs text-slate-400 hover:underline"
                        >
                          Details
                        </button>
                      </div>
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

      {openChatTask && (
        <ChatWidget
          title={`💬 ${openChatTask.title}`}
          open={true}
          onToggle={() => setOpenChatTask(null)}
          onClose={() => setOpenChatTask(null)}
        >
          <TaskChat taskId={openChatTask.id} currentUser={user} isStaff={true} />
        </ChatWidget>
      )}

      {openDetailsTask && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 px-4 py-8"
          onClick={() => setOpenDetailsTask(null)}
        >
          <div
            className="bg-slate-50 rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 rounded-t-lg flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-700 truncate min-w-0">Task Details</h2>
              <button
                onClick={() => setOpenDetailsTask(null)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none flex-shrink-0 ml-2"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-y-auto min-h-0 flex-1">
              <TaskDetailsPanel
                taskId={openDetailsTask.id}
                currentUser={user}
                isStaff={true}
                onTaskChanged={loadTasks}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
