-- =========================================================
-- MWM Agency OS — Migration 023: Client social media links
-- Run this in Supabase SQL Editor AFTER migration_022
-- =========================================================
-- A client can have any number of social links, each with its own
-- platform name -- including a custom one, not just a fixed list like
-- Facebook/Instagram. Either the client themselves or Staff/Agency
-- with access to that client can add, edit, or remove these -- so if
-- the client never gets around to it, the agency can fill it in for
-- them (and vice versa).

create table if not exists client_social_links (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  platform text not null,
  url text not null,
  created_at timestamptz default now()
);

alter table client_social_links enable row level security;

create policy "read_client_social_links" on client_social_links
  for select
  using (
    current_user_can_access_client(client_id)
    or client_id = current_user_client_id()
  );

create policy "manage_client_social_links" on client_social_links
  for all
  using (
    current_user_can_access_client(client_id)
    or client_id = current_user_client_id()
  )
  with check (
    current_user_can_access_client(client_id)
    or client_id = current_user_client_id()
  );
