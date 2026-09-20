-- =========================================================
-- MWM Agency OS — Migration 021: Rolling 14-month file expiry (Monthly Reports)
-- Run this in Supabase SQL Editor AFTER migration_020
-- =========================================================
-- Rolling window, not a bulk purge: this runs every night and checks
-- EACH report's own created_at against "14 months ago from right now".
-- A report submitted today has its file removed exactly 14 months from
-- today; one submitted tomorrow expires exactly 14 months from
-- tomorrow. Nothing gets wiped on a shared calendar date.
--
-- Only the FILE is removed -- the report itself (title, month,
-- summary) stays visible forever, so the client's folder history
-- isn't erased, just the old attachment.

alter table monthly_reports add column if not exists file_expired_at timestamptz;

create or replace function public.cleanup_old_monthly_report_files()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
  v_service_key text;
  v_project_url text := 'https://zsxnxgngdhlwibyifzzb.supabase.co';
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  for v_report in
    select id, storage_path from monthly_reports
    where created_at < now() - interval '14 months'
    and storage_path is not null
  loop
    if v_service_key is not null then
      perform net.http_delete(
        url := v_project_url || '/storage/v1/object/chat-attachments/' || v_report.storage_path,
        headers := jsonb_build_object(
          'apikey', v_service_key,
          'Authorization', 'Bearer ' || v_service_key
        )
      );
    end if;

    update monthly_reports
    set storage_path = null, file_name = null, file_expired_at = now()
    where id = v_report.id;
  end loop;
end;
$$;

-- Runs nightly at 4 AM -- a different hour than the chat-attachment
-- cleanup (3 AM) so they don't compete for the same moment.
select cron.schedule(
  'cleanup-old-monthly-report-files',
  '0 4 * * *',
  $$select public.cleanup_old_monthly_report_files();$$
);
