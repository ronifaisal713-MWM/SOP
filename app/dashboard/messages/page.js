"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import ClientChat from "@/components/ClientChat";

export default function ClientMessagesPage() {
  const { user, checked } = useRequireAuth();
  const [role, setRole] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!checked || !user) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user]);

  async function loadData() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    setRole(profile?.role || null);

    const { data: clientUser, error: cuError } = await supabase
      .from("client_users")
      .select("client_id")
      .eq("id", user.id)
      .maybeSingle();

    if (cuError || !clientUser) {
      setError("This page is for clients only.");
      setLoading(false);
      return;
    }

    setClientId(clientUser.client_id);
    setLoading(false);
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  if (error || !clientId) {
    return (
      <main className="flex items-center justify-center py-20 text-slate-500 text-sm">
        {error || "No client account linked to this login."}
      </main>
    );
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to dashboard
        </a>
        <h1 className="text-2xl font-semibold text-brand mt-4 mb-6">Messages</h1>
        <ClientChat clientId={clientId} currentUser={user} viewerRole={role} />
      </div>
    </main>
  );
}
