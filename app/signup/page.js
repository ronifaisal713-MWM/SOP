"use client";

import { useState } from "react";

export default function SignupPage() {
  const [form, setForm] = useState({
    agencyName: "",
    ownerName: "",
    email: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await fetch("/api/signup-agency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const result = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(result.error || "Something went wrong");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      window.location.href = "/login";
    }, 2000);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm bg-white p-8 rounded-lg shadow-sm border border-slate-200">
        <h1 className="text-xl font-semibold text-brand mb-1">Set up your agency</h1>
        <p className="text-sm text-slate-500 mb-6">
          Create your agency's own workspace -- your own clients, team, and data, separate from
          every other agency on this platform.
        </p>

        {success ? (
          <p className="text-sm text-green-600">
            Account created! Taking you to the sign-in page...
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block text-sm text-slate-600 mb-1">Agency Name</label>
            <input
              required
              value={form.agencyName}
              onChange={(e) => update("agencyName", e.target.value)}
              placeholder="Acme Marketing Co."
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
            />

            <label className="block text-sm text-slate-600 mb-1">Your Name</label>
            <input
              required
              value={form.ownerName}
              onChange={(e) => update("ownerName", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
            />

            <label className="block text-sm text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
            />

            <label className="block text-sm text-slate-600 mb-1">Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="At least 8 characters"
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-6 text-sm"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand text-white rounded-md py-2 font-medium hover:bg-brand-light transition disabled:opacity-60"
            >
              {submitting ? "Creating your workspace..." : "Create Agency Account"}
            </button>

            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
          </form>
        )}

        <div className="mt-6 text-center">
          <a href="/login" className="text-xs text-slate-500 hover:underline">
            Already have an account? Sign in
          </a>
        </div>
      </div>
    </main>
  );
}
