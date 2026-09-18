-- =========================================================
-- MWM Agency OS — Migration 009: Client task approval actions
-- Run this in Supabase SQL Editor AFTER migration_008
-- =========================================================

-- Lets a client move their OWN task out of 'client_review' by either
-- approving it or sending it back for revision -- but nothing else.
-- The `with check` clause is what actually enforces "only to these two
-- statuses"; the UI only showing these two buttons is not enough on
-- its own (a client could otherwise call the API directly).
create policy "client_update_own_task_status" on tasks
  for update
  using (
    exists (
      select 1 from requirements r
      join clients c on c.id = r.client_id
      where r.id = tasks.requirement_id
      and c.id = current_user_client_id()
    )
  )
  with check (
    exists (
      select 1 from requirements r
      join clients c on c.id = r.client_id
      where r.id = tasks.requirement_id
      and c.id = current_user_client_id()
    )
    and status in ('approved', 'revision')
  );

-- approvals table: was RLS-enabled with no policy (blocked everything).
create policy "staff_org_access_approvals" on approvals
  for all
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      join clients c on c.id = r.client_id
      where t.id = approvals.task_id
      and current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
      and c.organization_id = current_user_org_id()
    )
  )
  with check (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      join clients c on c.id = r.client_id
      where t.id = approvals.task_id
      and current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
      and c.organization_id = current_user_org_id()
    )
  );

create policy "client_own_task_approvals" on approvals
  for all
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      join clients c on c.id = r.client_id
      where t.id = approvals.task_id
      and c.id = current_user_client_id()
    )
  )
  with check (
    approved_by = auth.uid()
    and exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      join clients c on c.id = r.client_id
      where t.id = approvals.task_id
      and c.id = current_user_client_id()
    )
  );
