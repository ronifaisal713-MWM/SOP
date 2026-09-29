"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MessageReactions from "@/components/MessageReactions";
import MessageAttachment, { attachmentUrl } from "@/components/MessageAttachment";
import EmojiPicker from "@/components/EmojiPicker";
import MessageActions from "@/components/MessageActions";
import VoiceRecorder from "@/components/VoiceRecorder";
import Icon from "@/components/Icon";

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

  const [replyTo, setReplyTo] = useState(null);

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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) =>
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId, organizationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleDeleteMessage(messageId) {
    if (!confirm("Delete this message?")) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, deleted_at: new Date().toISOString(), body: null, files: null, attachment_id: null }
          : m
      )
    );

    const { error: deleteError } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString(), body: null, attachment_id: null })
      .eq("id", messageId);

    if (deleteError) {
      setError(deleteError.message);
      loadMessages();
    }
  }

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
      reply_to_id: replyTo?.id || null,
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
    setReplyTo(null);
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
          return (
            <div
              key={m.id}
              className={`group flex items-end gap-1 ${isMine ? "justify-end" : "justify-start"}`}
            >
              {!m.deleted_at && isMine && (
                <MessageActions
                  messageId={m.id}
                  currentUser={currentUser}
                  isMine={isMine}
                  onReply={() => setReplyTo(m)}
                  onDelete={() => handleDeleteMessage(m.id)}
                  downloadUrl={attachmentUrl(m.files?.storage_path)}
                  downloadName={m.files?.file_name}
                />
              )}
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  isMine ? "bg-purple-600 text-white" : "bg-purple-50 border border-purple-200 text-purple-900"
                }`}
              >
                {m.reply_to_id && !m.deleted_at && (
                  <div
                    className={`text-[11px] border-l-2 pl-2 mb-1 opacity-80 ${
                      isMine ? "border-white/40" : "border-slate-300"
                    }`}
                  >
                    {(() => {
                      const orig = messages.find((x) => x.id === m.reply_to_id);
                      if (!orig) return <span className="italic">Original message unavailable</span>;
                      if (orig.deleted_at) return <span className="italic">Deleted message</span>;
                      return (orig.body || "Attachment").slice(0, 80);
                    })()}
                  </div>
                )}
                {m.deleted_at ? (
                  <p className="text-xs italic opacity-70">This message was deleted</p>
                ) : (
                  <>
                    {m.body && <p className="whitespace-pre-wrap">{linkify(m.body)}</p>}
                    <MessageAttachment
                      attachmentId={m.attachment_id}
                      file={m.files}
                      isMine={isMine}
                    />
                    <MessageReactions
                      messageId={m.id}
                      currentUser={currentUser}
                      align={isMine ? "right" : "left"}
                    />
                  </>
                )}
              </div>
              {!m.deleted_at && !isMine && (
                <MessageActions
                  messageId={m.id}
                  currentUser={currentUser}
                  isMine={isMine}
                  onReply={() => setReplyTo(m)}
                  onDelete={() => handleDeleteMessage(m.id)}
                  downloadUrl={attachmentUrl(m.files?.storage_path)}
                  downloadName={m.files?.file_name}
                />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-slate-100 p-3 flex-shrink-0">
        {replyTo && (
          <div className="flex items-start justify-between gap-2 mb-2 bg-slate-50 border-l-2 border-brand rounded-r px-2 py-1">
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400">Replying to</p>
              <p className="text-xs text-slate-600 truncate">{replyTo.body || "Attachment"}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-slate-400 hover:text-red-500 text-sm flex-shrink-0"
            >
              ×
            </button>
          </div>
        )}
        {file && (
          <p className="text-xs text-slate-500 mb-2">
            <Icon name="paperclip" size={12} /> {file.name}{" "}
            <button type="button" onClick={() => setFile(null)} className="text-red-500 ml-1">
              remove
            </button>
          </p>
        )}

        {showEmoji && (
          <div className="relative mb-2">
            <EmojiPicker
              onPick={(em) => setBody((b) => b + em)}
              onClose={() => setShowEmoji(false)}
              align="left"
            />
          </div>
        )}

        <div className="flex gap-1 sm:gap-2 items-center">
          <button type="button" onClick={() => setShowEmoji((s) => !s)} className="text-lg px-0.5 sm:px-1 flex-shrink-0" title="Emoji">
            <Icon name="smile" size={18} />
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
          <VoiceRecorder
            disabled={sending || !!file}
            onRecorded={(voiceFile) => {
              setError("");
              setFile(voiceFile);
            }}
          />
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a private message..."
            className="flex-1 min-w-0 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={sending || (!body.trim() && !file)}
            className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50 flex-shrink-0"
          >
            Send
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </form>
    </div>
  );
}
