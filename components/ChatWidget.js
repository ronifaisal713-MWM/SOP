"use client";

// A floating bottom-right chat bubble that expands into a small popup
// panel, instead of navigating to a whole new page just to send a
// message. `open` and `onToggle`/`onClose` are controlled by the parent
// so it can decide what's currently loaded inside (which task, which
// client, etc).
export default function ChatWidget({ title, open, onToggle, onClose, children }) {
  return (
    <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-80 sm:w-96 h-[460px] bg-white border border-slate-200 rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-brand text-white flex-shrink-0">
            <span className="text-sm font-semibold truncate">{title}</span>
            <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">
              ×
            </button>
          </div>
          <div className="flex-1 min-h-0">{children}</div>
        </div>
      )}

      <button
        onClick={onToggle}
        className="w-14 h-14 rounded-full bg-brand text-white shadow-lg flex items-center justify-center text-2xl hover:bg-brand-light transition"
        title="Chat"
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
