-- =========================================================
-- MWM Agency OS — Migration 013: Owner <-> Staff private messages
-- Run this in Supabase SQL Editor AFTER migration_012
-- =========================================================
-- A new kind of message: a private 1-to-1 thread between the Agency
-- (super_admin/admin) and one specific staff member -- not tied to any
-- client or task. Only the Agency side can START a thread with anyone
-- in their org; a staff member can only ever message an Agency member
-- back (never another staff member) -- there's no staff-to-staff DM.

alter table messages add column if not exists organization_id uuid references organizations(id);

create policy "read_staff_personal_messages" on messages
  for select
  using (
    organization_id is not null
    and task_id is null
    and client_id is null
    and (sender_id = auth.uid() or recipient_id = auth.uid())
  );

create policy "create_staff_personal_messages" on messages
  for insert
  with check (
    organization_id is not null
    and task_id is null
    and client_id is null
    and recipient_id is not null
    and sender_id = auth.uid()
    and organization_id = current_user_org_id()
    and (
      current_user_role() in ('super_admin', 'admin')
      or exists (
        select 1 from profiles p
        where p.id = recipient_id and p.role in ('super_admin', 'admin')
      )
    )
  );
