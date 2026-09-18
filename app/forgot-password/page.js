"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm bg-white p-8 rounded-lg shadow-sm border border-slate-200">
        <h1 className="text-xl font-semibold text-brand mb-2">পাসওয়ার্ড রিসেট করুন</h1>

        {sent ? (
          <p className="text-sm text-slate-600 mt-4">
            <strong>{email}</strong>-এ একটা রিসেট লিংক পাঠানো হয়েছে। ইনবক্স (বা Spam ফোল্ডার) চেক
            করুন এবং সেখান থেকে লিংকে ক্লিক করে নতুন পাসওয়ার্ড সেট করুন।
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-slate-500 mb-4">
              আপনার account-এর ইমেইল দিন — সেখানে একটা পাসওয়ার্ড রিসেট লিংক পাঠানো হবে।
            </p>

            <label className="block text-sm text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
              placeholder="you@example.com"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand text-white rounded-md py-2 font-medium hover:bg-brand-light transition disabled:opacity-60"
            >
              {submitting ? "পাঠানো হচ্ছে..." : "রিসেট লিংক পাঠান"}
            </button>

            {message && <p className="text-sm text-red-600 mt-4">{message}</p>}
          </form>
        )}

        <div className="mt-6 text-center">
          <a href="/login" className="text-xs text-slate-500 hover:underline">
            ← Sign in পেজে ফিরে যান
          </a>
        </div>
      </div>
    </main>
  );
}
