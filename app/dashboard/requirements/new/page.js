"use client";

import { useEffect, useState } from "react";
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

const STAFF_ROLES = ["super_admin", "admin", "project_manager", "team_lead", "employee"];

export default function NewRequirementPage() {
  const { user, checked } = useRequireAuth();
  const router = useRouter();

  const [roleInfo, setRoleInfo] = useState({ loading: true, role: null, clientId: null });
  const [clients, setClients] = useState([]);

  const [form, setForm] = useState({
    title: "",
    category: CATEGORIES[0],
    platform: "",
    priority: "normal",
    deadline: "",
    description: "",
    clientId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Figure out whether the signed-in user is staff (picks a client from a
  // list) or a client user (their own client_id is used automatically).
  useEffect(() => {
    if (!checked || !user) return;

    async function loadRoleInfo() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = profile?.role || null;

      if (role && STAFF_ROLES.includes(role)) {
        const { data: clientList } = await supabase
          .from("clients")
          .select("id, company_name")
          .order("company_name");
        setClients(clientList || []);
        setRoleInfo({ loading: false, role, clientId: null });
      } else {
        const { data: clientUser } = await supabase
          .from("client_users")
          .select("client_id")
          .eq("id", user.id)
          .maybeSingle();
        setRoleInfo({ loading: false, role, clientId: clientUser?.client_id || null });
      }
    }

    loadRoleInfo();
  }, [checked, user]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const isStaff = roleInfo.role && STAFF_ROLES.includes(roleInfo.role);
    const clientId = isStaff ? form.clientId : roleInfo.clientId;

    if (isStaff && !clientId) {
      setError("Please select which Client this requirement is for.");
      return;
    }

    setSubmitting(true);

    const { error: insertError } = await supabase.from("requirements").insert({
      title: form.title,
      category: form.category,
      platform: form.platform || null,
      priority: form.priority,
      deadline: form.deadline || null,
      description: form.description || null,
      created_by: user?.id,
      client_id: clientId,
      status: "new",
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/dashboard/requirements");
  }

  if (!checked || roleInfo.loading) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  const isStaff = roleInfo.role && STAFF_ROLES.includes(roleInfo.role);

  return (
    <main className="px-6 py-10">
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
          {isStaff && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Client *</label>
              <select
                required
                value={form.clientId}
                onChange={(e) => update("clientId", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">-- Select a Client --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
              {clients.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  No clients yet — create one first from Dashboard → Clients.
                </p>
              )}
            </div>
          )}

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
