"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ALL_STAFF_ROLES } from "@/lib/roleCategory";
import ClientChat from "@/components/ClientChat";
import ChatWidget from "@/components/ChatWidget";
import SocialLinksManager from "@/components/SocialLinksManager";

function ClientWorkspacePageInner() {
  const { user, checked } = useRequireAuth();
  const params = useParams();
  const { id } = params;
  const searchParams = useSearchParams();

  const [role, setRole] = useState(null);
  const [allowed, setAllowed] = useState(false);
  const [client, setClient] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(searchParams.get("openChat") === "1");

  useEffect(() => {
    if (!checked || !user || !id) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user, id]);

  async function loadData() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const myRole = profile?.role || null;
    setRole(myRole);
    setAllowed(ALL_STAFF_ROLES.includes(myRole));

    if (!ALL_STAFF_ROLES.includes(myRole)) {
      setLoading(false);
      return;
    }

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();
    if (clientError) {
      setError(clientError.message);
      setLoading(false);
      return;
    }
    setClient(clientData);

    const { data: reqData } = await supabase
      .from("requirements")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });
    setRequirements(reqData || []);

    const { data: contactData } = await supabase
      .from("client_users")
      .select("id, full_name")
      .eq("client_id", id);
    setContacts(contactData || []);

    setLoading(false);
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  if (!allowed) {
    return (
      <main className="flex items-center justify-center py-20 text-slate-500 text-sm">
        This page is for agency staff only. You don't have access.
      </main>
    );
  }

  if (error || !client) {
    return (
      <main className="flex items-center justify-center py-20 text-red-600 text-sm">
        {error || "Client not found"}
      </main>
    );
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <a href="/dashboard/admin/clients" className="text-sm text-slate-500 hover:underline">
          ← All Clients
        </a>

        <div className="flex items-center justify-between mt-4 mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand">{client.company_name}</h1>
            <p className="text-sm text-slate-400">{client.email}</p>
          </div>
          <a
            href={`/dashboard/admin/clients/${id}/assign`}
            className="text-sm text-brand hover:underline"
          >
            Manage Team Assignment
          </a>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-2">Requirements</h2>
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {requirements.length === 0 && (
              <p className="text-center text-xs text-slate-300 py-8">No requirements yet.</p>
            )}
            {requirements.map((r) => (
              <a
                key={r.id}
                href={`/dashboard/requirements/${r.id}`}
                className="block px-4 py-3 hover:bg-slate-50 transition"
              >
                <p className="text-sm font-medium text-slate-800">{r.title}</p>
                <p className="text-xs text-slate-400">
                  {r.category || "-"} · {r.status}
                </p>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <SocialLinksManager clientId={id} />
        </div>
      </div>

      <ChatWidget
        title={`💬 ${client.company_name}`}
        open={chatOpen}
        onToggle={() => setChatOpen((o) => !o)}
        onClose={() => setChatOpen(false)}
      >
        <ClientChat
          clientId={id}
          currentUser={user}
          viewerRole={role}
          contacts={contacts}
          initialTab={searchParams.get("tab") || "public"}
          initialContactId={searchParams.get("contact") || ""}
          embedded
        />
      </ChatWidget>
    </main>
  );
}

export default function ClientWorkspacePage() {
  return (
    <Suspense
      fallback={<main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>}
    >
      <ClientWorkspacePageInner />
    </Suspense>
  );
}
