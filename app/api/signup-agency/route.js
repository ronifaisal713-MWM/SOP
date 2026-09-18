import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/signup-agency
// Body: { agencyName, ownerName, email, password }
//
// Public route -- no auth token required, since this is how a brand-new
// agency (with no account yet) gets onto the platform. It creates:
//   1. a new `organizations` row (the agency's tenant)
//   2. an auth user for the owner
//   3. a `profiles` row for them with role = super_admin, tied to the
//      new organization
// From here on, everything that owner creates (clients, staff, etc.)
// is scoped to their own organization_id via RLS.
export async function POST(request) {
  try {
    const body = await request.json();
    const { agencyName, ownerName, email, password } = body;

    if (!agencyName || !ownerName || !email || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // 1. Create the organization (tenant).
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: agencyName })
      .select()
      .single();

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // 2. Create the owner's auth user.
    const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (userError) {
      // Roll back the organization row so we don't leave an orphan behind
      // if the email is already taken, etc.
      await supabaseAdmin.from("organizations").delete().eq("id", org.id);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // 3. Make them super_admin of their new organization.
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUser.user.id,
      full_name: ownerName,
      role: "super_admin",
      organization_id: org.id,
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, organizationId: org.id, userId: newUser.user.id });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
