-- =========================================================
-- MWM Agency OS — Migration 002: Requirements access policy
-- Run this in Supabase SQL Editor AFTER schema.sql
-- =========================================================

-- schema.sql enabled Row Level Security on `requirements` but only added
-- a policy for `clients`. With RLS on and no policy, Postgres denies
-- ALL access by default -- so nobody (not even logged-in users) could
-- read or create requirements yet.
--
-- This is a temporary, permissive policy for the MVP build phase:
-- any authenticated user (client or staff) can read and create
-- requirements. Tighten this once client_users / staff role checks
-- are wired up (e.g. clients should only see their own company's
-- requirements, not everyone's).

create policy "authenticated_read_requirements" on requirements
  for select
  using (auth.role() = 'authenticated');

create policy "authenticated_create_requirements" on requirements
  for insert
  with check (auth.role() = 'authenticated');

create policy "authenticated_update_requirements" on requirements
  for update
  using (auth.role() = 'authenticated');
