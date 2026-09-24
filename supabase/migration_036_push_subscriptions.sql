-- =========================================================
-- MWM Agency OS — Migration 036: Push notification subscriptions
-- Run this in Supabase SQL Editor AFTER migration_035
-- =========================================================
-- Stores each device's Web Push subscription so the server can send a
-- notification even when the app is closed. One person can have
-- several (phone, laptop, etc.), keyed by the endpoint URL the browser
-- generates.

create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- A person only ever sees or manages their own device registrations.
-- The server sends pushes with the service-role key, which bypasses
-- RLS, so it can read everyone's.
create policy "manage_own_push_subscriptions" on push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
