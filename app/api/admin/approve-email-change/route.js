import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/admin/approve-email-change
// Body: { requestId, action: "approve" | "reject" }
//
// This uses the service-role client, so it re-checks authorization
// itself rather than relying on RLS (which is bypassed here) -- mirrors
// the same rule migration_018 encodes in SQL:
//   - a staff/client's request is reviewed by an Owner/Admin of their
//     own agency
//   - an Agency Owner/Admin's own request is reviewed by the Platform
//     Owner
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
    const reviewerId = userData.user.id;

    const { data: reviewerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id, is_platform_owner")
      .eq("id", reviewerId)
      .single();

    const body = await request.json();
    const { requestId, action } = body;

    if (!requestId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { data: changeRequest, error: fetchError } = await supabaseAdmin
      .from("email_change_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !changeRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (changeRequest.status !== "pending") {
      return NextResponse.json({ error: "This request was already reviewed" }, { status: 400 });
    }

    // Who is the requester, and who is allowed to review them?
    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id")
      .eq("id", changeRequest.user_id)
      .single();

    let authorized = false;

    if (requesterProfile && ["super_admin", "admin"].includes(requesterProfile.role)) {
      // Requester is an Agency owner/admin -- only the Platform Owner
      // can review this.
      authorized = reviewerProfile?.is_platform_owner === true;
    } else {
      // Requester is staff or a client -- resolve their organization
      // (staff: via profiles; client: via client_users -> clients).
      let requesterOrgId = requesterProfile?.organization_id || null;
      if (!requesterOrgId) {
        const { data: clientUser } = await supabaseAdmin
          .from("client_users")
          .select("client_id")
          .eq("id", changeRequest.user_id)
          .maybeSingle();
        if (clientUser?.client_id) {
          const { data: client } = await supabaseAdmin
            .from("clients")
            .select("organization_id")
            .eq("id", clientUser.client_id)
            .single();
          requesterOrgId = client?.organization_id || null;
        }
      }

      authorized =
        ["super_admin", "admin"].includes(reviewerProfile?.role) &&
        reviewerProfile.organization_id &&
        reviewerProfile.organization_id === requesterOrgId;
    }

    if (!authorized) {
      return NextResponse.json({ error: "Not authorized to review this request" }, { status: 403 });
    }

    if (action === "approve") {
      const { error: emailUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        changeRequest.user_id,
        { email: changeRequest.requested_email, email_confirm: true }
      );
      if (emailUpdateError) {
        return NextResponse.json({ error: emailUpdateError.message }, { status: 500 });
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("email_change_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
