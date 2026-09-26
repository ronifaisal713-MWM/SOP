-- =========================================================
-- MWM Agency OS — Migration 040: Notify when a document is added
-- Run this in Supabase SQL Editor AFTER migration_039
-- =========================================================
-- Documents attached to a requirement, monthly report, or invoice now
-- notify the people who'd care. Deliberately NOT extended to checklist
-- ticks or timer start/stop -- a task with ten checklist items would
-- bury every genuinely important notification under routine noise.
--
-- Chat attachments are skipped too: those already generate a "New
-- message" notification via the message they're attached to, so
-- notifying again here would double up.

create or replace function public.notify_on_new_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_org_id uuid;
  v_label text;
  v_link text;
  v_uploader uuid;
begin
  v_uploader := coalesce(new.uploaded_by, '00000000-0000-0000-0000-000000000000'::uuid);

  if new.requirement_id is not null then
    select client_id into v_client_id from requirements where id = new.requirement_id;
    v_label := 'requirement';
    v_link := '/dashboard/requirements/' || new.requirement_id;

  elsif new.monthly_report_id is not null then
    select client_id into v_client_id from monthly_reports where id = new.monthly_report_id;
    v_label := 'monthly report';
    v_link := '/dashboard/monthly-reports';

  elsif new.invoice_id is not null then
    select client_id into v_client_id from invoices where id = new.invoice_id;
    v_label := 'invoice';
    v_link := '/dashboard/billing';

  else
    -- Chat attachment (task_id) or unattached -- the message itself
    -- already notifies, so nothing to do here.
    return new;
  end if;

  if v_client_id is null then
    return new;
  end if;

  select organization_id into v_org_id from clients where id = v_client_id;

  -- Agency owners/admins, plus staff assigned to this client.
  insert into notifications (user_id, title, body, link)
  select p.id, 'New document added', coalesce(new.file_name, 'A file') || ' (' || v_label || ')', v_link
  from profiles p
  where p.organization_id = v_org_id
    and p.id <> v_uploader
    and (
      p.role in ('super_admin', 'admin')
      or exists (
        select 1 from client_team_members ctm
        where ctm.client_id = v_client_id and ctm.user_id = p.id
      )
    );

  -- The client's own users.
  insert into notifications (user_id, title, body, link)
  select cu.id, 'New document added', coalesce(new.file_name, 'A file') || ' (' || v_label || ')', v_link
  from client_users cu
  where cu.client_id = v_client_id and cu.id <> v_uploader;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_new_document on files;
create trigger trg_notify_on_new_document
after insert on files
for each row execute function public.notify_on_new_document();
