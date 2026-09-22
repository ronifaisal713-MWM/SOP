-- =========================================================
-- MWM Agency OS — Migration 026: Requirement edit/delete history + file
-- Run this in Supabase SQL Editor AFTER migration_025
-- =========================================================

-- ---------- 1. Soft-delete + file attachment columns ----------
alter table requirements add column if not exists deleted_at timestamptz;
alter table requirements add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table requirements add column if not exists storage_path text;
alter table requirements add column if not exists file_name text;

-- ---------- 2. Clients never see a deleted requirement; staff still do ----------
drop policy if exists "read_requirements" on requirements;
create policy "read_requirements" on requirements
  for select
  using (
    current_user_can_access_client(client_id)
    or (client_id = current_user_client_id() and deleted_at is null)
  );

-- ---------- 3. Split update into staff (can delete) vs client (can edit, never delete) ----------
drop policy if exists "update_requirements" on requirements;

create policy "staff_update_requirements" on requirements
  for update
  using (current_user_can_access_client(client_id))
  with check (current_user_can_access_client(client_id));

create policy "client_edit_own_requirements" on requirements
  for update
  using (client_id = current_user_client_id() and deleted_at is null)
  with check (client_id = current_user_client_id());

-- A client's update request might still carry deleted_at/deleted_by if
-- the client-side code ever sent it (by mistake or otherwise) -- this
-- forces those two columns back to their previous value whenever the
-- person making the change is a client, so only staff/agency can ever
-- actually delete a requirement.
create or replace function public.enforce_client_cannot_delete_requirement()
returns trigger
language plpgsql
as $$
begin
  if current_user_role() in ('client_admin', 'client_user') then
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_client_cannot_delete_requirement on requirements;
create trigger trg_enforce_client_cannot_delete_requirement
before update on requirements
for each row execute function public.enforce_client_cannot_delete_requirement();

-- ---------- 4. Auto-log edits and deletions ----------
create or replace function public.log_requirement_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    insert into activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'Requirement deleted', 'requirement', new.id);
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    old.title is distinct from new.title or
    old.description is distinct from new.description or
    old.category is distinct from new.category or
    old.platform is distinct from new.platform or
    old.priority is distinct from new.priority or
    old.deadline is distinct from new.deadline or
    old.storage_path is distinct from new.storage_path
  ) then
    insert into activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'Requirement details updated', 'requirement', new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_requirement_edit on requirements;
create trigger trg_log_requirement_edit
after update on requirements
for each row execute function public.log_requirement_edit();

-- ---------- 5. Let the Journey timeline read requirement-level history too ----------
-- (migration_020 only added a policy for entity_type = 'task'.)
create policy "read_requirement_activity_log" on activity_log
  for select
  using (
    entity_type = 'requirement'
    and exists (
      select 1 from requirements r
      where r.id = activity_log.entity_id
      and (
        current_user_can_access_client(r.client_id)
        or r.client_id = current_user_client_id()
      )
    )
  );
