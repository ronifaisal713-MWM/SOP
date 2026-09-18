import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const INVITABLE_ROLES = ["admin", "project_manager", "team_lead", "employee"];

// POST /api/admin/create-team-member
// Body: { fullName, email, mode: "invite"|"password", password?, role }
//
// Adds a new staff member to the CALLER's own organization -- never
// lets one agency's admin create a user in a different agency, since
// the new profile's organization_id is always read from the caller's
// own profile, not taken from the request body.
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

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id")
      .eq("id", userData.user.id)
      .single();

    if (!callerProfile || !["super_admin", "admin"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "Not authorized to add team members" }, { status: 403 });
    }
    if (!callerProfile.organization_id) {
      return NextResponse.json({ error: "Your account isn't linked to an agency" }, { status: 400 });
    }

    const body = await request.json();
    const { fullName, email, mode, password, role } = body;

    if (!fullName || !email || !role) {
      return NextResponse.json({ error: "Name, email, and role are required" }, { status: 400 });
    }
    if (!INVITABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (mode === "password" && (!password || password.length < 8)) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    let newUser;
    if (mode === "invite") {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      newUser = data.user;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      newUser = data.user;
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUser.id,
      full_name: fullName,
      role,
      organization_id: callerProfile.organization_id,
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId: newUser.id });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
