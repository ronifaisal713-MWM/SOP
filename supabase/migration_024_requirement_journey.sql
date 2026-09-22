-- =========================================================
-- MWM Agency OS — Migration 024: Requirement journey tracking
-- Run this in Supabase SQL Editor AFTER migration_023
-- =========================================================
-- Auto-stamps the exact moment a requirement gets converted into a
-- task -- the trigger fires the instant a task row referencing it is
-- created, so this never depends on the UI remembering to log it.
-- Combined with the requirement's own created_at and the task's
-- existing status-change history (migration_020), the Requirement
-- detail page can show one continuous timeline: created -> converted
-- to task -> every status change since.

alter table requirements add column if not exists converted_to_task_at timestamptz;

create or replace function public.mark_requirement_converted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update requirements
  set converted_to_task_at = now()
  where id = new.requirement_id
  and converted_to_task_at is null;
  return new;
end;
$$;

drop trigger if exists trg_mark_requirement_converted on tasks;
create trigger trg_mark_requirement_converted
after insert on tasks
for each row execute function public.mark_requirement_converted();
