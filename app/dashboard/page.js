"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function DashboardPage() {
  const { user, checked } = useRequireAuth();
  const [requirementCount, setRequirementCount] = useState(null);

  useEffect(() => {
    if (!checked) return;
    supabase
      .from("requirements")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setRequirementCount(count ?? 0));
  }, [checked]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!checked) {
    return <main className="min-h-screen flex items-center justify-center text-slate-400">Loading...</main>;
  }

  const stats = [
    { label: "Active Projects", value: "-" },
    { label: "Pending Approvals", value: "-" },
    { label: "Requirements", value: requirementCount ?? "-" },
    { label: "Completed", value: "-" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
          {user?.email && <p className="text-sm text-slate-500">Signed in as {user.email}</p>}
        </div>
        <div className="flex gap-3">
          <a
            href="/dashboard/requirements"
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
          >
            Requirements
          </a>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-100 transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      <p className="text-slate-400 text-sm mt-8">
        "Requirements" কার্ডের সংখ্যাটা এখন সরাসরি Supabase থেকে আসছে — বাকি কার্ডগুলো এখনো
        placeholder, পরের ধাপে প্রজেক্ট ও অ্যাপ্রুভাল টেবিল যুক্ত হলে সেগুলোও real data দেখাবে।
      </p>
    </main>
  );
}
