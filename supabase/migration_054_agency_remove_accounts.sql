-- =========================================================
-- MWM Agency OS — Migration 054: Agency can remove staff and clients
-- Run this in Supabase SQL Editor AFTER migration_053
-- =========================================================
-- Until now only a person could delete their own account. An agency
-- owner had no way to remove someone who had left, or a client whose
-- contract ended -- the account simply stayed active forever.
--
-- Deliberately a 7-day soft delete rather than an immediate one:
-- removing the wrong person is easy to do and, once their tasks,
-- messages and history are gone, impossible to undo. During the window
-- the account is locked out but every row is intact, so restoring is
-- just clearing a flag -- the user keeps the same id, and all their
-- work reattaches automatically rather than needing to be relinked.
--
-- Client-user deletion needs its own column: client_users is a
-- separate table from profiles, and only the latter had one.

alter table client_users add column if not exists deletion_requested_at timestamptz;
alter table client_users add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table profiles add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- Whole client companies, not just their individual logins.
alter table clients add column if not exists deletion_requested_at timestamptz;
alter table clients add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- ---------- Hide removed people from normal use ----------
-- A pending-deletion staff member shouldn't appear in assignee
-- pickers or the team list, but must stay visible to owners/admins so
-- they can restore them.
drop policy if exists "staff_read_same_org_profiles" on profiles;
create policy "staff_read_same_org_profiles" on profiles
  for select
  using (
    organization_id is not null
    and organization_id = current_user_org_id()
    and (
      deletion_requested_at is null
      or current_user_role() in ('super_admin', 'admin')
      or id = auth.uid()
    )
  );

-- ---------- Block a removed account from signing in ----------
-- Enforced in the database rather than only in the UI: the row is
-- still there during the grace period, so without this they could
-- still use the app normally.
create or replace function public.account_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from profiles where id = p_user_id and deletion_requested_at is not null
  ) and not exists (
    select 1 from client_users where id = p_user_id and deletion_requested_at is not null
  );
$$;

-- ---------- Extend the nightly purge ----------
-- Agency-initiated removals get 7 days; self-deletions keep their
-- original 3, since that was a deliberate choice by the person
-- themselves rather than a decision made about them.
create or replace function public.purge_deleted_accounts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org record;
  v_user record;
  v_client record;
begin
  -- Whole agencies past their grace period.
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

  -- Individual staff: self-deleted after 3 days, agency-removed after 7.
  for v_user in
    select id, deleted_by, deletion_requested_at from profiles
    where deletion_requested_at is not null
  loop
    if v_user.deleted_by is null then
      if v_user.deletion_requested_at < now() - interval '3 days' then
        delete from auth.users where id = v_user.id;
      end if;
    elsif v_user.deletion_requested_at < now() - interval '7 days' then
      delete from auth.users where id = v_user.id;
    end if;
  end loop;

  -- Individual client logins, same rule.
  for v_user in
    select id, deleted_by, deletion_requested_at from client_users
    where deletion_requested_at is not null
  loop
    if v_user.deleted_by is null then
      if v_user.deletion_requested_at < now() - interval '3 days' then
        delete from auth.users where id = v_user.id;
      end if;
    elsif v_user.deletion_requested_at < now() - interval '7 days' then
      delete from auth.users where id = v_user.id;
    end if;
  end loop;

  -- Whole client companies removed by the agency: their logins first,
  -- then the company, which cascades requirements, tasks, messages,
  -- files and reports.
  for v_client in
    select id from clients
    where deletion_requested_at is not null
    and deletion_requested_at < now() - interval '7 days'
  loop
    for v_user in select id from client_users where client_id = v_client.id loop
      delete from auth.users where id = v_user.id;
    end loop;
    delete from clients where id = v_client.id;
  end loop;
end;
$$;

-- ---------- Tell people what's happening ----------
create or replace function public.notify_on_account_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deletion_requested_at is null and new.deletion_requested_at is not null
     and new.deleted_by is not null then
    insert into notifications (user_id, title, body, link)
    values (
      new.id,
      'Your account is scheduled for removal',
      'It will be permanently deleted in 7 days. Contact your agency if this is a mistake.',
      '/dashboard'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_account_removal on profiles;
create trigger trg_notify_on_account_removal
after update of deletion_requested_at on profiles
for each row execute function public.notify_on_account_removal();
