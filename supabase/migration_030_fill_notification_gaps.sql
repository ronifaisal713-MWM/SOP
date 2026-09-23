-- =========================================================
-- MWM Agency OS — Migration 030: Fill every remaining notification gap
-- Run this in Supabase SQL Editor AFTER migration_029
-- =========================================================
-- Found by auditing every meaningful write in the app for whether it
-- notifies the people it affects. Four real gaps, all fixed here:
--   1. Staff <-> Owner private DM (StaffChat) generated ZERO
--      notifications -- notify_on_new_message bailed out immediately
--      for these messages since they have no client_id/task_id.
--   2. A task's status changing (through the pipeline, or a client's
--      Approve/Request Revision) only ever wrote to activity_log --
--      nobody was actually notified.
--   3. Assigning a staff member to a client (Assign Team) never told
--      that staff member.
--   4. Submitting or reviewing an email change request never notified
--      the reviewer or the requester.

-- ---------- 1. Fix notify_on_new_message: handle StaffChat DMs ----------
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_client_id uuid;
  v_link text;
  v_recipient_link text;
  v_recipient_is_agency boolean;
begin
  -- Staff <-> Agency private DM -- no client or task involved at all,
  -- so this has to be handled before the client_id/task_id derivation
  -- below (which would otherwise bail out with nothing sent).
  if new.client_id is null and new.task_id is null
     and new.organization_id is not null and new.recipient_id is not null then
    select role in ('super_admin', 'admin') into v_recipient_is_agency
    from profiles where id = new.recipient_id;

    insert into notifications (user_id, title, body, link)
    values (
      new.recipient_id,
      'New private message',
      left(coalesce(new.body, ''), 100),
      case when v_recipient_is_agency then '/dashboard/admin/team' else '/dashboard' end
    );
    return new;
  end if;

  if new.client_id is not null then
    v_client_id := new.client_id;
  elsif new.task_id is not null then
    select r.client_id into v_client_id
    from tasks t join requirements r on r.id = t.requirement_id
    where t.id = new.task_id;
  end if;

  if v_client_id is null then
    return new;
  end if;

  select organization_id into v_org_id from clients where id = v_client_id;

  -- Staff/agency land on the task page (task-level) or the client
  -- workspace + auto-open the chat popup, on the right tab (client-level).
  -- Clients land on their dashboard with the chat popup auto-opened.
  if new.task_id is not null then
    v_link := '/dashboard/tasks/' || new.task_id;
  else
    v_link := '/dashboard/clients/' || v_client_id || '?openChat=1&tab=' || new.visibility
      || case when new.recipient_id is not null then '&contact=' || new.recipient_id else '' end;
  end if;

  if new.visibility in ('public', 'client') then
    insert into notifications (user_id, title, body, link)
    select p.id, 'New message', left(coalesce(new.body, ''), 100), v_link
    from profiles p
    where p.organization_id = v_org_id and p.id <> new.sender_id;

    insert into notifications (user_id, title, body, link)
    select cu.id, 'New message', left(coalesce(new.body, ''), 100),
      case when new.task_id is not null then v_link else '/dashboard?openChat=1&tab=public' end
    from client_users cu
    where cu.client_id = v_client_id and cu.id <> new.sender_id;

  elsif new.visibility = 'personal' then
    if new.recipient_id is not null and new.recipient_id <> new.sender_id then
      if exists (select 1 from profiles p where p.id = new.recipient_id) then
        v_recipient_link := v_link;
      else
        v_recipient_link := '/dashboard?openChat=1&tab=personal';
      end if;

      insert into notifications (user_id, title, body, link)
      values (new.recipient_id, 'New personal message', left(coalesce(new.body, ''), 100), v_recipient_link);
    end if;

    insert into notifications (user_id, title, body, link)
    select p.id, 'New personal message', left(coalesce(new.body, ''), 100), v_link
    from profiles p
    where p.organization_id = v_org_id
      and p.role in ('super_admin', 'admin')
      and p.id <> new.sender_id;

  elsif new.visibility = 'internal' then
    insert into notifications (user_id, title, body, link)
    select p.id, 'New internal note', left(coalesce(new.body, ''), 100), v_link
    from profiles p
    where p.organization_id = v_org_id and p.id <> new.sender_id;
  end if;

  return new;
end;
$$;

-- ---------- 2. Task status change -> notify assignees + client ----------
create or replace function public.notify_on_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
    return new;
  end if;

  select r.client_id into v_client_id from requirements r where r.id = new.requirement_id;

  -- Everyone currently assigned to this task (excluding whoever made
  -- the change).
  insert into notifications (user_id, title, body, link)
  select ta.user_id, 'Task status updated', new.title || ' -> ' || new.status, '/dashboard/tasks/' || new.id
  from task_assignees ta
  where ta.task_id = new.id and ta.user_id is distinct from auth.uid();

  -- The client, if there is one.
  if v_client_id is not null then
    insert into notifications (user_id, title, body, link)
    select cu.id, 'Task status updated', new.title || ' -> ' || new.status, '/dashboard/tasks/' || new.id
    from client_users cu
    where cu.client_id = v_client_id and cu.id is distinct from auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_task_status_change on tasks;
create trigger trg_notify_on_task_status_change
after update on tasks
for each row execute function public.notify_on_task_status_change();

-- ---------- 3. Assigned to a client -> notify that staff member ----------
create or replace function public.notify_on_client_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text;
begin
  select company_name into v_company_name from clients where id = new.client_id;

  insert into notifications (user_id, title, body, link)
  values (
    new.user_id,
    'You were assigned to a client',
    coalesce(v_company_name, 'A client'),
    '/dashboard/clients/' || new.client_id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_client_assignment on client_team_members;
create trigger trg_notify_on_client_assignment
after insert on client_team_members
for each row execute function public.notify_on_client_assignment();

-- ---------- 4a. Email change request submitted -> notify the reviewer(s) ----------
create or replace function public.notify_on_email_change_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_role text;
  v_org_id uuid;
begin
  select role, organization_id into v_requester_role, v_org_id
  from profiles where id = new.user_id;

  if v_requester_role in ('super_admin', 'admin') then
    -- An Agency owner/admin's own request goes to the Platform Owner(s).
    insert into notifications (user_id, title, body, link)
    select id, 'Email change request', new.current_email || ' -> ' || new.requested_email,
      '/dashboard/platform/email-requests'
    from profiles where is_platform_owner = true;
  else
    -- Staff/Client -- resolve their org (staff via profiles directly;
    -- client via client_users -> clients).
    if v_org_id is null then
      select c.organization_id into v_org_id
      from client_users cu join clients c on c.id = cu.client_id
      where cu.id = new.user_id;
    end if;

    insert into notifications (user_id, title, body, link)
    select id, 'Email change request', new.current_email || ' -> ' || new.requested_email,
      '/dashboard/admin/email-requests'
    from profiles
    where organization_id = v_org_id and role in ('super_admin', 'admin');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_email_change_request on email_change_requests;
create trigger trg_notify_on_email_change_request
after insert on email_change_requests
for each row execute function public.notify_on_email_change_request();

-- ---------- 4b. Email change request reviewed -> notify the requester ----------
create or replace function public.notify_on_email_change_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    insert into notifications (user_id, title, body, link)
    values (new.user_id, 'Email change ' || new.status, new.requested_email, '/dashboard/profile');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_email_change_reviewed on email_change_requests;
create trigger trg_notify_on_email_change_reviewed
after update on email_change_requests
for each row execute function public.notify_on_email_change_reviewed();
