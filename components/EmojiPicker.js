"use client";

import { useState } from "react";
import { EMOJI_CATEGORIES } from "@/lib/emojiData";

// Categorised emoji picker used by both the chat composer and the
// reaction bar. Tabs keep a 100+ list scannable; the grid scrolls
// within a fixed height so it can't push a chat popup out of shape.
export default function EmojiPicker({ onPick, onClose, align = "left" }) {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].key);

  const category =
    EMOJI_CATEGORIES.find((c) => c.key === activeCategory) || EMOJI_CATEGORIES[0];

  return (
    <>
      {/* Click-away layer so the picker closes on an outside click
          rather than only via its own toggle. */}
      <div className="fixed inset-0 z-10" onClick={onClose} />

      <div
        className={`absolute bottom-8 z-20 w-64 bg-white border border-slate-200 rounded-lg shadow-lg ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCategory(c.key)}
              className={`px-2 py-1.5 text-[10px] whitespace-nowrap flex-shrink-0 transition ${
                c.key === activeCategory
                  ? "text-brand border-b-2 border-brand font-medium"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-8 gap-0.5 p-2 max-h-40 overflow-y-auto">
          {category.emojis.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => onPick(em)}
              className="text-lg hover:bg-slate-100 rounded transition p-0.5"
            >
              {em}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
