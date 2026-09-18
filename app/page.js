export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <h1 className="text-3xl font-bold text-brand mb-2">Agency OS</h1>
      <p className="text-slate-500 mb-8">
        Client onboarding, requirements, tasks, chat, and approvals -- one workspace per agency.
      </p>
      <div className="flex gap-4">
        <a
          href="/login"
          className="px-5 py-2 rounded-md bg-brand text-white font-medium hover:bg-brand-light transition"
        >
          Sign In
        </a>
        <a
          href="/signup"
          className="px-5 py-2 rounded-md border border-brand text-brand font-medium hover:bg-slate-100 transition"
        >
          Set Up Your Agency
        </a>
      </div>
    </main>
  );
}
