import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/account/request-deletion
// Body: { scope: "self" | "agency" }
//
// "self": marks the caller's own profile for deletion in 3 days.
// "agency": marks the caller's whole ORGANIZATION for deletion in 3
//           days -- only allowed for the actual owner (super_admin),
//           never a secondary admin, so one admin can't nuke the
//           whole agency out from under the owner.
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
          { error: "Only the agency owner can delete the whole agency" },
          { status: 403 }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from("organizations")
        .update({ deletion_requested_at: new Date().toISOString() })
        .eq("id", profile.organization_id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, scope: "agency" });
    }

    // scope === "self"
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ deletion_requested_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, scope: "self" });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
