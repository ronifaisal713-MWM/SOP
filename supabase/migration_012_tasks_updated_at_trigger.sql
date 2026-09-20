-- =========================================================
-- MWM Agency OS — Migration 012: Auto-maintain tasks.updated_at
-- Run this in Supabase SQL Editor AFTER migration_011
-- =========================================================

-- tasks.updated_at has existed since schema.sql, but nothing was ever
-- setting it on an update -- every status change left it frozen at the
-- task's creation time. Reports need a real "when did this last change"
-- timestamp (e.g. "completed this month" = status = 'done' AND recently
-- updated), so this trigger keeps it honest from now on.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_set_updated_at on tasks;
create trigger trg_tasks_set_updated_at
before update on tasks
for each row execute function public.set_updated_at();
