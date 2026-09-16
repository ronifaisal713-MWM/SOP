"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";

const CATEGORIES = [
  "Social Media",
  "SEO",
  "Google Ads",
  "Website",
  "Video",
  "Content Writing",
  "Graphic Design",
  "Other",
];

const PRIORITIES = [
  { value: "urgent", label: "🔴 Urgent" },
  { value: "high", label: "🟠 High" },
  { value: "normal", label: "🟡 Normal" },
  { value: "low", label: "🟢 Low" },
];

export default function NewRequirementPage() {
  const { user, checked } = useRequireAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    category: CATEGORIES[0],
    platform: "",
    priority: "normal",
    deadline: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: insertError } = await supabase.from("requirements").insert({
      title: form.title,
      category: form.category,
      platform: form.platform || null,
      priority: form.priority,
      deadline: form.deadline || null,
      description: form.description || null,
      created_by: user?.id,
      status: "new",
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/dashboard/requirements");
  }

  if (!checked) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-brand">New Requirement</h1>
          <a href="/dashboard/requirements" className="text-sm text-slate-500 hover:underline">
            ← Back to list
          </a>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Requirement Title *
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. New Product Launch Post"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Platform</label>
              <input
                type="text"
                value={form.platform}
                onChange={(e) => update("platform", e.target.value)}
                placeholder="e.g. Facebook"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => update("priority", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Deadline</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => update("deadline", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Describe what you need..."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand text-white rounded-md py-2 font-medium hover:bg-brand-light transition disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Requirement"}
          </button>
        </form>
      </div>
    </main>
  );
}
