-- =========================================================
-- MWM Agency OS — Migration 003: Owner profile + profiles RLS
-- Run this in Supabase SQL Editor AFTER migration_002
-- =========================================================

-- Mark the software owner as super_admin. This matches the existing
-- auth.users row for this email (already created earlier via
-- Authentication -> Users -> Add user) and gives/updates their profile.
insert into profiles (id, full_name, role)
select id, 'Roni Faisal', 'super_admin'
from auth.users
where email = 'roni.faisal713@gmail.com'
on conflict (id) do update set role = 'super_admin';

-- schema.sql didn't enable RLS on `profiles`, which means (without RLS)
-- Postgres applies no restriction at all -- any authenticated request
-- could read every user's role/name. Lock it down: everyone can read
-- their own profile (this is what the app uses to check "am I admin?").
alter table profiles enable row level security;

create policy "users_read_own_profile" on profiles
  for select
  using (auth.uid() = id);

-- Note: broader "staff can see everyone's profile" access will be added
-- later via a safer (non-recursive) method -- e.g. a security-definer
-- function -- once a staff directory screen is actually built.
