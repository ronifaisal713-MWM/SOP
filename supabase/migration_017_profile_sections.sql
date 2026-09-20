-- =========================================================
-- MWM Agency OS — Migration 017: Profile sections (Agency/Staff/Client)
-- Run this in Supabase SQL Editor AFTER migration_016
-- =========================================================

-- ---------- 1. New columns ----------
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists avatar_url text;

alter table organizations add column if not exists logo_url text;
alter table organizations add column if not exists website text;
alter table organizations add column if not exists address text;
alter table organizations add column if not exists phone text;

alter table clients add column if not exists logo_url text;
alter table clients add column if not exists address text;

-- ---------- 2. Storage for avatars/logos ----------
insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do nothing;

create policy "authenticated_upload_profile_images"
on storage.objects for insert
with check (bucket_id = 'profile-images' and auth.role() = 'authenticated');

create policy "public_read_profile_images"
on storage.objects for select
using (bucket_id = 'profile-images');

-- ---------- 3. profiles: let everyone edit their own name/phone/avatar ----------
-- Role and organization_id must NEVER be changeable this way (someone
-- could otherwise promote themselves to super_admin, or hop into
-- another agency's organization) -- the trigger below locks those two
-- columns to their existing value whenever the person updating is the
-- row's own owner, regardless of what the update request contains.
create policy "users_update_own_profile" on profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.enforce_profile_self_update_limits()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.id then
    new.role := old.role;
    new.organization_id := old.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_self_update_limits on profiles;
create trigger trg_enforce_profile_self_update_limits
before update on profiles
for each row execute function public.enforce_profile_self_update_limits();

-- ---------- 4. organizations: this table had NO RLS at all until now ----------
-- (schema.sql created it but never enabled RLS -- meaning any logged-in
-- user, from any agency, could previously read or edit every agency's
-- organization row via a direct API call. Closing that now.)
alter table organizations enable row level security;

create policy "read_own_organization" on organizations
  for select
  using (id = current_user_org_id());

create policy "agency_update_own_organization" on organizations
  for update
  using (id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'))
  with check (id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'));

-- ---------- 5. clients: allow editing (was select-only until now) ----------
create policy "staff_update_own_org_clients" on clients
  for update
  using (current_user_can_access_client(id))
  with check (current_user_can_access_client(id));

create policy "client_update_own_row" on clients
  for update
  using (id = current_user_client_id())
  with check (id = current_user_client_id());
