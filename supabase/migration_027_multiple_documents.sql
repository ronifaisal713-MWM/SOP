-- =========================================================
-- MWM Agency OS — Migration 027: Multiple documents (max 10) per entity
-- Run this in Supabase SQL Editor AFTER migration_026
-- =========================================================
-- Requirements and Monthly Reports each only supported ONE attached
-- file (storage_path/file_name columns directly on the table). This
-- turns the existing `files` table into a proper multi-attachment
-- store instead -- any number of files per requirement or report (the
-- UI enforces a max of 10), each independently removable.

alter table files add column if not exists requirement_id uuid references requirements(id) on delete cascade;
alter table files add column if not exists monthly_report_id uuid references monthly_reports(id) on delete cascade;

-- files had insert/select policies from migration_008 but no delete
-- policy at all -- needed now that individual documents can be
-- removed. Scoped to whoever can actually access the parent task,
-- requirement, or monthly report -- not just "any logged-in user",
-- which would let someone from a different agency entirely delete
-- another agency's files.
create policy "scoped_delete_files" on files
  for delete
  using (
    (
      task_id is not null and exists (
        select 1 from tasks t
        join requirements r on r.id = t.requirement_id
        where t.id = files.task_id
        and current_user_can_access_client(r.client_id)
      )
    )
    or (
      requirement_id is not null and exists (
        select 1 from requirements r
        where r.id = files.requirement_id
        and (current_user_can_access_client(r.client_id) or r.client_id = current_user_client_id())
      )
    )
    or (
      monthly_report_id is not null and exists (
        select 1 from monthly_reports mr
        where mr.id = files.monthly_report_id
        and current_user_can_access_client(mr.client_id)
      )
    )
    or uploaded_by = auth.uid()
  );

-- Carry over whatever was already attached via the old single-file
-- columns, so nothing already uploaded disappears.
insert into files (requirement_id, storage_path, file_name, uploaded_by, visibility)
select id, storage_path, file_name, created_by, 'client'
from requirements
where storage_path is not null;

insert into files (monthly_report_id, storage_path, file_name, uploaded_by, visibility)
select id, storage_path, file_name, created_by, 'client'
from monthly_reports
where storage_path is not null;
