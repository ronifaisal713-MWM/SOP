"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { categoryForRole } from "@/lib/roleCategory";
import ChatWidget from "@/components/ChatWidget";
import ClientChat from "@/components/ClientChat";
import StaffChat from "@/components/StaffChat";
import Sidebar from "@/components/Sidebar";

// Desktop sidebar navigation, grouped into sections with icons.
const SIDEBAR_BY_CATEGORY = {
  platform: [
    {
      section: null,
      items: [
        { href: "/dashboard/platform", label: "Dashboard", icon: "🏠" },
        { href: "/dashboard/platform/email-requests", label: "Email Requests", icon: "✉️" },
      ],
    },
  ],
  agency: [
    {
      section: "Main",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "🏠" },
        { href: "/dashboard/tasks", label: "Task Board", icon: "📋" },
        { href: "/dashboard/requirements", label: "Requirements", icon: "📝" },
        { href: "/dashboard/reports", label: "Reports", icon: "📊" },
      ],
    },
    {
      section: "Management",
      items: [
        { href: "/dashboard/admin/clients", label: "Clients", icon: "👥" },
        { href: "/dashboard/admin/team", label: "Team", icon: "🧑‍💼" },
        { href: "/dashboard/monthly-reports", label: "Monthly Reports", icon: "📅" },
        { href: "/dashboard/billing", label: "Billing", icon: "💵" },
        { href: "/dashboard/admin/email-requests", label: "Email Requests", icon: "✉️" },
      ],
    },
  ],
  staff: [
    {
      section: "Main",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "🏠" },
        { href: "/dashboard/tasks", label: "Task Board", icon: "📋" },
        { href: "/dashboard/requirements", label: "Requirements", icon: "📝" },
        { href: "/dashboard/reports", label: "Reports", icon: "📊" },
      ],
    },
    {
      section: "Clients",
      items: [
        { href: "/dashboard/admin/clients", label: "Clients", icon: "👥" },
        { href: "/dashboard/admin/team", label: "Team", icon: "🧑‍💼" },
        { href: "/dashboard/monthly-reports", label: "Monthly Reports", icon: "📅" },
        { href: "/dashboard/billing", label: "Billing", icon: "💵" },
      ],
    },
  ],
  client: [
    {
      section: null,
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "🏠" },
        { href: "/dashboard/my-tasks", label: "My Tasks", icon: "📋" },
        { href: "/dashboard/requirements", label: "Requirements", icon: "📝" },
        { href: "/dashboard/monthly-reports", label: "Monthly Reports", icon: "📅" },
        { href: "/dashboard/billing", label: "Billing", icon: "💵" },
        { href: "/dashboard/team", label: "Your Team", icon: "👥" },
      ],
    },
  ],
};

const NAV_BY_CATEGORY = {
  platform: [
    { href: "/dashboard/platform", label: "Dashboard" },
    { href: "/dashboard/platform/email-requests", label: "Email Requests" },
  ],
  agency: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/admin/clients", label: "Clients" },
    { href: "/dashboard/admin/team", label: "Team" },
    { href: "/dashboard/tasks", label: "Task Board" },
    { href: "/dashboard/requirements", label: "Requirements" },
    { href: "/dashboard/reports", label: "Reports" },
    { href: "/dashboard/monthly-reports", label: "Monthly Reports" },
    { href: "/dashboard/billing", label: "Billing" },
    { href: "/dashboard/admin/email-requests", label: "Email Requests" },
  ],
  staff: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/admin/clients", label: "Clients" },
    { href: "/dashboard/admin/team", label: "Team" },
    { href: "/dashboard/tasks", label: "Task Board" },
    { href: "/dashboard/requirements", label: "Requirements" },
    { href: "/dashboard/reports", label: "Reports" },
    { href: "/dashboard/monthly-reports", label: "Monthly Reports" },
    { href: "/dashboard/billing", label: "Billing" },
  ],
  client: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/my-tasks", label: "My Tasks" },
    { href: "/dashboard/requirements", label: "Requirements" },
    { href: "/dashboard/monthly-reports", label: "Monthly Reports" },
    { href: "/dashboard/billing", label: "Billing" },
    { href: "/dashboard/team", label: "Your Team" },
  ],
};

// Bottom tab bar (mobile only) shows at most 4 primary destinations per
// role, plus a "More" tab for anything else -- a long horizontal link
// list doesn't fit a phone screen the way it does a desktop header.
const MOBILE_PRIMARY_BY_CATEGORY = {
  platform: [
    { href: "/dashboard/platform", label: "Home", icon: "🏠" },
    { href: "/dashboard/platform/email-requests", label: "Requests", icon: "✉️" },
  ],
  agency: [
    { href: "/dashboard", label: "Home", icon: "🏠" },
    { href: "/dashboard/tasks", label: "Tasks", icon: "📋" },
    { href: "/dashboard/requirements", label: "Reqs", icon: "📝" },
    { href: "/dashboard/admin/clients", label: "Clients", icon: "👥" },
  ],
  staff: [
    { href: "/dashboard", label: "Home", icon: "🏠" },
    { href: "/dashboard/tasks", label: "Tasks", icon: "📋" },
    { href: "/dashboard/requirements", label: "Reqs", icon: "📝" },
    { href: "/dashboard/admin/clients", label: "Clients", icon: "👥" },
  ],
  client: [
    { href: "/dashboard", label: "Home", icon: "🏠" },
    { href: "/dashboard/my-tasks", label: "Tasks", icon: "📋" },
    { href: "/dashboard/requirements", label: "Reqs", icon: "📝" },
    { href: "/dashboard/monthly-reports", label: "Reports", icon: "📊" },
  ],
};

const MOBILE_MORE_BY_CATEGORY = {
  platform: [],
  agency: [
    { href: "/dashboard/admin/team", label: "Team" },
    { href: "/dashboard/reports", label: "Reports" },
    { href: "/dashboard/monthly-reports", label: "Monthly Reports" },
    { href: "/dashboard/billing", label: "Billing" },
    { href: "/dashboard/admin/email-requests", label: "Email Requests" },
  ],
  staff: [
    { href: "/dashboard/admin/team", label: "Team" },
    { href: "/dashboard/reports", label: "Reports" },
    { href: "/dashboard/monthly-reports", label: "Monthly Reports" },
    { href: "/dashboard/billing", label: "Billing" },
  ],
  client: [
    { href: "/dashboard/billing", label: "Billing" },
    { href: "/dashboard/team", label: "Your Team" },
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
  const [fullName, setFullName] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [organizationId, setOrganizationId] = useState(null);
  const [owners, setOwners] = useState([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [staffDmOpen, setStaffDmOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pendingMentionsCount, setPendingMentionsCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(searchParams.get("openChat") === "1");
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState(null);

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
        .select("role, full_name, is_platform_owner, organization_id, deletion_requested_at")
        .eq("id", sessionUser.id)
        .single();

      if (!isMounted) return;
      setUser(sessionUser);
      setRole(profile?.role || null);
      setFullName(profile?.full_name || null);
      setIsPlatformOwner(!!profile?.is_platform_owner);
      const cat = categoryForRole(profile?.role);
      setCategory(cat);
      setChecked(true);

      if (profile?.deletion_requested_at) {
        setDeletionStatus({ scope: "self", requestedAt: profile.deletion_requested_at });
      } else {
        let orgIdToCheck = profile?.organization_id || null;

        if (cat === "client") {
          const { data: clientUser } = await supabase
            .from("client_users")
            .select("client_id, clients(organization_id)")
            .eq("id", sessionUser.id)
            .maybeSingle();
          orgIdToCheck = clientUser?.clients?.organization_id || null;
        }

        if (orgIdToCheck) {
          const { data: org } = await supabase
            .from("organizations")
            .select("deletion_requested_at")
            .eq("id", orgIdToCheck)
            .maybeSingle();
          if (org?.deletion_requested_at) {
            setDeletionStatus({
              scope: "agency",
              requestedAt: org.deletion_requested_at,
              isOwner: profile?.role === "super_admin",
            });
          }
        }
      }

      if (cat === "client") {
        const { data: clientUser } = await supabase
          .from("client_users")
          .select("client_id")
          .eq("id", sessionUser.id)
          .maybeSingle();
        if (isMounted) setClientId(clientUser?.client_id || null);
      }

      if (cat === "staff") {
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", sessionUser.id)
          .single();
        const orgId = myProfile?.organization_id || null;
        if (isMounted) setOrganizationId(orgId);

        if (orgId) {
          const { data: ownerRows } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("organization_id", orgId)
            .in("role", ["super_admin", "admin"]);
          if (isMounted) {
            setOwners(ownerRows || []);
            setSelectedOwnerId(ownerRows?.[0]?.id || "");
          }
        }
      }

      // Two-part fetch: every UNREAD notification (no tight limit --
      // sidebar/tab badge counts must be exact, and a busy account can
      // easily have more than 15 total notifications with some unread
      // ones older than the most recent 15) merged with a handful of
      // recent ones so the bell dropdown still has content once
      // everything's read.
      const [{ data: unread }, { data: recent }] = await Promise.all([
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", sessionUser.id)
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", sessionUser.id)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);
      const merged = [...(unread || [])];
      const seenIds = new Set(merged.map((n) => n.id));
      (recent || []).forEach((n) => {
        if (!seenIds.has(n.id)) merged.push(n);
      });
      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (isMounted) setNotifications(merged);
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
          setNotifications((prev) => [payload.new, ...prev].slice(0, 200));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => prev.map((n) => (n.id === payload.new.id ? payload.new : n)));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  // Pending @mentions are tracked separately from the generic
  // notifications system on purpose: opening the bell marks every
  // notification read at once, but a mention should stay flagged
  // specifically until the person acknowledges that exact message
  // (the ✓ button in the chat itself) -- not just glanced at the bell.
  useEffect(() => {
    if (!user) return;

    async function loadPendingMentions() {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("mentioned_user_id", user.id)
        .eq("mention_acknowledged", false);
      setPendingMentionsCount(count ?? 0);
    }
    loadPendingMentions();

    const channel = supabase
      .channel(`mentions-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `mentioned_user_id=eq.${user.id}` },
        () => loadPendingMentions()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `mentioned_user_id=eq.${user.id}` },
        () => loadPendingMentions()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  async function handleCancelDeletion() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    await fetch("/api/account/cancel-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: deletionStatus?.scope || "self" }),
    });

    setDeletionStatus(null);
  }

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

  // The sidebar/nav should reflect which SECTION of the app is being
  // browsed, not just the account's underlying role -- an account that
  // is both an Agency owner and the Platform Owner (is_platform_owner)
  // keeps role = 'super_admin' the whole time, so category alone can't
  // tell /dashboard/platform/* apart from the agency's own pages.
  const isOnPlatformSection = pathname?.startsWith("/dashboard/platform");
  const effectiveCategory = isPlatformOwner && isOnPlatformSection ? "platform" : category;

  const navItems = NAV_BY_CATEGORY[effectiveCategory] || [];
  const sidebarSections = SIDEBAR_BY_CATEGORY[effectiveCategory] || [];
  const mobilePrimary = MOBILE_PRIMARY_BY_CATEGORY[effectiveCategory] || [];
  const mobileMore = MOBILE_MORE_BY_CATEGORY[effectiveCategory] || [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {checked && (
        <Sidebar
          sections={sidebarSections}
          pathname={pathname}
          userLabel={fullName || user?.email}
          role={role}
          onSignOut={handleSignOut}
          isPlatformOwner={isPlatformOwner}
          showPlatformSwitch={effectiveCategory === "agency"}
          showAgencySwitch={effectiveCategory === "platform" && category === "agency"}
          notifications={notifications}
        />
      )}

      <div className="flex-1 min-w-0">
        <header
          className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky z-10 flex-wrap gap-3"
          style={{ top: 0, paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        >
          <div className="flex items-center gap-5 flex-wrap">
            <span className="font-semibold text-brand md:hidden">Agency OS</span>
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
                {pendingMentionsCount > 0 && (
                  <span
                    className="absolute -bottom-1 -right-1 bg-purple-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center"
                    title={`${pendingMentionsCount} mention(s) still waiting for you to acknowledge`}
                  >
                    @
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-8 w-72 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-20">
                  {notifications.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-6">No notifications yet.</p>
                  )}
                  {notifications.slice(0, 20).map((n) => (
                    <Link
                      key={n.id}
                      href={n.link || "#"}
                      className="block px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition"
                    >
                      <p className="text-xs font-medium text-slate-700">{n.title}</p>
                      {n.body && <p className="text-xs text-slate-500">{n.body}</p>}
                    </Link>
                  ))}
                </div>
              )}

              {isPlatformOwner && effectiveCategory === "agency" && (
                <Link
                  href="/dashboard/platform"
                  className="text-sm text-purple-600 hover:underline hidden sm:inline md:hidden"
                  title="Switch to your Platform Owner dashboard"
                >
                  🔁 Platform View
                </Link>
              )}

              <Link
                href="/dashboard/profile"
                className="text-sm text-slate-500 hover:text-brand transition md:hidden"
                title="Profile"
              >
                👤 <span className="hidden sm:inline">Profile</span>
              </Link>

              <button
                onClick={handleSignOut}
                className="text-sm text-slate-500 hover:text-brand transition hidden sm:inline md:hidden"
              >
                Sign Out
              </button>
            </div>
          )}
        </header>

        <div className="pb-20 md:pb-0">
          {checked ? (
            deletionStatus ? (
              <DeletionPendingNotice
                status={deletionStatus}
                onCancel={handleCancelDeletion}
                onSignOut={handleSignOut}
              />
            ) : (
              children
            )
          ) : (
            <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>
          )}
        </div>
      </div>

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

      {/* Staff can message the agency owner/admin privately -- but never
          another staff member. If there's more than one owner/admin, a
          small picker in the popup header lets them choose which one. */}
      {checked && category === "staff" && organizationId && owners.length > 0 && (
        <ChatWidget
          title={
            owners.length === 1
              ? `💬 ${owners[0].full_name || "Owner"}`
              : "💬 Message Owner/Admin"
          }
          open={staffDmOpen}
          onToggle={() => setStaffDmOpen((o) => !o)}
          onClose={() => setStaffDmOpen(false)}
        >
          <div className="flex flex-col h-full">
            {owners.length > 1 && (
              <div className="px-3 py-2 border-b border-slate-100">
                <select
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md px-2 py-1 bg-slate-50"
                >
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.full_name || "Unnamed"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedOwnerId && (
              <div className="flex-1 min-h-0">
                <StaffChat
                  currentUser={user}
                  otherUserId={selectedOwnerId}
                  organizationId={organizationId}
                />
              </div>
            )}
          </div>
        </ChatWidget>
      )}

      {/* Bottom tab bar -- mobile only. A long horizontal link list
          (fine on a desktop header) doesn't fit a phone the way a
          native app's tab bar does. */}
      {checked && (mobilePrimary.length > 0 || mobileMore.length > 0) && (
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-stretch z-30"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {mobilePrimary.map((item) => {
            const active = pathname === item.href;
            const altHref =
              item.href === "/dashboard/admin/clients"
                ? "/dashboard/clients"
                : item.href === "/dashboard/my-tasks"
                ? "/dashboard/tasks"
                : null;
            const badge =
              item.label !== "Home"
                ? notifications.filter((n) => {
                    if (n.is_read || !n.link) return false;
                    const matchesHref = n.link === item.href || n.link.startsWith(item.href + "/");
                    const matchesAlt = altHref && n.link.startsWith(altHref + "/");
                    return matchesHref || matchesAlt;
                  }).length
                : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2 text-[11px] gap-0.5 ${
                  active ? "text-brand font-medium" : "text-slate-500"
                }`}
              >
                <span className="text-lg leading-none relative">
                  {item.icon}
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[8px] rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}

          {(mobileMore.length > 0 ||
            (isPlatformOwner && effectiveCategory === "agency")) && (
            <button
              onClick={() => setShowMoreSheet(true)}
              className="flex-1 flex flex-col items-center justify-center py-2 text-[11px] gap-0.5 text-slate-500"
            >
              <span className="text-lg leading-none">☰</span>
              More
            </button>
          )}
        </nav>
      )}

      {/* "More" bottom sheet -- overflow nav items plus Sign Out on
          mobile, where the header hides those to stay compact. */}
      {showMoreSheet && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-40 flex items-end"
          onClick={() => setShowMoreSheet(false)}
        >
          <div
            className="bg-white w-full rounded-t-lg shadow-2xl p-4 max-h-[80vh] overflow-y-auto"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <div className="space-y-1">
              {mobileMore.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-3 py-3 text-sm text-slate-700 rounded-md hover:bg-slate-50"
                >
                  {item.label}
                </Link>
              ))}
              {isPlatformOwner && effectiveCategory === "agency" && (
                <Link
                  href="/dashboard/platform"
                  className="block px-3 py-3 text-sm text-purple-600 rounded-md hover:bg-slate-50"
                >
                  🔁 Platform View
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="w-full text-left px-3 py-3 text-sm text-slate-500 rounded-md hover:bg-slate-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
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

function DeletionPendingNotice({ status, onCancel, onSignOut }) {
  const requestedAt = new Date(status.requestedAt);
  const purgeAt = new Date(requestedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil((purgeAt - new Date()) / (24 * 60 * 60 * 1000)));

  const canCancel = status.scope === "self" || status.isOwner;

  return (
    <main className="flex items-center justify-center py-24 px-6">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-lg p-6 shadow-sm text-center">
        <p className="text-3xl mb-3">⚠️</p>
        <h1 className="text-lg font-semibold text-red-600 mb-2">
          {status.scope === "agency" ? "This agency is scheduled for deletion" : "Your account is scheduled for deletion"}
        </h1>
        <p className="text-sm text-slate-500 mb-4">
          {status.scope === "agency"
            ? "The agency owner requested this. All staff, clients, and data will be permanently removed."
            : "You requested this. Your account and data will be permanently removed."}{" "}
          This happens on <strong>{purgeAt.toLocaleDateString()}</strong> ({daysLeft} day
          {daysLeft === 1 ? "" : "s"} left) unless cancelled before then.
        </p>

        {canCancel ? (
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
          >
            Cancel Deletion
          </button>
        ) : (
          <p className="text-xs text-slate-400 mb-4">
            Only the agency owner can cancel this. Contact them if this is unexpected.
          </p>
        )}

        <div className="mt-4">
          <button onClick={onSignOut} className="text-xs text-slate-400 hover:underline">
            Sign Out
          </button>
        </div>
      </div>
    </main>
  );
}
