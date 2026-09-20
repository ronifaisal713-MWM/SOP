-- =========================================================
-- MWM Agency OS — Migration 022: Account deletion with 3-day grace period
-- Run this in Supabase SQL Editor AFTER migration_021
-- =========================================================
-- Rolling grace period, same principle as the file-expiry jobs: each
-- account/agency gets exactly 3 days from ITS OWN deletion request,
-- checked nightly -- not a shared cutoff date for everyone.
--
-- Two levels:
--   - profiles.deletion_requested_at: an individual Staff or Client
--     deletes just their own account.
--   - organizations.deletion_requested_at: the Agency owner
--     (super_admin) deletes the whole agency -- every staff member,
--     every client, everything tied to it.
--
-- Within the 3 days, signing back in shows a "Cancel Deletion" screen
-- instead of the dashboard -- the account still fully exists, just
-- flagged. After 3 days, a nightly job permanently deletes it. Once
-- that runs, the email is free again and a genuinely new signup with
-- it starts with no old data.

-- ---------- 1. The flags ----------
alter table profiles add column if not exists deletion_requested_at timestamptz;
alter table organizations add column if not exists deletion_requested_at timestamptz;

-- ---------- 2. Make user deletion actually possible ----------
-- Several tables reference auth.users(id) with no ON DELETE behavior
-- specified (defaults to "block the delete if anything still points at
-- this user"). Deleting a staff/client account would fail outright
-- without these. Historical attribution (who sent this message, who
-- was this task assigned to) is set to null rather than deleting the
-- surrounding record -- the work itself outlives the person who did it.
-- notifications is the one exception: a notification with no
-- recipient is meaningless, so those rows are deleted outright instead.

alter table tasks drop constraint if exists tasks_assigned_to_fkey;
alter table tasks add constraint tasks_assigned_to_fkey
  foreign key (assigned_to) references auth.users(id) on delete set null;

alter table messages drop constraint if exists messages_sender_id_fkey;
alter table messages add constraint messages_sender_id_fkey
  foreign key (sender_id) references auth.users(id) on delete set null;

alter table messages drop constraint if exists messages_recipient_id_fkey;
alter table messages add constraint messages_recipient_id_fkey
  foreign key (recipient_id) references auth.users(id) on delete set null;

alter table requirements drop constraint if exists requirements_created_by_fkey;
alter table requirements add constraint requirements_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table files drop constraint if exists files_uploaded_by_fkey;
alter table files add constraint files_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users(id) on delete set null;

alter table approvals drop constraint if exists approvals_approved_by_fkey;
alter table approvals add constraint approvals_approved_by_fkey
  foreign key (approved_by) references auth.users(id) on delete set null;

alter table activity_log drop constraint if exists activity_log_actor_id_fkey;
alter table activity_log add constraint activity_log_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;

alter table monthly_reports drop constraint if exists monthly_reports_created_by_fkey;
alter table monthly_reports add constraint monthly_reports_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table monthly_reports drop constraint if exists monthly_reports_deleted_by_fkey;
alter table monthly_reports add constraint monthly_reports_deleted_by_fkey
  foreign key (deleted_by) references auth.users(id) on delete set null;

alter table email_change_requests drop constraint if exists email_change_requests_reviewed_by_fkey;
alter table email_change_requests add constraint email_change_requests_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table notifications drop constraint if exists notifications_user_id_fkey;
alter table notifications add constraint notifications_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- ---------- 3. The nightly purge ----------
create or replace function public.purge_deleted_accounts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org record;
  v_user record;
begin
  -- Whole agencies past their grace period: every user tied to them,
  -- then their clients (which cascades requirements/tasks/messages/
  -- files/reports/etc.), then the organization itself.
  for v_org in
    select id from organizations
    where deletion_requested_at is not null
    and deletion_requested_at < now() - interval '3 days'
  loop
    for v_user in select id from profiles where organization_id = v_org.id loop
      delete from auth.users where id = v_user.id;
    end loop;

    for v_user in
      select cu.id from client_users cu
      join clients c on c.id = cu.client_id
      where c.organization_id = v_org.id
    loop
      delete from auth.users where id = v_user.id;
    end loop;

    delete from clients where organization_id = v_org.id;
    delete from organizations where id = v_org.id;
  end loop;

  -- Individually self-deleted Staff/Clients (not part of a whole-agency
  -- deletion, which is handled above).
  for v_user in
    select id from profiles
    where deletion_requested_at is not null
    and deletion_requested_at < now() - interval '3 days'
  loop
    delete from auth.users where id = v_user.id;
  end loop;
end;
$$;

select cron.schedule(
  'purge-deleted-accounts',
  '0 5 * * *',
  $$select public.purge_deleted_accounts();$$
);
