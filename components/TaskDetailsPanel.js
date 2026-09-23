"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ALL_STAFF_ROLES } from "@/lib/roleCategory";
import DocumentsManager from "@/components/DocumentsManager";
import TimeTracker from "@/components/TimeTracker";
import TaskChecklist from "@/components/TaskChecklist";

const PRIORITY_ICON = { urgent: "🔴", high: "🟠", normal: "🟡", low: "🟢" };
const STATUS_OPTIONS = [
  "incoming",
  "processing",
  "internal_review",
  "outgoing",
  "client_review",
  "revision",
  "approved",
  "done",
];

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// The task's info, assignees, checklist, time tracking, and history --
// everything except the chat. Used both inside the Task Board's popup
// and on the full Task detail page, so the two can't drift apart.
export default function TaskDetailsPanel({ taskId, currentUser, isStaff, onTaskChanged }) {
  const [task, setTask] = useState(null);
  const [team, setTeam] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [addAssigneeId, setAddAssigneeId] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (taskError) {
      setError(taskError.message);
      setLoading(false);
      return;
    }
    setTask(taskData);

    if (isStaff) {
      const { data: teamData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ALL_STAFF_ROLES);
      setTeam(teamData || []);
    }

    await loadAssignees();
    setLoading(false);
    loadHistory();
  }

  async function loadAssignees() {
    const { data: rows } = await supabase.from("task_assignees").select("user_id").eq("task_id", taskId);
    const ids = (rows || []).map((r) => r.user_id);
    if (ids.length === 0) {
      setAssignees([]);
      return;
    }
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    setAssignees(profiles || []);
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("entity_type", "task")
      .eq("entity_id", taskId)
      .order("created_at", { ascending: false });

    const rows = data || [];
    if (rows.length > 0) {
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
      const map = {};
      (profiles || []).forEach((p) => (map[p.id] = p.full_name));
      setHistory(rows.map((r) => ({ ...r, actorName: map[r.actor_id] || "Unknown" })));
    } else {
      setHistory([]);
    }
  }

  useEffect(() => {
    if (!taskId || !currentUser) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, currentUser]);

  async function moveStatus(newStatus) {
    setTask((t) => ({ ...t, status: newStatus }));
    await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    loadHistory();
    onTaskChanged?.();
  }

  async function handleAddAssignee() {
    if (!addAssigneeId) return;
    await supabase.from("task_assignees").insert({ task_id: taskId, user_id: addAssigneeId });
    setAddAssigneeId("");
    loadAssignees();
    onTaskChanged?.();
  }

  async function handleRemoveAssignee(userId) {
    await supabase.from("task_assignees").delete().eq("task_id", taskId).eq("user_id", userId);
    loadAssignees();
    onTaskChanged?.();
  }

  if (loading) {
    return <p className="text-sm text-slate-400 p-4">Loading...</p>;
  }
  if (error && !task) {
    return <p className="text-sm text-red-600 p-4">{error}</p>;
  }
  if (!task) {
    return <p className="text-sm text-slate-500 p-4">Task not found.</p>;
  }

  const assignableTeam = team.filter((m) => !assignees.some((a) => a.id === m.id));

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-800">{task.title}</h2>
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 flex-shrink-0">
            {task.status}
          </span>
        </div>

        <p className="text-xs text-slate-400 mt-1">
          {PRIORITY_ICON[task.priority] || ""} {task.priority}
          {task.deadline ? ` · due ${task.deadline}` : ""}
        </p>

        {task.description && (
          <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{task.description}</p>
        )}

        {task.requirement_id && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <DocumentsManager
              entityColumn="requirement_id"
              entityId={task.requirement_id}
              folder={`requirements/${task.requirement_id}`}
              canManage={false}
            />
            <p className="text-xs text-slate-300 mt-1">From the original Requirement.</p>
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs text-slate-400 mb-1">Assigned to</p>
          <div className="flex flex-wrap gap-2">
            {assignees.length === 0 && <p className="text-sm text-slate-400">Unassigned</p>}
            {assignees.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 bg-slate-100 rounded-full pl-1 pr-2 py-1">
                <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center text-[9px] font-semibold">
                  {initials(a.full_name)}
                </span>
                <span className="text-xs text-slate-700">{a.full_name || "Unnamed"}</span>
                {isStaff && (
                  <button
                    onClick={() => handleRemoveAssignee(a.id)}
                    className="text-slate-400 hover:text-red-500 text-xs ml-0.5"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>

          {isStaff && assignableTeam.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <select
                value={addAssigneeId}
                onChange={(e) => setAddAssigneeId(e.target.value)}
                className="border border-slate-200 rounded-md text-sm px-2 py-1 bg-slate-50"
              >
                <option value="">Add someone...</option>
                {assignableTeam.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || "Unnamed"}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddAssignee}
                disabled={!addAssigneeId}
                className="text-xs px-3 py-1.5 rounded-md bg-brand text-white font-medium hover:bg-brand-light transition disabled:opacity-50"
              >
                + Add
              </button>
            </div>
          )}
        </div>

        {isStaff && (
          <div className="mt-4">
            <label className="text-xs text-slate-400 block mb-1">Move status</label>
            <select
              value={task.status}
              onChange={(e) => moveStatus(e.target.value)}
              className="border border-slate-200 rounded-md text-sm px-2 py-1 bg-slate-50"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Checklist</h3>
        <TaskChecklist taskId={taskId} currentUser={currentUser} isStaff={isStaff} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Time Tracking</h3>
        <TimeTracker taskId={taskId} currentUser={currentUser} isStaff={isStaff} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <h3 className="text-sm font-semibold text-slate-600">
            History {history.length > 0 && `(${history.length})`}
          </h3>
          <span className="text-slate-400 text-xs">{showHistory ? "▲" : "▼"}</span>
        </button>

        {showHistory && (
          <div className="border-t border-slate-100 px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
            {history.length === 0 && <p className="text-xs text-slate-300">No status changes yet.</p>}
            {history.map((h) => (
              <div key={h.id} className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">{h.actorName}</span> — {h.action}
                <span className="text-slate-300">
                  {" · "}
                  {new Date(h.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
