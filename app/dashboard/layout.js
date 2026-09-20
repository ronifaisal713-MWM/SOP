"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { categoryForRole } from "@/lib/roleCategory";
import ChatWidget from "@/components/ChatWidget";
import ClientChat from "@/components/ClientChat";

const NAV_BY_CATEGORY = {
  agency: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/admin/clients", label: "Clients" },
    { href: "/dashboard/admin/team", label: "Team" },
    { href: "/dashboard/tasks", label: "Task Board" },
    { href: "/dashboard/requirements", label: "Requirements" },
    { href: "/dashboard/reports", label: "Reports" },
  ],
  staff: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/admin/clients", label: "Clients" },
    { href: "/dashboard/tasks", label: "Task Board" },
    { href: "/dashboard/requirements", label: "Requirements" },
    { href: "/dashboard/reports", label: "Reports" },
  ],
  client: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/my-tasks", label: "My Tasks" },
    { href: "/dashboard/requirements", label: "Requirements" },
  ],
};

// This layout wraps every /dashboard/* page, so the top bar -- and which
// links appear on it -- is always the same no matter which page you're
// on. It's also where the "does this URL even belong to my portal?" auth
// check lives once, instead of being duplicated per page.
function DashboardLayoutInner({ children }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [category, setCategory] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [checked, setChecked] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [chatOpen, setChatOpen] = useState(searchParams.get("openChat") === "1");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const sessionUser = sessionData.session.user;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionUser.id)
        .single();

      if (!isMounted) return;
      setUser(sessionUser);
      setRole(profile?.role || null);
      const cat = categoryForRole(profile?.role);
      setCategory(cat);
      setChecked(true);

      if (cat === "client") {
        const { data: clientUser } = await supabase
          .from("client_users")
          .select("client_id")
          .eq("id", sessionUser.id)
          .maybeSingle();
        if (isMounted) setClientId(clientUser?.client_id || null);
      }

      const { data: notifs } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", sessionUser.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (isMounted) setNotifications(notifs || []);
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev].slice(0, 15));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleOpenNotifications() {
    setShowNotifications((s) => !s);
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    }
  }

  const navItems = NAV_BY_CATEGORY[category] || [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10 flex-wrap gap-3">
        <div className="flex items-center gap-5 flex-wrap">
          <span className="font-semibold text-brand">Agency OS</span>
          {checked &&
            navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-slate-600 hover:text-brand transition"
              >
                {item.label}
              </a>
            ))}
        </div>

        {checked && (
          <div className="flex items-center gap-4 relative">
            <button onClick={handleOpenNotifications} className="relative text-lg" title="Notifications">
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-8 w-72 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-20">
                {notifications.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">No notifications yet.</p>
                )}
                {notifications.map((n) => (
                  <a
                    key={n.id}
                    href={n.link || "#"}
                    className="block px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition"
                  >
                    <p className="text-xs font-medium text-slate-700">{n.title}</p>
                    {n.body && <p className="text-xs text-slate-500">{n.body}</p>}
                  </a>
                ))}
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="text-sm text-slate-500 hover:text-brand transition"
            >
              Sign Out
            </button>
          </div>
        )}
      </header>

      {checked ? (
        children
      ) : (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>
      )}

      {/* Floating chat -- clients reach the agency this way from any page,
          instead of navigating to a separate Messages page. */}
      {checked && category === "client" && clientId && (
        <ChatWidget
          title="💬 Messages"
          open={chatOpen}
          onToggle={() => setChatOpen((o) => !o)}
          onClose={() => setChatOpen(false)}
        >
          <ClientChat
            clientId={clientId}
            currentUser={user}
            viewerRole={role}
            initialTab={searchParams.get("tab") || "public"}
            embedded
          />
        </ChatWidget>
      )}
    </div>
  );
}

// useSearchParams() (used above to support ?openChat=1 deep links from
// notifications) requires a Suspense boundary during static generation.
export default function DashboardLayout({ children }) {
  return (
    <Suspense
      fallback={<div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>}
    >
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
