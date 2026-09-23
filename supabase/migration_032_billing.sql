-- =========================================================
-- MWM Agency OS — Migration 032: Billing (send-only, no online payment)
-- Run this in Supabase SQL Editor AFTER migration_031
-- =========================================================
-- The `invoices` table has existed since schema.sql but was never
-- fully wired up (schema.sql's own comment even flags its policy as a
-- placeholder "TODO: replace before going live"). This finishes it:
-- Staff/Agency create and send a bill; the client sees it and can
-- download an attached file if there is one. Nothing here processes
-- payment -- marking "Paid" is a manual action once the agency
-- receives payment by whatever means outside the app.

alter table invoices add column if not exists description text;
alter table invoices add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table invoices add column if not exists paid_at timestamptz;
alter table invoices add column if not exists paid_by uuid references auth.users(id) on delete set null;
alter table invoices add column if not exists deleted_at timestamptz;
alter table invoices add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- Let DocumentsManager attach files to an invoice the same way it
-- already does for requirements and monthly reports.
alter table files add column if not exists invoice_id uuid references invoices(id) on delete cascade;

-- Replace schema.sql's placeholder policy set with the real
-- multi-tenant-aware ones used everywhere else in the app.
drop policy if exists "staff_full_access_clients" on invoices;

create policy "staff_manage_invoices" on invoices
  for all
  using (current_user_can_access_client(client_id))
  with check (current_user_can_access_client(client_id));

create policy "client_read_own_invoices" on invoices
  for select
  using (client_id = current_user_client_id() and deleted_at is null);

-- Files attached to an invoice: same read/manage shape as the
-- requirement/monthly-report cases already covered by migration_027's
-- scoped_read_files / scoped_insert_files / scoped_delete_files --
-- those need the invoice_id branch added.
drop policy if exists "authenticated_read_files" on files;
drop policy if exists "scoped_read_files" on files;
create policy "scoped_read_files" on files
  for select
  using (
    (
      task_id is not null and exists (
        select 1 from tasks t
        join requirements r on r.id = t.requirement_id
        where t.id = files.task_id
        and (current_user_can_access_client(r.client_id) or r.client_id = current_user_client_id())
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
        and (current_user_can_access_client(mr.client_id) or mr.client_id = current_user_client_id())
      )
    )
    or (
      invoice_id is not null and exists (
        select 1 from invoices i
        where i.id = files.invoice_id
        and (current_user_can_access_client(i.client_id) or i.client_id = current_user_client_id())
      )
    )
    or uploaded_by = auth.uid()
    or (task_id is null and requirement_id is null and monthly_report_id is null and invoice_id is null)
  );

drop policy if exists "authenticated_insert_files" on files;
drop policy if exists "scoped_insert_files" on files;
create policy "scoped_insert_files" on files
  for insert
  with check (
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
    or (
      invoice_id is not null and exists (
        select 1 from invoices i
        where i.id = files.invoice_id
        and current_user_can_access_client(i.client_id)
      )
    )
    or (task_id is null and requirement_id is null and monthly_report_id is null and invoice_id is null)
  );

drop policy if exists "scoped_delete_files" on files;
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
    or (
      invoice_id is not null and exists (
        select 1 from invoices i
        where i.id = files.invoice_id
        and current_user_can_access_client(i.client_id)
      )
    )
    or uploaded_by = auth.uid()
  );

-- Notify the client the moment a bill is sent to them.
create or replace function public.notify_on_new_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, title, body, link)
  select cu.id, 'New invoice', coalesce(new.period, new.invoice_number, 'A new bill'), '/dashboard/billing'
  from client_users cu
  where cu.client_id = new.client_id;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_new_invoice on invoices;
create trigger trg_notify_on_new_invoice
after insert on invoices
for each row execute function public.notify_on_new_invoice();
