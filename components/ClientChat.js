"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { categoryForRole } from "@/lib/roleCategory";

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

/**
 * Client-level chat: Public (client + agency + staff), Internal (staff
 * only), Personal (agency owner/admin <-> one specific client contact --
 * staff can never use this tab).
 *
 * Props:
 *   clientId    - the client company this chat belongs to
 *   currentUser - the signed-in user object (from supabase auth)
 *   viewerRole  - the signed-in user's profiles.role
 *   contacts    - [{ id, full_name }] of this client's contacts (used by
 *                 agency to pick who a personal thread is with)
 */
export default function ClientChat({ clientId, currentUser, viewerRole, contacts = [] }) {
  const category = categoryForRole(viewerRole);
  const isAgency = category === "agency";
  const isStaffOnly = category === "staff";
  const isClient = category === "client";

  const availableTabs = isAgency
    ? ["public", "internal", "personal"]
    : isStaffOnly
    ? ["public", "internal"]
    : ["public", "personal"];

  const [tab, setTab] = useState("public");
  const [selectedContactId, setSelectedContactId] = useState(contacts[0]?.id || "");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef(null);

  const personalRecipientId = isClient ? currentUser.id : selectedContactId;

  async function loadMessages() {
    setLoading(true);
    let query = supabase
      .from("messages")
      .select("*, files(storage_path, file_name)")
      .eq("client_id", clientId)
      .is("task_id", null)
      .eq("visibility", tab)
      .order("created_at", { ascending: true });

    if (tab === "personal") {
      if (!personalRecipientId) {
        setMessages([]);
        setLoading(false);
        return;
      }
      query = query.eq("recipient_id", personalRecipientId);
    }

    const { data, error: fetchError } = await query;
    if (fetchError) setError(fetchError.message);
    setMessages(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tab, personalRecipientId]);

  useEffect(() => {
    const channel = supabase
      .channel(`client-${clientId}-messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const m = payload.new;
          if (m.visibility !== tab) return;
          if (tab === "personal" && m.recipient_id !== personalRecipientId) return;
          setMessages((prev) => [...prev, m]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tab, personalRecipientId]);

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
      const path = `${clientId}/${crypto.randomUUID()}-${file.name}`;
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
          storage_path: path,
          file_name: file.name,
          visibility: tab === "internal" ? "internal" : "client",
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
      client_id: clientId,
      sender_id: currentUser.id,
      body: body.trim() || null,
      visibility: tab,
      recipient_id: tab === "personal" ? personalRecipientId : null,
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
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-[480px]">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {availableTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                tab === t ? "bg-brand text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {t === "public" ? "🔵 Public" : t === "internal" ? "🟠 Internal" : "🟣 Personal"}
            </button>
          ))}
        </div>

        {tab === "personal" && isAgency && (
          <select
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
            className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-slate-50"
          >
            <option value="">Select contact...</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || "Unnamed"}
              </option>
            ))}
          </select>
        )}
      </div>

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
                  tab === "internal"
                    ? "bg-amber-50 border border-amber-200 text-amber-900"
                    : tab === "personal"
                    ? "bg-purple-50 border border-purple-200 text-purple-900"
                    : isMine
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-800"
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
            placeholder={
              tab === "personal" && !personalRecipientId
                ? "Select a contact first..."
                : "Type a message..."
            }
            disabled={tab === "personal" && !personalRecipientId}
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={sending || (!body.trim() && !file) || (tab === "personal" && !personalRecipientId)}
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
