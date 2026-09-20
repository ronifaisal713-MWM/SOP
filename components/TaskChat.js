"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const EMOJIS = ["👍", "🙏", "🎉", "✅", "❤️", "😀", "😅", "👀", "🔥", "🚀", "⚠️", "❓"];

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

  const bottomRef = useRef(null);

  async function loadMessages() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select("*, files(storage_path, file_name)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (fetchError) setError(fetchError.message);
    setMessages(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();

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
    });
    setSending(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }
    setBody("");
    setFile(null);
    setShowEmoji(false);
  }

  function fileUrl(storagePath) {
    return supabase.storage.from("chat-attachments").getPublicUrl(storagePath).data.publicUrl;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading && <p className="text-center text-xs text-slate-300 mt-8">Loading...</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-xs text-slate-300 mt-8">No messages yet.</p>
        )}

        {messages.map((m) => {
          const isMine = m.sender_id === currentUser.id;
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

        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            className="text-lg px-1"
            title="Emoji"
          >
            😀
          </button>
          <label className="text-lg px-1 cursor-pointer" title="Attach file">
            📎
            <input
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={sending || (!body.trim() && !file)}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-50"
          >
            Send
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </form>
    </div>
  );
}
