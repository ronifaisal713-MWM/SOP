"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function DashboardPage() {
  const { user, checked } = useRequireAuth();
  const [requirementCount, setRequirementCount] = useState(null);

  useEffect(() => {
    if (!checked || !user) return;
    supabase
      .from("requirements")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setRequirementCount(count ?? 0));
  }, [checked, user]);

  if (!checked) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  const stats = [
    { label: "Active Projects", value: "-" },
    { label: "Pending Approvals", value: "-" },
    { label: "Requirements", value: requirementCount ?? "-" },
    { label: "Completed", value: "-" },
  ];

  return (
    <main className="px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
        {user?.email && <p className="text-sm text-slate-500">Signed in as {user.email}</p>}
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
        The "Requirements" count comes directly from Supabase now — the other cards are still
        placeholders and will show real data once the Projects and Approvals tables are wired up.
      </p>
    </main>
  );
}
