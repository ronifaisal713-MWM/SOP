"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const QUICK_EMOJIS = ["👍", "❤️", "😀", "🎉", "👀", "🙏"];

// Messenger-style reactions for every chat surface. Clicking an emoji
// you already used removes it; clicking the pill shows who reacted.
export default function MessageReactions({ messageId, currentUser, align = "left" }) {
  const [reactions, setReactions] = useState([]);
  const [nameMap, setNameMap] = useState({});
  const [showWho, setShowWho] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("message_reactions")
      .select("id, emoji, user_id")
      .eq("message_id", messageId);

    const rows = data || [];
    setReactions(rows);

    // Resolve names so the "who reacted" popover can show people
    // rather than raw ids. Staff and clients live in different tables,
    // so both are checked.
    const ids = [...new Set(rows.map((r) => r.user_id))];
    if (ids.length === 0) {
      setNameMap({});
      return;
    }

    const [{ data: profiles }, { data: clientUsers }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", ids),
      supabase.from("client_users").select("id, full_name").in("id", ids),
    ]);

    const map = {};
    [...(profiles || []), ...(clientUsers || [])].forEach((p) => {
      map[p.id] = p.full_name || "Unnamed";
    });
    setNameMap(map);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions", filter: `message_id=eq.${messageId}` },
        () => load()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  async function toggle(emoji) {
    const mine = reactions.find((r) => r.emoji === emoji && r.user_id === currentUser.id);

    if (mine) {
      setReactions((prev) => prev.filter((r) => r.id !== mine.id));
      await supabase.from("message_reactions").delete().eq("id", mine.id);
    } else {
      await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: currentUser.id, emoji });
      load();
    }
  }

  const grouped = {};
  reactions.forEach((r) => {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false, users: [] };
    grouped[r.emoji].count += 1;
    grouped[r.emoji].users.push(r.user_id);
    if (r.user_id === currentUser.id) grouped[r.emoji].mine = true;
  });
  const entries = Object.entries(grouped);

  // Deliberately NOT returning null when empty: this component owns
  // the realtime subscription for its message, and unmounting on zero
  // reactions killed that subscription -- so adding the very first
  // reaction had nothing listening and it didn't appear until reload.
  // An empty wrapper is cheap and keeps the channel alive.
  if (entries.length === 0) {
    return <div className="hidden" aria-hidden="true" />;
  }

  return (
    <div className={`relative flex items-center gap-1 mt-1 ${align === "right" ? "justify-end" : ""}`}>
      {entries.map(([emoji, info]) => (
        <button
          key={emoji}
          onClick={() => setShowWho((s) => (s === emoji ? false : emoji))}
          onDoubleClick={() => toggle(emoji)}
          className={`text-[11px] rounded-full px-1.5 py-0.5 border transition ${
            info.mine
              ? "bg-brand/10 border-brand/40 text-brand"
              : "bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
          title="Click to see who reacted, double-click to toggle yours"
        >
          {emoji} {info.count}
        </button>
      ))}

      {showWho && grouped[showWho] && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowWho(false)} />
          <div
            className={`absolute bottom-6 z-20 bg-white border border-slate-200 rounded-md shadow-lg px-3 py-2 min-w-[140px] ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            <p className="text-[11px] font-medium text-slate-700 mb-1">{showWho} reacted</p>
            {grouped[showWho].users.map((uid) => (
              <p key={uid} className="text-[11px] text-slate-500">
                {uid === currentUser.id ? "You" : nameMap[uid] || "Someone"}
              </p>
            ))}
            <button
              onClick={() => {
                toggle(showWho);
                setShowWho(false);
              }}
              className="text-[11px] text-brand hover:underline mt-1 pt-1 border-t border-slate-100 w-full text-left"
            >
              {grouped[showWho].mine ? "Remove mine" : "Add mine"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// The "add a reaction" trigger, rendered separately so chats can place
// it in the hover toolbar beside the message rather than underneath.
export function ReactionPicker({ messageId, currentUser, align = "left" }) {
  const [open, setOpen] = useState(false);

  async function react(emoji) {
    setOpen(false);
    const { data: existing } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", currentUser.id)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: currentUser.id, emoji });
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className="text-slate-400 hover:text-slate-600 text-sm"
        title="React"
      >
        ☺
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute bottom-6 z-20 flex gap-1 bg-white border border-slate-200 rounded-full shadow-lg px-2 py-1 ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {QUICK_EMOJIS.map((em) => (
              <button
                key={em}
                onClick={() => react(em)}
                className="text-base hover:scale-125 transition"
              >
                {em}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
