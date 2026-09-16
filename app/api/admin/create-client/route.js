import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/admin/create-client
// Body: { companyName, contactPerson, email, phone, mode: "invite"|"password", password? }
//
// This runs on the server, so it's safe to use the service-role client
// here. We still verify the caller themselves (via their access token)
// is an admin before doing anything -- an API route URL is publicly
// reachable, so the UI hiding the "New Client" button is not enough
// on its own.
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
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (!callerProfile || !["super_admin", "admin"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "Not authorized to create client accounts" }, { status: 403 });
    }

    const body = await request.json();
    const { companyName, contactPerson, email, phone, mode, password } = body;

    if (!companyName || !email) {
      return NextResponse.json({ error: "Company name and email are required" }, { status: 400 });
    }
    if (mode === "password" && (!password || password.length < 8)) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // 1. Create the client company record.
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({
        company_name: companyName,
        contact_person: contactPerson || null,
        email,
        phone: phone || null,
      })
      .select()
      .single();

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 });
    }

    // 2. Create or invite the login (auth) user for this client.
    let newUser;
    if (mode === "invite") {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      newUser = data.user;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      newUser = data.user;
    }

    // 3. Link the new auth user to this client company.
    const { error: linkError } = await supabaseAdmin.from("client_users").insert({
      id: newUser.id,
      client_id: client.id,
      full_name: contactPerson || null,
      is_admin: true,
    });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    // 4. Give them a `profiles` row too, so any role check in the app
    // (e.g. useRequireRole) works consistently for client users as well.
    await supabaseAdmin.from("profiles").insert({
      id: newUser.id,
      full_name: contactPerson || null,
      role: "client_admin",
    });

    return NextResponse.json({ success: true, clientId: client.id, userId: newUser.id });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
