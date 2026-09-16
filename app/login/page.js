"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setMessage("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
    } else {
      window.location.href = "/dashboard";
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white p-8 rounded-lg shadow-sm border border-slate-200"
      >
        <h1 className="text-xl font-semibold text-brand mb-6">Sign in</h1>

        <label className="block text-sm text-slate-600 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
          placeholder="you@example.com"
        />

        <label className="block text-sm text-slate-600 mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-6 text-sm"
          placeholder="••••••••"
        />

        <button
          type="submit"
          className="w-full bg-brand text-white rounded-md py-2 font-medium hover:bg-brand-light transition"
        >
          Sign In
        </button>

        {message && <p className="text-sm text-slate-500 mt-4">{message}</p>}
      </form>
    </main>
  );
}
