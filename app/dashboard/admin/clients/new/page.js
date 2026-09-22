"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireRole } from "@/lib/useRequireRole";

export default function NewClientPage() {
  const { checked, allowed } = useRequireRole(["super_admin", "admin"]);

  const [form, setForm] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
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

    const res = await fetch("/api/admin/create-client", {
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
        ? `Client account created. An invite has been sent to ${form.email} -- the client will set their own password from there.`
        : `Client account created. Share these credentials with the client -- Email: ${form.email}, Password: ${form.password}`
    );
    setForm({ companyName: "", contactPerson: "", email: "", phone: "", mode: "invite", password: "" });
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
    <main className="px-6 py-10">
      <div className="max-w-xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <h1 className="text-2xl font-semibold text-brand">Add New Client</h1>
          <a href="/dashboard/admin/clients" className="text-sm text-slate-500 hover:underline">
            ← Client list
          </a>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Company Name *</label>
            <input
              required
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              placeholder="ABC Ltd."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Contact Person</label>
            <input
              value={form.contactPerson}
              onChange={(e) => update("contactPerson", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium text-slate-600 mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
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
                Send an email invite (client sets their own password)
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
            {submitting ? "Creating..." : "Create Client Account"}
          </button>
        </form>
      </div>
    </main>
  );
}
