// The app has three strictly separate "portals": Agency (the owner/admins
// who run the workspace), Staff (people doing the work), and Client
// (the agency's customers). Every profiles.role belongs to exactly one
// of these -- this file is the single source of truth for that mapping,
// used by the three login pages, the dashboard layout's nav, and any
// page that needs to gate itself to one portal.

export const AGENCY_ROLES = ["super_admin", "admin"];
export const STAFF_ROLES = ["project_manager", "team_lead", "employee"];
export const CLIENT_ROLES = ["client_admin", "client_user"];

// Convenience: anyone who works AT the agency (Agency + Staff combined),
// as opposed to a client. Several existing pages (Requirements, Task
// detail/chat) branch their UI on "is this person staff at all?" rather
// than the finer agency/staff split.
export const ALL_STAFF_ROLES = [...AGENCY_ROLES, ...STAFF_ROLES];

export function categoryForRole(role) {
  if (AGENCY_ROLES.includes(role)) return "agency";
  if (STAFF_ROLES.includes(role)) return "staff";
  if (CLIENT_ROLES.includes(role)) return "client";
  return null;
}
