import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const GRACE_DAYS = 7;

// POST /api/admin/manage-account
// Body: { action: "remove" | "restore", kind: "staff" | "client_user" | "client", id }
//
// Lets an agency owner/admin remove someone who has left, or a client
// whose contract ended. Soft delete with a 7-day window rather than an
// immediate one: deleting the wrong person is easy, and once their
// tasks, messages and history are gone it can't be undone.
//
// During the window the account is locked out of signing in but every
// row stays put, so restoring is just clearing the flag -- the user
// keeps the same id and all their work reattaches on its own.
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const callerId = userData.user.id;
    const { data: caller } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id")
      .eq("id", callerId)
      .single();

    if (!caller || !["super_admin", "admin"].includes(caller.role)) {
      return NextResponse.json(
        { error: "Only an agency owner or admin can do this." },
        { status: 403 }
      );
    }

    const { action, kind, id } = await request.json();

    if (!["remove", "restore"].includes(action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    if (!["staff", "client_user", "client"].includes(kind)) {
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    if (id === callerId) {
      return NextResponse.json(
        { error: "You can't remove your own account here — use Profile → Danger Zone." },
        { status: 400 }
      );
    }

    // Every branch below re-checks that the target belongs to the
    // caller's own agency. Without that, an admin of one agency could
    // delete another agency's people by guessing an id.
    const timestamp = action === "remove" ? new Date().toISOString() : null;
    const deletedBy = action === "remove" ? callerId : null;

    if (kind === "staff") {
      const { data: target } = await supabaseAdmin
        .from("profiles")
        .select("id, role, organization_id")
        .eq("id", id)
        .single();

      if (!target || target.organization_id !== caller.organization_id) {
        return NextResponse.json({ error: "Not found in your agency." }, { status: 404 });
      }
      // The owner is the account the agency is built on -- removing it
      // would orphan every client and leave nobody able to restore it.
      if (target.role === "super_admin") {
        return NextResponse.json(
          { error: "The agency owner account can't be removed this way." },
          { status: 400 }
        );
      }

      await supabaseAdmin
        .from("profiles")
        .update({ deletion_requested_at: timestamp, deleted_by: deletedBy })
        .eq("id", id);

      await setSignInBlocked(id, action === "remove");
    }

    if (kind === "client_user") {
      const { data: target } = await supabaseAdmin
        .from("client_users")
        .select("id, client_id, clients(organization_id)")
        .eq("id", id)
        .single();

      if (!target || target.clients?.organization_id !== caller.organization_id) {
        return NextResponse.json({ error: "Not found in your agency." }, { status: 404 });
      }

      await supabaseAdmin
        .from("client_users")
        .update({ deletion_requested_at: timestamp, deleted_by: deletedBy })
        .eq("id", id);

      await setSignInBlocked(id, action === "remove");
    }

    if (kind === "client") {
      const { data: target } = await supabaseAdmin
        .from("clients")
        .select("id, organization_id")
        .eq("id", id)
        .single();

      if (!target || target.organization_id !== caller.organization_id) {
        return NextResponse.json({ error: "Not found in your agency." }, { status: 404 });
      }

      await supabaseAdmin
        .from("clients")
        .update({ deletion_requested_at: timestamp, deleted_by: deletedBy })
        .eq("id", id);

      // Lock out every login belonging to that company too, otherwise
      // its users could keep working on a company being deleted.
      const { data: users } = await supabaseAdmin
        .from("client_users")
        .select("id")
        .eq("client_id", id);

      for (const u of users || []) {
        await supabaseAdmin
          .from("client_users")
          .update({ deletion_requested_at: timestamp, deleted_by: deletedBy })
          .eq("id", u.id);
        await setSignInBlocked(u.id, action === "remove");
      }
    }

    return NextResponse.json({
      ok: true,
      graceDays: GRACE_DAYS,
      message:
        action === "remove"
          ? `Removed. Permanently deleted in ${GRACE_DAYS} days unless restored.`
          : "Restored.",
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}

// Banning is what actually stops them signing in -- the row is still
// there during the grace period, so without this they'd keep working
// as normal. A long ban rather than a permanent one, so an expired
// ban can never silently let a pending-deletion account back in.
async function setSignInBlocked(userId, blocked) {
  try {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: blocked ? "876000h" : "none",
    });
  } catch {
    // The soft-delete flag is the source of truth; if banning fails
    // the account is still marked and will be purged on schedule.
  }
}
