import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/send-push
//
// Called by a database trigger whenever a notifications row is
// inserted. Looks up every device that person registered and pushes to
// each one.
//
// Deliberately a Vercel route rather than a Supabase Edge Function:
// this deploys automatically on git push, with no CLI step, which
// matters when the whole project is managed from the browser.
//
// Env needed (all in Vercel):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (also used client-side)
//   VAPID_PRIVATE_KEY             (server-only -- never NEXT_PUBLIC_)
//   VAPID_SUBJECT                 (mailto:you@yourdomain.com)
//   PUSH_TRIGGER_SECRET           (shared secret the DB trigger sends)
//   SUPABASE_SERVICE_ROLE_KEY     (already set for other admin routes)

export async function POST(request) {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
    const triggerSecret = process.env.PUSH_TRIGGER_SECRET;

    if (!publicKey || !privateKey) {
      // Not configured yet -- in-app notifications still work fine, so
      // this isn't an error worth shouting about.
      return NextResponse.json({ skipped: "push not configured" }, { status: 200 });
    }

    // Only the database trigger should be able to fan out pushes --
    // otherwise anyone could POST here and notify arbitrary people.
    if (!triggerSecret || request.headers.get("x-push-secret") !== triggerSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { user_id, title, body, url } = await request.json();
    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, reason: "no devices" }, { status: 200 });
    }

    const payload = JSON.stringify({
      title: title || "Agency OS",
      body: body || "",
      url: url || "/dashboard",
    });

    let sent = 0;
    const deadEndpoints = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent += 1;
        } catch (err) {
          // 404/410 mean the browser discarded this subscription (app
          // uninstalled, permission revoked) -- prune it so we stop
          // trying. Anything else is likely transient, so leave it.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            deadEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    if (deadEndpoints.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    return NextResponse.json({ sent, pruned: deadEndpoints.length });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
