"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ALL_STAFF_ROLES, AGENCY_ROLES } from "@/lib/roleCategory";
import MessageReactions from "@/components/MessageReactions";

const EMOJIS = ["👍", "🙏", "🎉", "✅", "❤️", "😀", "😅", "👀", "🔥", "🚀", "⚠️", "❓"];
const MAX_FILE_SIZE_MB = 100;

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function linkify(text) {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// The chat thread for ONE task. Used both embedded on the task detail
// page and inside the floating popup opened from the Task Board, so the
// board doesn't have to navigate away to a whole new page just to chat.
export default function TaskChat({ taskId, currentUser, isStaff }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState(isStaff ? "internal" : "client");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [error, setError] = useState("");

  const [team, setTeam] = useState([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionTarget, setMentionTarget] = useState(null);
  const [senderRoleMap, setSenderRoleMap] = useState({});

  const bottomRef = useRef(null);

  async function loadMessages() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select("*, files(storage_path, file_name)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (fetchError) setError(fetchError.message);
    const rows = data || [];
    setMessages(rows);

    const senderIds = [...new Set(rows.map((m) => m.sender_id).filter(Boolean))];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, role").in("id", senderIds);
      const map = {};
      (profiles || []).forEach((p) => (map[p.id] = p.role));
      setSenderRoleMap(map);
    }

    setLoading(false);
  }

  // Everyone actually in this task's conversation can be mentioned by
  // anyone else in it -- staff can mention the client contacts, and a
  // client can mention the staff working on their task. RLS decides
  // what's actually readable; this just lists what it returns.
  async function loadMentionablepeople() {
    const { data: task } = await supabase
      .from("tasks")
      .select("requirement_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!task?.requirement_id) return;

    const { data: req } = await supabase
      .from("requirements")
      .select("client_id")
      .eq("id", task.requirement_id)
      .maybeSingle();
    if (!req?.client_id) return;

    const people = [];

    // Staff side: a client's own RLS (migration_015) already narrows
    // this to just the staff assigned to them, so the same query
    // works correctly from either side.
    const { data: staffProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ALL_STAFF_ROLES);
    (staffProfiles || []).forEach((p) => people.push({ id: p.id, full_name: p.full_name }));

    // Client side: the contacts on this client company.
    const { data: clientContacts } = await supabase
      .from("client_users")
      .select("id, full_name")
      .eq("client_id", req.client_id);
    (clientContacts || []).forEach((c) => people.push({ id: c.id, full_name: c.full_name }));

    setTeam(people.filter((p) => p.id !== currentUser.id));
  }

  useEffect(() => {
    loadMessages();
    loadMentionablepeople();

    const channel = supabase
      .channel(`task-${taskId}-messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `task_id=eq.${taskId}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function pickMention(member) {
    setMentionTarget(member);
    setBody((b) => `@${member.full_name || "teammate"} ${b}`);
    setShowMentionPicker(false);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!body.trim() && !file) return;

    setSending(true);
    setError("");

    let attachmentId = null;
    if (file) {
      const path = `tasks/${taskId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file);

      if (uploadError) {
        setError(uploadError.message);
        setSending(false);
        return;
      }

      const { data: fileRow, error: fileError } = await supabase
        .from("files")
        .insert({
          task_id: taskId,
          storage_path: path,
          file_name: file.name,
          visibility: visibility === "internal" ? "internal" : "client",
          uploaded_by: currentUser.id,
        })
        .select()
        .single();

      if (fileError) {
        setError(fileError.message);
        setSending(false);
        return;
      }
      attachmentId = fileRow.id;
    }

    const { error: sendError } = await supabase.from("messages").insert({
      task_id: taskId,
      sender_id: currentUser.id,
      body: body.trim() || null,
      visibility,
      attachment_id: attachmentId,
      mentioned_user_id: mentionTarget?.id || null,
    });
    setSending(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }
    setBody("");
    setFile(null);
    setShowEmoji(false);
    setMentionTarget(null);
  }

  async function handleAcknowledge(messageId) {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, mention_acknowledged: true } : m))
    );
    await supabase.from("messages").update({ mention_acknowledged: true }).eq("id", messageId);
  }

  function fileUrl(storagePath) {
    return supabase.storage.from("chat-attachments").getPublicUrl(storagePath).data.publicUrl;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {loading && <p className="text-center text-xs text-slate-300 mt-8">Loading...</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-xs text-slate-300 mt-8">No messages yet.</p>
        )}

        {messages.map((m) => {
          const isMine = m.sender_id === currentUser.id;
          const isInternal = m.visibility === "internal";
          const isPendingMentionForMe =
            m.mentioned_user_id === currentUser.id && !m.mention_acknowledged;

          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  isPendingMentionForMe
                    ? "bg-red-50 border-2 border-red-400 text-red-900"
                    : isInternal
                    ? "bg-amber-50 border border-amber-200 text-amber-900"
                    : isMine
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {isStaff && (
                  <p
                    className={`text-[10px] font-medium mb-0.5 ${
                      isPendingMentionForMe
                        ? "text-red-500"
                        : isInternal
                        ? "text-amber-600"
                        : isMine
                        ? "text-white/70"
                        : "text-slate-400"
                    }`}
                  >
                    {isInternal ? "🟠 Internal Note" : "🔵 Client Message"}
                  </p>
                )}
                {!isInternal && AGENCY_ROLES.includes(senderRoleMap[m.sender_id]) && (
                  <p
                    className={`text-[10px] font-semibold mb-0.5 ${
                      isMine ? "text-white/90" : "text-purple-600"
                    }`}
                  >
                    👑 Owner
                  </p>
                )}
                {m.body && <p className="whitespace-pre-wrap">{linkify(m.body)}</p>}
                {m.files && (
                  <a
                    href={fileUrl(m.files.storage_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline block mt-1"
                  >
                    📎 {m.files.file_name}
                  </a>
                )}
                {isPendingMentionForMe && (
                  <button
                    onClick={() => handleAcknowledge(m.id)}
                    className="mt-2 text-xs bg-red-600 text-white rounded-md px-2 py-1 font-medium hover:bg-red-700 transition"
                  >
                    ✓ Acknowledge
                  </button>
                )}
                <MessageReactions
                  messageId={m.id}
                  currentUser={currentUser}
                  align={isMine ? "right" : "left"}
                />
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

        {mentionTarget && (
          <p className="text-xs text-purple-600 mb-2">
            Mentioning <strong>{mentionTarget.full_name || "teammate"}</strong>{" "}
            <button type="button" onClick={() => setMentionTarget(null)} className="text-red-500 ml-1">
              remove
            </button>
          </p>
        )}

        {file && (
          <p className="text-xs text-slate-500 mb-2">
            📎 {file.name}{" "}
            <button type="button" onClick={() => setFile(null)} className="text-red-500 ml-1">
              remove
            </button>
          </p>
        )}

        {showEmoji && (
          <div className="flex flex-wrap gap-1 mb-2 border border-slate-200 rounded-md p-2 bg-slate-50">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setBody((b) => b + em)}
                className="text-lg hover:scale-110 transition"
              >
                {em}
              </button>
            ))}
          </div>
        )}

        {showMentionPicker && (
          <div className="flex flex-wrap gap-1 mb-2 border border-slate-200 rounded-md p-2 bg-slate-50">
            {team.length === 0 && <p className="text-xs text-slate-400">No teammates to mention.</p>}
            {team.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMention(m)}
                className="text-xs bg-white border border-slate-200 rounded-full px-2 py-1 hover:bg-purple-50"
              >
                @{m.full_name || "Unnamed"}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1 sm:gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            className="text-lg px-0.5 sm:px-1 flex-shrink-0"
            title="Emoji"
          >
            😀
          </button>
          <label className="text-lg px-0.5 sm:px-1 cursor-pointer flex-shrink-0" title="Attach file">
            📎
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0] || null;
                if (selected && selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                  setError(`File is too large. Max size is ${MAX_FILE_SIZE_MB}MB.`);
                  e.target.value = "";
                  return;
                }
                setError("");
                setFile(selected);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowMentionPicker((s) => !s)}
            className="text-lg px-0.5 sm:px-1 flex-shrink-0"
            title="Mention someone"
          >
            @
          </button>
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 min-w-0 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={sending || (!body.trim() && !file)}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-50 flex-shrink-0"
          >
            Send
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </form>
    </div>
  );
}
