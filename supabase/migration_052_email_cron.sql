-- =========================================================
-- MWM Agency OS — Migration 052: Email outbox cron
-- Run this in Supabase SQL Editor AFTER migration_051
--
-- PREREQUISITES -- queued emails sit unsent until these are done:
--   1. Turn on 2-Step Verification on the sending Google account.
--   2. Create an App Password:
--        myaccount.google.com -> Security -> 2-Step Verification
--        -> App passwords -> generate one for "Mail"
--      (A normal account password will NOT work -- Google blocks it.)
--   3. Add to Vercel and redeploy:
--        GMAIL_USER          = your.address@gmail.com
--        GMAIL_APP_PASSWORD  = the 16-character App Password
--        EMAIL_FROM          = Agency OS      (optional display name)
-- =========================================================
-- Runs every 5 minutes rather than on every insert: batching keeps
-- Gmail's rate limits comfortable, and a burst of leave requests
-- won't open twenty SMTP connections at once.

select cron.unschedule('drain-email-outbox')
where exists (select 1 from cron.job where jobname = 'drain-email-outbox');

select cron.schedule(
  'drain-email-outbox',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://sop-mwm6.vercel.app/api/send-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'push_trigger_secret' limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Stop the outbox growing without limit. Sent mail is kept a month
-- for troubleshooting ("did that notification actually go out?"),
-- failures a bit longer since those are the ones worth investigating.
create or replace function public.cleanup_email_outbox()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from email_outbox
  where status = 'sent' and sent_at < now() - interval '30 days';

  delete from email_outbox
  where status = 'failed' and created_at < now() - interval '90 days';
end;
$$;

select cron.unschedule('cleanup-email-outbox')
where exists (select 1 from cron.job where jobname = 'cleanup-email-outbox');

select cron.schedule(
  'cleanup-email-outbox',
  '30 3 * * *',
  $$select public.cleanup_email_outbox();$$
);
