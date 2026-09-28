import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/send-emails
//
// Drains the email outbox. Called by a Supabase cron every few
// minutes rather than straight from a database trigger, so a slow or
// failing mail provider can never block the write that queued the
// email, and a failed send has somewhere to be retried from.
//
// Env:
//   RESEND_API_KEY       -- from resend.com
//   EMAIL_FROM           -- e.g. "Agency OS <noreply@yourdomain.com>"
//   PUSH_TRIGGER_SECRET  -- shared with the caller (reused from push)

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 25;

export async function POST(request) {
  const secret = process.env.PUSH_TRIGGER_SECRET;
  if (secret && request.headers.get("x-push-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Not configured yet -- succeed quietly rather than filling the
    // outbox with failures. Emails simply queue until it's set up.
    return NextResponse.json({ sent: 0, reason: "email not configured" });
  }

  const from = process.env.EMAIL_FROM || "Agency OS <onboarding@resend.dev>";

  const { data: pending, error } = await supabaseAdmin
    .from("email_outbox")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const mail of pending) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [mail.to_email],
          subject: mail.subject,
          html: wrapHtml(mail.body_html),
        }),
      });

      if (res.ok) {
        await supabaseAdmin
          .from("email_outbox")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", mail.id);
        sent += 1;
      } else {
        const body = await res.text();
        const attempts = (mail.attempts || 0) + 1;
        await supabaseAdmin
          .from("email_outbox")
          .update({
            // Only mark failed once retries are exhausted -- a transient
            // provider error shouldn't discard the email on first try.
            status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            attempts,
            error: body.slice(0, 500),
          })
          .eq("id", mail.id);
        failed += 1;
      }
    } catch (err) {
      const attempts = (mail.attempts || 0) + 1;
      await supabaseAdmin
        .from("email_outbox")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          error: String(err?.message || err).slice(0, 500),
        })
        .eq("id", mail.id);
      failed += 1;
    }
  }

  return NextResponse.json({ sent, failed });
}

function wrapHtml(inner) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1F4E79;">Agency OS</p>
      <div style="font-size:14px;color:#334155;line-height:1.6;">${inner}</div>
      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;">
        You're receiving this because of your notification settings in Agency OS.
        An owner or admin can change who gets these under Leave &rarr; Settings.
      </p>
    </div>
  </body>
</html>`;
}
