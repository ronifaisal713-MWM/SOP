"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";

const STAFF_ROLES = ["super_admin", "admin", "project_manager", "team_lead", "employee"];
const PRIORITY_ICON = { urgent: "🔴", high: "🟠", normal: "🟡", low: "🟢" };

export default function TaskDetailPage() {
  const { user, checked } = useRequireAuth();
  const params = useParams();
  const { id } = params;

  const [task, setTask] = useState(null);
  const [isStaff, setIsStaff] = useState(false);
  const [team, setTeam] = useState([]);
  const [assigneeName, setAssigneeName] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("client");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef(null);

  async function loadData() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const staff = !!profile?.role && STAFF_ROLES.includes(profile.role);
    setIsStaff(staff);
    setVisibility(staff ? "internal" : "client");

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
        .in("role", STAFF_ROLES);
      setTeam(teamData || []);
    }

    if (taskData.assigned_to) {
      const { data: assignee } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", taskData.assigned_to)
        .maybeSingle();
      setAssigneeName(assignee?.full_name || null);
    } else {
      setAssigneeName(null);
    }

    const { data: messageData, error: messageError } = await supabase
      .from("messages")
      .select("*")
      .eq("task_id", id)
      .order("created_at", { ascending: true });

    if (messageError) setError(messageError.message);
    setMessages(messageData || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!checked || !user || !id) return;
    loadData();

    // Live updates: new messages from either side appear without a refresh.
    const channel = supabase
      .channel(`task-${id}-messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `task_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!body.trim()) return;

    setSending(true);
    const { error: sendError } = await supabase.from("messages").insert({
      task_id: id,
      sender_id: user.id,
      body: body.trim(),
      visibility,
    });
    setSending(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }
    setBody("");
  }

  async function moveStatus(newStatus) {
    setTask((t) => ({ ...t, status: newStatus }));
    await supabase.from("tasks").update({ status: newStatus }).eq("id", id);
  }

  async function assignTask(newAssigneeId) {
    setTask((t) => ({ ...t, assigned_to: newAssigneeId || null }));
    setAssigneeName(team.find((m) => m.id === newAssigneeId)?.full_name || null);
    await supabase
      .from("tasks")
      .update({ assigned_to: newAssigneeId || null })
      .eq("id", id);
  }

  if (!checked || loading) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  if (error && !task) {
    return <main className="min-h-screen flex items-center justify-center text-red-600 text-sm">{error}</main>;
  }

  if (!task) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Task not found.
      </main>
    );
  }

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

          <div className="mt-4 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
              {assigneeName
                ? assigneeName
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "?"}
            </div>
            {isStaff ? (
              <select
                value={task.assigned_to || ""}
                onChange={(e) => assignTask(e.target.value)}
                className="border border-slate-200 rounded-md text-sm px-2 py-1 bg-slate-50"
              >
                <option value="">Unassigned</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || "Unnamed"}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-600">{assigneeName || "Unassigned"}</p>
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
                {[
                  "incoming",
                  "processing",
                  "internal_review",
                  "outgoing",
                  "client_review",
                  "revision",
                  "approved",
                  "done",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Chat thread */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm mt-4 flex flex-col h-[420px]">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-600">Chat</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-xs text-slate-300 mt-8">No messages yet.</p>
            )}

            {messages.map((m) => {
              const isMine = m.sender_id === user.id;
              const isInternal = m.visibility === "internal";
              return (
                <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      isInternal
                        ? "bg-amber-50 border border-amber-200 text-amber-900"
                        : isMine
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {isStaff && (
                      <p
                        className={`text-[10px] font-medium mb-0.5 ${
                          isInternal ? "text-amber-600" : isMine ? "text-white/70" : "text-slate-400"
                        }`}
                      >
                        {isInternal ? "🟠 Internal Note" : "🔵 Client Message"}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="border-t border-slate-100 p-3">
            {isStaff && (
              <div className="flex gap-3 mb-2 text-xs">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={visibility === "client"}
                    onChange={() => setVisibility("client")}
                  />
                  🔵 Client Message
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={visibility === "internal"}
                    onChange={() => setVisibility("internal")}
                  />
                  🟠 Internal Note
                </label>
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !body.trim()}
                className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    </main>
  );
}
