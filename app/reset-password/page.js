"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Supabase's client library reads the recovery token out of the URL
    // (the link from the reset email) and turns it into a temporary
    // session automatically. We just wait for that to happen before
    // showing the "set new password" form.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    // In case the event already fired before this component mounted.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("পাসওয়ার্ড কমপক্ষে ৮ ক্যারেক্টার হতে হবে।");
      return;
    }
    if (password !== confirmPassword) {
      setError("দুটো পাসওয়ার্ড মিলছে না।");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1500);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm bg-white p-8 rounded-lg shadow-sm border border-slate-200">
        <h1 className="text-xl font-semibold text-brand mb-4">নতুন পাসওয়ার্ড সেট করুন</h1>

        {!ready && !success && (
          <p className="text-sm text-slate-400">লিংক যাচাই করা হচ্ছে...</p>
        )}

        {ready && !success && (
          <form onSubmit={handleSubmit}>
            <label className="block text-sm text-slate-600 mb-1">নতুন পাসওয়ার্ড</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
              placeholder="কমপক্ষে ৮ ক্যারেক্টার"
            />

            <label className="block text-sm text-slate-600 mb-1">আবার লিখুন</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-6 text-sm"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand text-white rounded-md py-2 font-medium hover:bg-brand-light transition disabled:opacity-60"
            >
              {submitting ? "সেভ হচ্ছে..." : "পাসওয়ার্ড আপডেট করুন"}
            </button>

            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
          </form>
        )}

        {success && (
          <p className="text-sm text-green-600">
            পাসওয়ার্ড আপডেট হয়ে গেছে! Dashboard-এ নিয়ে যাওয়া হচ্ছে...
          </p>
        )}
      </div>
    </main>
  );
}
