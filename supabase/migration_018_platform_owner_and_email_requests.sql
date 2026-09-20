-- =========================================================
-- MWM Agency OS — Migration 018: Platform Owner + Email Change Requests
-- Run this in Supabase SQL Editor AFTER migration_017
--
-- IMPORTANT: run this in TWO STEPS. Postgres doesn't allow a newly
-- added enum value to be used in the same transaction it was created
-- in. Select and run STEP 1 alone first, wait for it to succeed, then
-- select and run STEP 2.
-- =========================================================

-- ============ STEP 1 -- run this alone first ============
alter type user_role add value if not exists 'platform_owner';


-- ============ STEP 2 -- run this after STEP 1 succeeds ============

-- ---------- Helper: get any user's organization (not just your own) ----------
-- current_user_org_id() only ever answers for auth.uid(). Reviewing an
-- email-change request needs to know the REQUESTER's organization, which
-- may be a different person entirely.
create or replace function public.get_user_org_id(target_user_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select organization_id from profiles where id = target_user_id),
    (
      select c.organization_id
      from client_users cu
      join clients c on c.id = cu.client_id
      where cu.id = target_user_id
    )
  );
$$;

grant execute on function public.get_user_org_id(uuid) to authenticated;

-- ---------- email_change_requests ----------
-- Staff/Client email changes are approved by their own agency's
-- Owner/Admin. An Agency Owner/Admin's own email change is approved by
-- the Platform Owner instead -- nobody approves their own request, and
-- an agency can never change a platform-level account's email or vice
-- versa.
create table if not exists email_change_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  current_email text not null,
  requested_email text not null,
  reason text,
  status text not null default 'pending', -- pending | approved | rejected
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

alter table email_change_requests enable row level security;

create policy "user_create_own_email_request" on email_change_requests
  for insert
  with check (user_id = auth.uid());

create policy "user_read_own_email_request" on email_change_requests
  for select
  using (user_id = auth.uid());

create policy "agency_read_org_email_requests" on email_change_requests
  for select
  using (
    current_user_role() in ('super_admin', 'admin')
    and get_user_org_id(user_id) is not null
    and get_user_org_id(user_id) = current_user_org_id()
  );

create policy "agency_review_org_email_requests" on email_change_requests
  for update
  using (
    current_user_role() in ('super_admin', 'admin')
    and get_user_org_id(user_id) = current_user_org_id()
  )
  with check (
    current_user_role() in ('super_admin', 'admin')
    and get_user_org_id(user_id) = current_user_org_id()
  );

create policy "platform_owner_read_agency_requests" on email_change_requests
  for select
  using (
    current_user_role() = 'platform_owner'
    and exists (
      select 1 from profiles p
      where p.id = email_change_requests.user_id
      and p.role in ('super_admin', 'admin')
    )
  );

create policy "platform_owner_review_agency_requests" on email_change_requests
  for update
  using (
    current_user_role() = 'platform_owner'
    and exists (
      select 1 from profiles p
      where p.id = email_change_requests.user_id
      and p.role in ('super_admin', 'admin')
    )
  )
  with check (
    current_user_role() = 'platform_owner'
    and exists (
      select 1 from profiles p
      where p.id = email_change_requests.user_id
      and p.role in ('super_admin', 'admin')
    )
  );

-- ---------- Platform Owner: read-only oversight (never write) ----------
-- Enough for platform-wide counts/stats -- deliberately NOT extended to
-- requirements, tasks, or messages: an agency's actual client work and
-- conversations stay private to that agency, even from the Platform
-- Owner.
create policy "platform_owner_read_all_organizations" on organizations
  for select
  using (current_user_role() = 'platform_owner');

create policy "platform_owner_read_all_profiles" on profiles
  for select
  using (current_user_role() = 'platform_owner');

create policy "platform_owner_read_all_clients" on clients
  for select
  using (current_user_role() = 'platform_owner');

-- ---------- Promote the platform's own account ----------
-- roni.faisal713@gmail.com becomes the one Platform Owner account,
-- overseeing every agency rather than belonging to one.
--
-- NOTE: this account was previously the super_admin (owner) of the
-- "Macarthur Web & Marketing Agency" test organization. After this
-- runs, it can no longer sign in through /login/agency for that
-- org -- only through /login/platform. If you still want an active
-- owner for that agency's data, create a separate account for it
-- (e.g. via /signup with a different email) before or after this.
update profiles
set role = 'platform_owner', organization_id = null
where id = (select id from auth.users where email = 'roni.faisal713@gmail.com');
