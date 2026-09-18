"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "project_manager", label: "Project Manager" },
  { value: "team_lead", label: "Team Lead" },
  { value: "employee", label: "Employee" },
];

export default function NewTeamMemberPage() {
  const { checked, allowed } = useRequireRole(["super_admin", "admin"]);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    role: "employee",
    mode: "invite",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch("/api/admin/create-team-member", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(form),
    });

    const result = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(result.error || "Something went wrong");
      return;
    }

    setSuccess(
      form.mode === "invite"
        ? `Team member added. An invite has been sent to ${form.email}.`
        : `Team member added. Share these credentials -- Email: ${form.email}, Password: ${form.password}`
    );
    setForm({ fullName: "", email: "", role: "employee", mode: "invite", password: "" });
  }

  if (!checked) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        This page is for Admins only. You don't have access.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-brand">Add Team Member</h1>
          <a href="/dashboard/admin/team" className="text-sm text-slate-500 hover:underline">
            ← Team list
          </a>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Full Name *</label>
            <input
              required
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Role *</label>
            <select
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">
              How should the account be created?
            </label>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.mode === "invite"}
                  onChange={() => update("mode", "invite")}
                />
                Send an email invite (they set their own password)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.mode === "password"}
                  onChange={() => update("mode", "password")}
                />
                I'll set a password myself
              </label>
            </div>
          </div>

          {form.mode === "password" && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Temporary Password *
              </label>
              <input
                type="text"
                required={form.mode === "password"}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="At least 8 characters"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand text-white rounded-md py-2 font-medium hover:bg-brand-light transition disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add Team Member"}
          </button>
        </form>
      </div>
    </main>
  );
}
