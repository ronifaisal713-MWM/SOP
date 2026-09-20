"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const EMOJIS = ["👍", "🙏", "🎉", "✅", "❤️", "😀", "😅", "👀", "🔥", "🚀", "⚠️", "❓"];
const MAX_FILE_SIZE_MB = 100;
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function linkify(text) {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// A private 1-to-1 thread between the current user and one specific
// teammate (always Agency <-> Staff -- never staff-to-staff). Not tied
// to any client or task, so it's identified purely by organizationId +
// the pair of user ids.
export default function StaffChat({ currentUser, otherUserId, organizationId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
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
      .eq("organization_id", organizationId)
      .is("task_id", null)
      .is("client_id", null)
      .or(
        `and(sender_id.eq.${currentUser.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUser.id})`
      )
      .order("created_at", { ascending: true });

    if (fetchError) setError(fetchError.message);
    setMessages(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`staff-dm-${[currentUser.id, otherUserId].sort().join("-")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new;
          const belongsHere =
            m.organization_id === organizationId &&
            !m.task_id &&
            !m.client_id &&
            ((m.sender_id === currentUser.id && m.recipient_id === otherUserId) ||
              (m.sender_id === otherUserId && m.recipient_id === currentUser.id));
          if (belongsHere) setMessages((prev) => [...prev, m]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId, organizationId]);

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
      const path = `staff-dm/${organizationId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (uploadError) {
        setError(uploadError.message);
        setSending(false);
        return;
      }

      const { data: fileRow, error: fileError } = await supabase
        .from("files")
        .insert({ storage_path: path, file_name: file.name, visibility: "internal", uploaded_by: currentUser.id })
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
      organization_id: organizationId,
      sender_id: currentUser.id,
      recipient_id: otherUserId,
      body: body.trim() || null,
      visibility: "personal",
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
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  isMine ? "bg-purple-600 text-white" : "bg-purple-50 border border-purple-200 text-purple-900"
                }`}
              >
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
          <button type="button" onClick={() => setShowEmoji((s) => !s)} className="text-lg px-1" title="Emoji">
            😀
          </button>
          <label className="text-lg px-1 cursor-pointer" title="Attach file">
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
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a private message..."
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={sending || (!body.trim() && !file)}
            className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50"
          >
            Send
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </form>
    </div>
  );
}
