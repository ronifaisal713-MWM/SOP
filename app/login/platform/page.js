"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function PlatformLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_platform_owner")
      .eq("id", data.user.id)
      .single();

    if (!profile?.is_platform_owner) {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage("This sign-in is for the platform owner only.");
      return;
    }

    window.location.href = "/dashboard/platform";
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 px-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white p-8 rounded-lg shadow-sm border border-slate-200"
      >
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Platform Sign In</h1>
        <p className="text-xs text-slate-400 mb-6">Restricted -- SaaS platform owner only.</p>

        <label className="block text-sm text-slate-600 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
        />

        <label className="block text-sm text-slate-600 mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
        />

        <div className="text-right mb-4">
          <a href="/forgot-password" className="text-xs text-slate-500 hover:underline">
            Forgot password?
          </a>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white rounded-md py-2 font-medium hover:bg-slate-800 transition disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        {message && <p className="text-sm text-red-600 mt-4">{message}</p>}
      </form>
    </main>
  );
}
