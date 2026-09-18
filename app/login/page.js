export default function LoginChooserPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-brand mb-1">Sign In</h1>
        <p className="text-sm text-slate-500 mb-8">Choose how you're signing in.</p>

        <div className="space-y-3">
          <a
            href="/login/agency"
            className="block w-full bg-brand text-white rounded-md py-3 font-medium hover:bg-brand-light transition"
          >
            Agency
          </a>
          <a
            href="/login/staff"
            className="block w-full border border-brand text-brand rounded-md py-3 font-medium hover:bg-slate-100 transition"
          >
            Staff
          </a>
          <a
            href="/login/client"
            className="block w-full border border-brand text-brand rounded-md py-3 font-medium hover:bg-slate-100 transition"
          >
            Client
          </a>
        </div>

        <div className="mt-8">
          <a href="/signup" className="text-xs text-slate-500 hover:underline">
            New agency? Set up your workspace
          </a>
        </div>
      </div>
    </main>
  );
}
