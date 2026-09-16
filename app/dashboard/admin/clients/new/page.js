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
      setError(result.error || "কিছু একটা ভুল হয়েছে");
      return;
    }

    setSuccess(
      form.mode === "invite"
        ? `Client account তৈরি হয়েছে। ${form.email} — এই ইমেইলে একটা invite পাঠানো হয়েছে, সেখান থেকে client নিজে পাসওয়ার্ড সেট করবে।`
        : `Client account তৈরি হয়েছে। এই credential client-কে দিন — Email: ${form.email}, Password: ${form.password}`
    );
    setForm({ companyName: "", contactPerson: "", email: "", phone: "", mode: "invite", password: "" });
  }

  if (!checked) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        এই পেজ শুধু Admin-দের জন্য। আপনার অ্যাক্সেস নেই।
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-brand">নতুন Client যোগ করুন</h1>
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

          <div className="grid grid-cols-2 gap-4">
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
              Account তৈরি করবেন কীভাবে?
            </label>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.mode === "invite"}
                  onChange={() => update("mode", "invite")}
                />
                Email-এ invite পাঠান (client নিজে গিয়ে পাসওয়ার্ড সেট করবে)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.mode === "password"}
                  onChange={() => update("mode", "password")}
                />
                আমি নিজে একটা পাসওয়ার্ড সেট করে দিই
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
                placeholder="কমপক্ষে ৮ ক্যারেক্টার"
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
            {submitting ? "তৈরি হচ্ছে..." : "Client Account তৈরি করুন"}
          </button>
        </form>
      </div>
    </main>
  );
}
