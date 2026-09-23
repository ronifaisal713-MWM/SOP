"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const QUICK_EMOJIS = ["👍", "❤️", "😀", "🎉", "👀", "🙏"];

// Messenger-style reactions, shared by every chat surface (task chat,
// client chat, staff DM). Everyone can react -- staff, agency, and
// clients alike. Clicking an emoji you already used removes it.
export default function MessageReactions({ messageId, currentUser, align = "left" }) {
  const [reactions, setReactions] = useState([]);
  const [showPicker, setShowPicker] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("message_reactions")
      .select("id, emoji, user_id")
      .eq("message_id", messageId);
    setReactions(data || []);
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
    setShowPicker(false);
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

  // Group into { emoji: { count, mine } }
  const grouped = {};
  reactions.forEach((r) => {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false };
    grouped[r.emoji].count += 1;
    if (r.user_id === currentUser.id) grouped[r.emoji].mine = true;
  });
  const entries = Object.entries(grouped);

  return (
    <div className={`relative flex items-center gap-1 mt-1 ${align === "right" ? "justify-end" : ""}`}>
      {entries.map(([emoji, info]) => (
        <button
          key={emoji}
          onClick={() => toggle(emoji)}
          className={`text-[11px] rounded-full px-1.5 py-0.5 border transition ${
            info.mine
              ? "bg-brand/10 border-brand/40 text-brand"
              : "bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
          title={info.mine ? "Remove your reaction" : "React"}
        >
          {emoji} {info.count}
        </button>
      ))}

      <button
        onClick={() => setShowPicker((s) => !s)}
        className="text-[11px] text-slate-400 hover:text-slate-600 px-1"
        title="Add reaction"
      >
        ☺+
      </button>

      {showPicker && (
        <>
          {/* Click-away layer so the picker closes when clicking elsewhere */}
          <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />
          <div
            className={`absolute bottom-6 z-20 flex gap-1 bg-white border border-slate-200 rounded-full shadow-lg px-2 py-1 ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {QUICK_EMOJIS.map((em) => (
              <button
                key={em}
                onClick={() => toggle(em)}
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
