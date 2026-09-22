"use client";

import { useEffect, useState } from "react";

const ROLE_LABEL = {
  super_admin: "Owner",
  admin: "Admin",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  employee: "Employee",
  client_admin: "Client Admin",
  client_user: "Client",
};

// Desktop-only dark sidebar (Trackabi/Notion-style), collapsible to an
// icon rail. Mobile keeps the existing bottom tab bar instead -- a
// sidebar doesn't translate well to a phone screen.
export default function Sidebar({
  sections,
  pathname,
  userLabel,
  role,
  onSignOut,
  isPlatformOwner,
  showPlatformSwitch,
  showAgencySwitch,
  notifications,
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebarCollapsed") === "1");
    } catch {
      // ignore -- localStorage can be unavailable (private browsing, etc.)
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  // "Dashboard"/"Home" is every category's landing page, and would
  // match almost any notification link by prefix -- never badge it.
  function badgeCountFor(item) {
    if (!notifications || item.label === "Dashboard") return 0;
    return notifications.filter(
      (n) => !n.is_read && n.link && (n.link === item.href || n.link.startsWith(item.href + "/"))
    ).length;
  }

  return (
    <aside
      className={`hidden md:flex flex-col bg-[#0f2942] text-slate-200 h-screen sticky top-0 flex-shrink-0 transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="flex items-center justify-between px-4 h-14 border-b border-white/10 flex-shrink-0">
        {!collapsed && <span className="font-semibold text-white text-sm truncate">Agency OS</span>}
        <button
          onClick={toggle}
          className="text-slate-400 hover:text-white text-sm flex-shrink-0"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {sections.map((sec, i) => (
          <div key={i} className="mb-4">
            {sec.section && !collapsed && (
              <p className="px-4 text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-medium">
                {sec.section}
              </p>
            )}
            {sec.items.map((item) => {
              const active = pathname === item.href;
              const badge = badgeCountFor(item);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition border-l-2 relative ${
                    active
                      ? "bg-white/10 text-white border-brand-light"
                      : "text-slate-300 hover:bg-white/5 hover:text-white border-transparent"
                  }`}
                >
                  <span className="text-base leading-none flex-shrink-0 relative">
                    {item.icon}
                    {badge > 0 && collapsed && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                  </span>
                  {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                  {!collapsed && badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 flex-shrink-0">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-3 flex-shrink-0">
        {isPlatformOwner && showPlatformSwitch && (
          <a
            href="/dashboard/platform"
            title={collapsed ? "Platform View" : undefined}
            className="flex items-center gap-2 text-xs text-purple-300 hover:text-purple-200 mb-3"
          >
            <span>🔁</span>
            {!collapsed && <span>Platform View</span>}
          </a>
        )}

        {showAgencySwitch && (
          <a
            href="/dashboard"
            title={collapsed ? "Agency View" : undefined}
            className="flex items-center gap-2 text-xs text-purple-300 hover:text-purple-200 mb-3"
          >
            <span>🏢</span>
            {!collapsed && <span>Agency View</span>}
          </a>
        )}

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-brand-light text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {userLabel ? userLabel[0].toUpperCase() : "?"}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs text-white truncate">{userLabel}</p>
              <p className="text-[10px] text-slate-400">
                {showAgencySwitch ? "Platform Owner" : ROLE_LABEL[role] || role}
              </p>
            </div>
          )}
        </div>

        <div className={`flex gap-3 mt-2 text-xs ${collapsed ? "flex-col items-center" : ""}`}>
          <a href="/dashboard/profile" className="text-slate-400 hover:text-white" title="Profile">
            {collapsed ? "👤" : "Profile"}
          </a>
          <button onClick={onSignOut} className="text-slate-400 hover:text-white" title="Sign Out">
            {collapsed ? "🚪" : "Sign Out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
