-- =========================================================
-- MWM Agency OS — Migration 035: Message reactions
-- Run this in Supabase SQL Editor AFTER migration_034
-- =========================================================
-- Messenger-style emoji reactions on any message, for everyone --
-- staff, agency, and clients alike. One reaction per emoji per person
-- per message (clicking the same one again removes it).

create table if not exists message_reactions (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid references messages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx on message_reactions (message_id);

alter table message_reactions enable row level security;

-- If you can read the message, you can see and add reactions to it.
-- Deliberately leans on the messages table's own RLS rather than
-- re-deriving the visibility rules (which differ per chat type --
-- task/client/personal/internal/staff-DM) a second time here.
create policy "read_message_reactions" on message_reactions
  for select
  using (
    exists (select 1 from messages m where m.id = message_reactions.message_id)
  );

create policy "add_own_message_reactions" on message_reactions
  for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from messages m where m.id = message_reactions.message_id)
  );

create policy "remove_own_message_reactions" on message_reactions
  for delete
  using (user_id = auth.uid());
