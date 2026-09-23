"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Embedded on the Task detail page. Staff/Agency break a task into
// smaller steps and tick them off; the client sees the same list and
// progress bar read-only, so they can tell how far along the work is
// without having to ask.
export default function TaskChecklist({ taskId, currentUser, isStaff }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("task_checklist_items")
      .select("*")
      .eq("task_id", taskId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (fetchError) setError(fetchError.message);
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;

    setAdding(true);
    setError("");

    const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order || 0)) + 1 : 0;

    const { error: insertError } = await supabase.from("task_checklist_items").insert({
      task_id: taskId,
      label: newLabel.trim(),
      sort_order: nextOrder,
    });

    setAdding(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewLabel("");
    load();
  }

  async function handleToggle(item) {
    const nowDone = !item.is_done;

    // Optimistic -- ticking should feel instant.
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_done: nowDone } : i))
    );

    const { error: updateError } = await supabase
      .from("task_checklist_items")
      .update({
        is_done: nowDone,
        completed_at: nowDone ? new Date().toISOString() : null,
        completed_by: nowDone ? currentUser.id : null,
      })
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
      load();
    }
  }

  async function handleRemove(itemId) {
    await supabase.from("task_checklist_items").delete().eq("id", itemId);
    load();
  }

  const doneCount = items.filter((i) => i.is_done).length;
  const percent = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>
              {doneCount} of {items.length} done
            </span>
            <span>{percent}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div
              className="bg-brand h-1.5 rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-300">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-300">No steps added yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 group">
              <input
                type="checkbox"
                checked={!!item.is_done}
                disabled={!isStaff}
                onChange={() => handleToggle(item)}
                className="flex-shrink-0 disabled:opacity-60"
              />
              <span
                className={`text-sm flex-1 min-w-0 ${
                  item.is_done ? "text-slate-400 line-through" : "text-slate-700"
                }`}
              >
                {item.label}
              </span>
              {isStaff && (
                <button
                  onClick={() => handleRemove(item.id)}
                  className="text-xs text-red-500 opacity-0 group-hover:opacity-100 transition flex-shrink-0"
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {isStaff && (
        <form onSubmit={handleAdd} className="flex gap-2 mt-3">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Add a step..."
            className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={adding || !newLabel.trim()}
            className="px-3 py-1.5 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-light transition disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}
