import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/account/cancel-deletion
// Body: { scope: "self" | "agency" }
//
// Clears the pending deletion flag. "agency" is only honored for the
// actual owner (super_admin) of that organization -- a staff/client
// under a pending agency deletion can see it happening but can't be
// the one to cancel it; only the owner who requested it can.
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
    const userId = userData.user.id;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id")
      .eq("id", userId)
      .single();

    const body = await request.json();
    const { scope } = body;

    if (scope === "agency") {
      if (profile?.role !== "super_admin" || !profile.organization_id) {
        return NextResponse.json(
          { error: "Only the agency owner can cancel this" },
          { status: 403 }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from("organizations")
        .update({ deletion_requested_at: null })
        .eq("id", profile.organization_id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ deletion_requested_at: null })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
