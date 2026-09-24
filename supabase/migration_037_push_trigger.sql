-- =========================================================
-- MWM Agency OS — Migration 037: Fire push on every new notification
-- Run this in Supabase SQL Editor AFTER migration_036
--
-- PREREQUISITES -- this migration alone does nothing useful until:
--   1. The send-push Edge Function is deployed
--        supabase functions deploy send-push
--   2. Its secrets are set (generate the VAPID pair with
--      `npx web-push generate-vapid-keys`):
--        supabase secrets set VAPID_PUBLIC_KEY=... \
--                             VAPID_PRIVATE_KEY=... \
--                             VAPID_SUBJECT=mailto:you@yourdomain.com
--   3. NEXT_PUBLIC_VAPID_PUBLIC_KEY is set in Vercel to the SAME
--      public key, and the app redeployed.
-- =========================================================

-- The function URL is derived from the project ref rather than
-- hardcoded, so this doesn't silently break if the project changes.
create or replace function public.send_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_key text;
  v_project_url text := 'https://zsxnxgngdhlwibyifzzb.supabase.co';
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_service_key is null then
    -- No key stored -- in-app notifications still work, push just
    -- won't fire. Not worth failing the insert over.
    return new;
  end if;

  perform net.http_post(
    url := v_project_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
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
