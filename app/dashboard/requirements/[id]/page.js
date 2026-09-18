"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";

const PRIORITY_ICON = { urgent: "🔴", high: "🟠", normal: "🟡", low: "🟢" };

export default function RequirementDetailPage() {
  const { checked } = useRequireAuth();
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const [requirement, setRequirement] = useState(null);
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
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

    const { data: taskData } = await supabase
      .from("tasks")
      .select("*")
      .eq("requirement_id", id)
      .maybeSingle();

    setTask(taskData || null);
    setLoading(false);
  }

  useEffect(() => {
    if (!checked || !id) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, id]);

  async function handleConvertToTask() {
    setConverting(true);
    setError("");

    const { data: newTask, error: taskError } = await supabase
      .from("tasks")
      .insert({
        requirement_id: requirement.id,
        project_id: requirement.project_id,
        title: requirement.title,
        description: requirement.description,
        priority: requirement.priority,
        deadline: requirement.deadline,
        status: "incoming",
      })
      .select()
      .single();

    if (taskError) {
      setError(taskError.message);
      setConverting(false);
      return;
    }

    await supabase.from("requirements").update({ status: "planned" }).eq("id", requirement.id);

    setConverting(false);
    router.push("/dashboard/tasks");
  }

  if (!checked || loading) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  if (error && !requirement) {
    return (
      <main className="min-h-screen flex items-center justify-center text-red-600 text-sm">{error}</main>
    );
  }

  if (!requirement) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Requirement not found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <a href="/dashboard/requirements" className="text-sm text-slate-500 hover:underline">
          ← Requirements list
        </a>

        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm mt-4">
          <div className="flex items-start justify-between">
            <h1 className="text-xl font-semibold text-slate-800">{requirement.title}</h1>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {requirement.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
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

          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

          <div className="mt-6 pt-4 border-t border-slate-100">
            {task ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-green-700">
                  ✓ Converted to a task (status: {task.status})
                </p>
                <a
                  href="/dashboard/tasks"
                  className="px-4 py-2 rounded-md border border-brand text-brand text-sm font-medium hover:bg-slate-100 transition"
                >
                  View Kanban Board
                </a>
              </div>
            ) : (
              <button
                onClick={handleConvertToTask}
                disabled={converting}
                className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
              >
                {converting ? "Converting..." : "Convert to Task"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
