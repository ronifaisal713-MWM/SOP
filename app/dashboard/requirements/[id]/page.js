"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ALL_STAFF_ROLES } from "@/lib/roleCategory";

const PRIORITY_ICON = { urgent: "🔴", high: "🟠", normal: "🟡", low: "🟢" };
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

export default function RequirementDetailPage() {
  const { user, checked } = useRequireAuth();
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const [requirement, setRequirement] = useState(null);
  const [task, setTask] = useState(null);
  const [journey, setJourney] = useState([]);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    setIsStaff(!!profile?.role && ALL_STAFF_ROLES.includes(profile.role));

    const { data: reqData, error: reqError } = await supabase
      .from("requirements")
      .select("*")
      .eq("id", id)
      .single();

    if (reqError) {
      setError(reqError.message);
      setLoading(false);
      return;
    }
    setRequirement(reqData);
    setForm({
      title: reqData.title || "",
      category: reqData.category || CATEGORIES[0],
      platform: reqData.platform || "",
      priority: reqData.priority || "normal",
      deadline: reqData.deadline || "",
      description: reqData.description || "",
    });

    const { data: taskData } = await supabase
      .from("tasks")
      .select("*")
      .eq("requirement_id", id)
      .maybeSingle();
    setTask(taskData || null);

    await loadJourney(taskData);
    setLoading(false);
  }

  async function loadJourney(taskData) {
    // Requirement-level history (created / edited / deleted).
    const { data: reqLog } = await supabase
      .from("activity_log")
      .select("*")
      .eq("entity_type", "requirement")
      .eq("entity_id", id)
      .order("created_at", { ascending: true });

    // Task-level history (status changes), if this requirement was converted.
    let taskLog = [];
    if (taskData) {
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .eq("entity_type", "task")
        .eq("entity_id", taskData.id)
        .order("created_at", { ascending: true });
      taskLog = data || [];
    }

    const combined = [...(reqLog || []), ...taskLog];
    if (combined.length === 0) {
      setJourney([]);
      return;
    }

    const actorIds = [...new Set(combined.map((r) => r.actor_id).filter(Boolean))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    const map = {};
    (profiles || []).forEach((p) => (map[p.id] = p.full_name));

    setJourney(
      combined
        .map((r) => ({ ...r, actorName: map[r.actor_id] || "Unknown" }))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    );
  }

  useEffect(() => {
    if (!checked || !user || !id) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user, id]);

  async function handleConvertToTask() {
    setConverting(true);
    setError("");

    const { error: taskError } = await supabase.from("tasks").insert({
      requirement_id: requirement.id,
      project_id: requirement.project_id,
      title: requirement.title,
      description: requirement.description,
      priority: requirement.priority,
      deadline: requirement.deadline,
      status: "incoming",
    });

    if (taskError) {
      setError(taskError.message);
      setConverting(false);
      return;
    }

    await supabase.from("requirements").update({ status: "planned" }).eq("id", requirement.id);

    setConverting(false);
    router.push("/dashboard/tasks");
  }

  function updateForm(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    let storagePath = requirement.storage_path;
    let fileName = requirement.file_name;
    if (file) {
      const path = `requirements/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (uploadError) {
        setError(uploadError.message);
        setSaving(false);
        return;
      }
      storagePath = path;
      fileName = file.name;
    }

    const { error: updateError } = await supabase
      .from("requirements")
      .update({
        title: form.title,
        category: form.category,
        platform: form.platform || null,
        priority: form.priority,
        deadline: form.deadline || null,
        description: form.description || null,
        storage_path: storagePath,
        file_name: fileName,
      })
      .eq("id", id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setFile(null);
    setEditing(false);
    loadData();
  }

  async function handleDelete() {
    if (!confirm("Delete this requirement? It will disappear for the client, but staff/agency will still see it was deleted (and by whom).")) {
      return;
    }
    await supabase
      .from("requirements")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", id);
    router.push("/dashboard/requirements");
  }

  function fileUrl(storagePath) {
    return supabase.storage.from("chat-attachments").getPublicUrl(storagePath).data.publicUrl;
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  if (error && !requirement) {
    return <main className="flex items-center justify-center py-20 text-red-600 text-sm">{error}</main>;
  }

  if (!requirement) {
    return (
      <main className="flex items-center justify-center py-20 text-slate-500 text-sm">
        Requirement not found.
      </main>
    );
  }

  const isDeleted = !!requirement.deleted_at;

  return (
    <main className="px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <a href="/dashboard/requirements" className="text-sm text-slate-500 hover:underline">
          ← Requirements list
        </a>

        {!editing ? (
          <div className={`bg-white border rounded-lg p-6 shadow-sm mt-4 ${isDeleted ? "border-red-200 opacity-75" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-semibold text-slate-800">
                {requirement.title}
                {isDeleted && <span className="ml-2 text-xs text-red-500 font-normal">(Deleted)</span>}
              </h1>
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 flex-shrink-0">
                {requirement.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <p className="text-slate-400">Category</p>
                <p className="text-slate-700">{requirement.category || "-"}</p>
              </div>
              <div>
                <p className="text-slate-400">Platform</p>
                <p className="text-slate-700">{requirement.platform || "-"}</p>
              </div>
              <div>
                <p className="text-slate-400">Priority</p>
                <p className="text-slate-700">
                  {PRIORITY_ICON[requirement.priority] || ""} {requirement.priority}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Deadline</p>
                <p className="text-slate-700">{requirement.deadline || "-"}</p>
              </div>
            </div>

            {requirement.description && (
              <div className="mt-4">
                <p className="text-slate-400 text-sm mb-1">Description</p>
                <p className="text-slate-700 text-sm whitespace-pre-wrap">{requirement.description}</p>
              </div>
            )}

            {requirement.storage_path && (
              <a
                href={fileUrl(requirement.storage_path)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand underline block mt-3"
              >
                📎 {requirement.file_name}
              </a>
            )}

            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

            {!isDeleted && isStaff && (
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-brand hover:underline"
                >
                  Edit
                </button>
                <button onClick={handleDelete} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-slate-100">
              {task ? (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-green-700">
                    ✓ Converted to a task (status: {task.status})
                  </p>
                  <a
                    href={`/dashboard/tasks/${task.id}`}
                    className="px-4 py-2 rounded-md border border-brand text-brand text-sm font-medium hover:bg-slate-100 transition"
                  >
                    Open Task &amp; Chat
                  </a>
                </div>
              ) : isStaff && !isDeleted ? (
                <button
                  onClick={handleConvertToTask}
                  disabled={converting}
                  className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
                >
                  {converting ? "Converting..." : "Convert to Task"}
                </button>
              ) : (
                !isDeleted && (
                  <p className="text-sm text-slate-400">
                    Your agency hasn't started work on this yet -- you'll see updates here once
                    they do.
                  </p>
                )
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm mt-4 space-y-4"
          >
            <h2 className="text-sm font-semibold text-slate-700">Edit Requirement</h2>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => updateForm("category", e.target.value)}
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
                  value={form.platform}
                  onChange={(e) => updateForm("platform", e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => updateForm("priority", e.target.value)}
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
                  onChange={(e) => updateForm("deadline", e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                {requirement.storage_path ? "Replace File" : "Attach File"} (optional)
              </label>
              {requirement.storage_path && !file && (
                <p className="text-xs text-slate-400 mb-1">Current: {requirement.file_name}</p>
              )}
              <input
                type="file"
                onChange={(e) => {
                  const selected = e.target.files?.[0] || null;
                  if (selected && selected.size > 100 * 1024 * 1024) {
                    setError("File is too large. Max size is 100MB.");
                    e.target.value = "";
                    return;
                  }
                  setError("");
                  setFile(selected);
                }}
                className="text-sm"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setFile(null);
                  setError("");
                }}
                className="px-4 py-2 rounded-md border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-100 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm mt-4 p-4">
          <h2 className="text-sm font-semibold text-slate-600 mb-3">Journey</h2>
          <div className="space-y-3">
            <div className="flex gap-3 text-sm">
              <span className="text-slate-300 flex-shrink-0">📝</span>
              <div>
                <p className="text-slate-700">Requirement created</p>
                <p className="text-xs text-slate-400">
                  {new Date(requirement.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {requirement.converted_to_task_at && (
              <div className="flex gap-3 text-sm">
                <span className="text-slate-300 flex-shrink-0">➡️</span>
                <div>
                  <p className="text-slate-700">Converted to Task</p>
                  <p className="text-xs text-slate-400">
                    {new Date(requirement.converted_to_task_at).toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {journey.map((h) => (
              <div key={h.id} className="flex gap-3 text-sm">
                <span className="text-slate-300 flex-shrink-0">
                  {h.entity_type === "requirement" ? "✏️" : "🔄"}
                </span>
                <div>
                  <p className="text-slate-700">
                    <span className="font-medium">{h.actorName}</span> — {h.action}
                  </p>
                  <p className="text-xs text-slate-400">{new Date(h.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}

            {!requirement.converted_to_task_at && (
              <p className="text-xs text-slate-300 italic">Not converted to a task yet.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
