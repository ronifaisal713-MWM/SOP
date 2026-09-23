"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ALL_STAFF_ROLES } from "@/lib/roleCategory";
import TaskChat from "@/components/TaskChat";
import DocumentsManager from "@/components/DocumentsManager";
import TimeTracker from "@/components/TimeTracker";

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

export default function TaskDetailPage() {
  const { user, checked } = useRequireAuth();
  const params = useParams();
  const { id } = params;

  const [task, setTask] = useState(null);
  const [isStaff, setIsStaff] = useState(false);
  const [team, setTeam] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [addAssigneeId, setAddAssigneeId] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const staff = !!profile?.role && ALL_STAFF_ROLES.includes(profile.role);
    setIsStaff(staff);

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (taskError) {
      setError(taskError.message);
      setLoading(false);
      return;
    }
    setTask(taskData);

    if (staff) {
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
    const { data: rows } = await supabase.from("task_assignees").select("user_id").eq("task_id", id);
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
      .eq("entity_id", id)
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
    if (!checked || !user || !id) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user, id]);

  async function moveStatus(newStatus) {
    setTask((t) => ({ ...t, status: newStatus }));
    await supabase.from("tasks").update({ status: newStatus }).eq("id", id);
    loadHistory();
  }

  async function handleAddAssignee() {
    if (!addAssigneeId) return;
    await supabase.from("task_assignees").insert({ task_id: id, user_id: addAssigneeId });
    setAddAssigneeId("");
    loadAssignees();
  }

  async function handleRemoveAssignee(userId) {
    await supabase.from("task_assignees").delete().eq("task_id", id).eq("user_id", userId);
    loadAssignees();
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  if (error && !task) {
    return <main className="flex items-center justify-center py-20 text-red-600 text-sm">{error}</main>;
  }

  if (!task) {
    return (
      <main className="flex items-center justify-center py-20 text-slate-500 text-sm">
        Task not found.
      </main>
    );
  }

  const assignableTeam = team.filter((m) => !assignees.some((a) => a.id === m.id));

  return (
    <main className="px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <a href="/dashboard/tasks" className="text-sm text-slate-500 hover:underline">
          ← Task Board
        </a>

        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm mt-4">
          <div className="flex items-start justify-between">
            <h1 className="text-xl font-semibold text-slate-800">{task.title}</h1>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {task.status}
            </span>
          </div>

          <p className="text-sm text-slate-400 mt-1">
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

          {/* ---------- Assignees (multiple people can work on one task) ---------- */}
          <div className="mt-4">
            <p className="text-xs text-slate-400 mb-1">Assigned to</p>
            <div className="flex flex-wrap gap-2">
              {assignees.length === 0 && <p className="text-sm text-slate-400">Unassigned</p>}
              {assignees.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 bg-slate-100 rounded-full pl-1 pr-2 py-1"
                >
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

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm mt-4 p-4">
          <h2 className="text-sm font-semibold text-slate-600 mb-3">Time Tracking</h2>
          <TimeTracker taskId={id} currentUser={user} isStaff={isStaff} />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm mt-4">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <h2 className="text-sm font-semibold text-slate-600">
              History {history.length > 0 && `(${history.length})`}
            </h2>
            <span className="text-slate-400 text-xs">{showHistory ? "▲" : "▼"}</span>
          </button>

          {showHistory && (
            <div className="border-t border-slate-100 px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
              {history.length === 0 && (
                <p className="text-xs text-slate-300">No status changes yet.</p>
              )}
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

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm mt-4 h-[420px]">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-600">Chat</h2>
          </div>
          <div className="h-[calc(100%-45px)]">
            <TaskChat taskId={id} currentUser={user} isStaff={isStaff} />
          </div>
        </div>
      </div>
    </main>
  );
}
