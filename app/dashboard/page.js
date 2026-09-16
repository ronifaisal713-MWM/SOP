export default function DashboardPage() {
  const stats = [
    { label: "Active Projects", value: "-" },
    { label: "Pending Approvals", value: "-" },
    { label: "In Progress", value: "-" },
    { label: "Completed", value: "-" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <h1 className="text-2xl font-semibold text-brand mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
          >
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>
      <p className="text-slate-400 text-sm mt-8">
        Placeholder dashboard — connect Supabase queries here (clients, projects,
        tasks, requirements) to populate real data.
      </p>
    </main>
  );
}
