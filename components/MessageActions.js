"use client";

import { useState } from "react";
import { ReactionPicker } from "@/components/MessageReactions";

// Messenger-style action row that appears beside a message on hover:
// a reaction picker plus a ⋮ menu holding Reply / Download / Delete.
// Kept out of the bubble itself so the bubble stays clean.
export default function MessageActions({
  messageId,
  currentUser,
  isMine,
  onReply,
  onDelete,
  downloadUrl,
  downloadName,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition ${
        isMine ? "order-first" : ""
      }`}
    >
      <ReactionPicker
        messageId={messageId}
        currentUser={currentUser}
        align={isMine ? "right" : "left"}
      />

      <div className="relative">
        <button
          onClick={() => setMenuOpen((s) => !s)}
          className="text-slate-400 hover:text-slate-600 text-sm px-0.5"
          title="More"
        >
          ⋮
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div
              className={`absolute bottom-6 z-20 bg-white border border-slate-200 rounded-md shadow-lg py-1 min-w-[130px] ${
                isMine ? "right-0" : "left-0"
              }`}
            >
              <button
                onClick={() => {
                  onReply();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                ↩ Reply
              </button>

              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={downloadName || true}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  ⬇ Download
                </a>
              )}

              {isMine && (
                <button
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  🗑 Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
