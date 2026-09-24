// Supabase Edge Function: send-push
//
// Called by a database trigger whenever a notifications row is
// inserted. Looks up every device that person has registered and
// sends a Web Push to each.
//
// Deploy:  supabase functions deploy send-push
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
//           automatically by the platform)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY"),
  Deno.env.get("VAPID_PRIVATE_KEY")
);

Deno.serve(async (req) => {
  try {
    const { user_id, title, body, url } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), { status: 400 });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no devices" }), { status: 200 });
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
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          sent += 1;
        } catch (err) {
          // 404/410 mean the browser threw the subscription away (app
          // uninstalled, permission revoked, etc.) -- prune those so
          // we stop trying. Anything else is likely transient.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            deadEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    if (deadEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    return new Response(JSON.stringify({ sent, pruned: deadEndpoints.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "unknown" }), { status: 500 });
  }
});
