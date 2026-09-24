-- =========================================================
-- MWM Agency OS — Migration 037: Fire push on every new notification
-- Run this in Supabase SQL Editor AFTER migration_036
--
-- PREREQUISITES -- this alone does nothing until these are set in
-- Vercel (Settings -> Environment Variables), then redeployed:
--   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (Config)
--   VAPID_PRIVATE_KEY             (Secret)
--   VAPID_SUBJECT                 (Config, e.g. mailto:you@domain.com)
--   PUSH_TRIGGER_SECRET           (Secret, any long random string --
--                                  must match the value stored in
--                                  Vault below)
--
-- Calls the app's own /api/send-push route on Vercel rather than a
-- Supabase Edge Function, since Vercel deploys straight from git with
-- no CLI step involved.
-- =========================================================

-- Store the shared secret the trigger sends, so /api/send-push can
-- verify the call actually came from here and not from someone
-- POSTing at the endpoint directly.
-- REPLACE the value below with the same string you set as
-- PUSH_TRIGGER_SECRET in Vercel, then run this file.
select vault.create_secret(
  'REPLACE_WITH_YOUR_PUSH_TRIGGER_SECRET',
  'push_trigger_secret'
);

create or replace function public.send_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_app_url text := 'https://sop-mwm6.vercel.app';
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_trigger_secret'
  limit 1;

  if v_secret is null then
    -- Not configured -- in-app notifications still work, push just
    -- won't fire. Never worth failing the insert over.
    return new;
  end if;

  perform net.http_post(
    url := v_app_url || '/api/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'user_id', new.user_id,
      'title', new.title,
      'body', coalesce(new.body, ''),
      'url', coalesce(new.link, '/dashboard')
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_send_push_for_notification on notifications;
create trigger trg_send_push_for_notification
after insert on notifications
for each row execute function public.send_push_for_notification();
