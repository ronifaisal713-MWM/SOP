-- =========================================================
-- MWM Agency OS — Migration 019: Agency Owner + Platform Owner in one account
-- Run this in Supabase SQL Editor AFTER migration_018
-- =========================================================
-- Revises migration_018's approach: instead of a mutually-exclusive
-- 'platform_owner' role (which meant the account could ONLY be the
-- platform owner, losing its agency), this uses an independent
-- is_platform_owner flag. roni.faisal713@gmail.com keeps its normal
-- Agency role (super_admin of its own org) AND gets this flag, so it
-- can switch between an Agency Dashboard and a Platform Dashboard
-- without being two different accounts.

-- ---------- 1. The flag itself ----------
alter table profiles add column if not exists is_platform_owner boolean not null default false;

create or replace function public.current_user_is_platform_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_platform_owner from profiles where id = auth.uid()), false);
$$;

grant execute on function public.current_user_is_platform_owner() to authenticated;

-- ---------- 2. Restore this account's Agency ownership ----------
-- migration_018 set role to 'platform_owner' and organization_id to
-- null, which removed its access to the MWM agency dashboard. This
-- puts it back as super_admin of that same organization, in addition
-- to (not instead of) being the platform owner.
update profiles
set role = 'super_admin',
    organization_id = (
      select id from organizations where name = 'Macarthur Web & Marketing Agency' limit 1
    ),
    is_platform_owner = true
where id = (select id from auth.users where email = 'roni.faisal713@gmail.com');

-- ---------- 3. Re-point every platform-level policy at the flag ----------
-- These were written in migration_018 against role = 'platform_owner',
-- which no longer applies to this account (its role is 'super_admin'
-- again). Swap them to check the flag instead.

drop policy if exists "platform_owner_read_agency_requests" on email_change_requests;
create policy "platform_owner_read_agency_requests" on email_change_requests
  for select
  using (
    current_user_is_platform_owner()
    and exists (
      select 1 from profiles p
      where p.id = email_change_requests.user_id
      and p.role in ('super_admin', 'admin')
    )
  );

drop policy if exists "platform_owner_review_agency_requests" on email_change_requests;
create policy "platform_owner_review_agency_requests" on email_change_requests
  for update
  using (
    current_user_is_platform_owner()
    and exists (
      select 1 from profiles p
      where p.id = email_change_requests.user_id
      and p.role in ('super_admin', 'admin')
    )
  )
  with check (
    current_user_is_platform_owner()
    and exists (
      select 1 from profiles p
      where p.id = email_change_requests.user_id
      and p.role in ('super_admin', 'admin')
    )
  );

drop policy if exists "platform_owner_read_all_organizations" on organizations;
create policy "platform_owner_read_all_organizations" on organizations
  for select
  using (current_user_is_platform_owner());

drop policy if exists "platform_owner_read_all_profiles" on profiles;
create policy "platform_owner_read_all_profiles" on profiles
  for select
  using (current_user_is_platform_owner());

drop policy if exists "platform_owner_read_all_clients" on clients;
create policy "platform_owner_read_all_clients" on clients
  for select
  using (current_user_is_platform_owner());
