-- =========================================================
-- MWM Agency OS — Migration 011: 100MB uploads + 15-day auto-delete
-- Run this in Supabase SQL Editor AFTER migration_010
-- =========================================================
-- IMPORTANT: Before running, find the line marked "REPLACE THIS" below
-- and paste in your actual Supabase Secret key (the same sb_secret_...
-- value used for SUPABASE_SERVICE_ROLE_KEY in Vercel). Without it, old
-- database records will still get cleaned up on schedule, but the
-- actual file bytes in Storage won't be deleted (they'll keep counting
-- against your storage quota).

-- ---------- 1. Allow uploads up to 100MB (was unset / a lower default) ----------
update storage.buckets
set file_size_limit = 104857600  -- 100 MB in bytes
where id = 'chat-attachments';

-- ---------- 2. Let old file rows be removed without breaking chat history ----------
-- Right now, deleting a `files` row would fail if any message still
-- points at it. Change that so the message text stays, just without
-- a working attachment, once the file itself has expired.
alter table messages drop constraint if exists messages_attachment_id_fkey;
alter table messages
  add constraint messages_attachment_id_fkey
  foreign key (attachment_id) references files(id) on delete set null;

-- ---------- 3. Extensions needed for scheduled cleanup ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault cascade;

-- ---------- 4. Store your Storage API key safely (Vault, not plain SQL) ----------
-- Run this ONCE, with your real key pasted in place of the text below.
-- After it's stored, you never need to paste the real key into SQL again.
select vault.create_secret(
  'REPLACE THIS -- paste your sb_secret_... key here',
  'service_role_key'
);

-- ---------- 5. The cleanup function ----------
-- Runs daily. Finds any chat file older than 15 days, asks Supabase
-- Storage to actually delete the bytes (via its REST API, using the key
-- stored in Vault), then removes the database row. If the Vault secret
-- isn't set up, it still cleans up the database rows -- it just skips
-- the actual Storage deletion and leaves a note in the Postgres logs.
create or replace function public.cleanup_old_chat_attachments()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file record;
  v_service_key text;
  v_project_url text := 'https://zsxnxgngdhlwibyifzzb.supabase.co';
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_service_key is null then
    raise notice 'service_role_key not found in Vault -- deleting database rows only, Storage files will remain.';
  end if;

  for v_file in
    select id, storage_path from files
    where created_at < now() - interval '15 days'
  loop
    if v_service_key is not null then
      perform net.http_delete(
        url := v_project_url || '/storage/v1/object/chat-attachments/' || v_file.storage_path,
        headers := jsonb_build_object(
          'apikey', v_service_key,
          'Authorization', 'Bearer ' || v_service_key
        )
      );
    end if;

    delete from files where id = v_file.id;
  end loop;
end;
$$;

-- ---------- 6. Schedule it: every night at 3:00 AM ----------
select cron.schedule(
  'cleanup-old-chat-attachments',
  '0 3 * * *',
  $$select public.cleanup_old_chat_attachments();$$
);
