import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/send-emails
//
// Drains the email outbox over Gmail SMTP. Called on a schedule
// rather than straight from a database trigger, so a slow or failing
// mail server can never block the write that queued the email, and a
// failed send has somewhere to be retried from.
//
// Env:
//   GMAIL_USER           -- the sending Gmail address
//   GMAIL_APP_PASSWORD   -- a Google App Password (NOT the account
//                           password; 2-Step Verification must be on)
//   EMAIL_FROM           -- optional display name, e.g. "Agency OS"
//   PUSH_TRIGGER_SECRET  -- shared with the caller (reused from push)

// Node runtime: nodemailer opens a TCP connection, which the edge
// runtime doesn't support.
export const runtime = "nodejs";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 20;

export async function POST(request) {
  const secret = process.env.PUSH_TRIGGER_SECRET;
  if (secret && request.headers.get("x-push-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    // Not configured yet -- succeed quietly rather than filling the
    // outbox with failures. Emails queue until it's set up.
    return NextResponse.json({ sent: 0, reason: "email not configured" });
  }

  const fromName = process.env.EMAIL_FROM || "Agency OS";
  const from = `${fromName} <${user}>`;

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

  // One connection reused across the batch -- Gmail throttles
  // aggressively if you reconnect per message.
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    pool: true,
    maxConnections: 1,
    maxMessages: BATCH_SIZE,
  });

  let sent = 0;
  let failed = 0;

  for (const mail of pending) {
    try {
      await transporter.sendMail({
        from,
        to: mail.to_email,
        subject: mail.subject,
        html: wrapHtml(mail.body_html),
      });

      await supabaseAdmin
        .from("email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", mail.id);
      sent += 1;
    } catch (err) {
      const attempts = (mail.attempts || 0) + 1;
      await supabaseAdmin
        .from("email_outbox")
        .update({
          // Only give up once retries are exhausted -- a transient SMTP
          // error shouldn't discard the email on the first try.
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          error: String(err?.message || err).slice(0, 500),
        })
        .eq("id", mail.id);
      failed += 1;
    }
  }

  transporter.close();

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
