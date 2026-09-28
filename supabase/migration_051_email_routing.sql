-- =========================================================
-- MWM Agency OS — Migration 051: Email notification routing
-- Run this in Supabase SQL Editor AFTER migration_050
-- =========================================================
-- Lets the agency owner decide, per event, who gets an email --
-- rather than the app deciding for them.
--
-- Deliberately separate from in-app notifications, which stay as they
-- are: email is for things worth interrupting someone's inbox over,
-- and the right answer differs per agency. Everything defaults to a
-- conservative setting; nothing is emailed until it's switched on.

create table if not exists email_notification_rules (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  event_key text not null,
  -- off       -- no email for this event
  -- owner     -- super_admin only
  -- admins    -- super_admin + admin
  -- approvers -- super_admin, admin, project_manager, team_lead
  -- specific  -- exactly the people in recipient_ids
  recipient_mode text not null default 'off'
    check (recipient_mode in ('off', 'owner', 'admins', 'approvers', 'specific')),
  recipient_ids uuid[] not null default '{}',
  updated_at timestamptz default now(),
  unique (organization_id, event_key)
);

alter table email_notification_rules enable row level security;

create policy "org_read_email_rules" on email_notification_rules
  for select using (organization_id = current_user_org_id());

create policy "admin_manage_email_rules" on email_notification_rules
  for all
  using (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'))
  with check (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'));

-- Resolve an event to a concrete list of email addresses. Kept in SQL
-- so the sending path can't disagree with what the settings page
-- shows.
create or replace function public.resolve_email_recipients(
  p_org_id uuid,
  p_event_key text,
  p_exclude_user uuid default null
)
returns table (user_id uuid, email text, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_ids uuid[];
begin
  select recipient_mode, recipient_ids into v_mode, v_ids
  from email_notification_rules
  where organization_id = p_org_id and event_key = p_event_key;

  -- No rule configured, or explicitly off -- send nothing. Silence is
  -- the safe default for email.
  if v_mode is null or v_mode = 'off' then
    return;
  end if;

  return query
  select p.id, u.email::text, p.full_name
  from profiles p
  join auth.users u on u.id = p.id
  where p.organization_id = p_org_id
    and (p_exclude_user is null or p.id <> p_exclude_user)
    and u.email is not null
    and (
      (v_mode = 'owner' and p.role = 'super_admin')
      or (v_mode = 'admins' and p.role in ('super_admin', 'admin'))
      or (v_mode = 'approvers' and p.role in ('super_admin', 'admin', 'project_manager', 'team_lead'))
      or (v_mode = 'specific' and p.id = any(v_ids))
    );
end;
$$;

-- Outbox rather than calling the mail provider straight from the
-- trigger: a slow or failing provider must never block the write that
-- caused it, and a failed send needs somewhere to be retried from.
create table if not exists email_outbox (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  to_email text not null,
  to_name text,
  subject text not null,
  body_html text not null,
  event_key text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  attempts int not null default 0,
  created_at timestamptz default now(),
  sent_at timestamptz
);

create index if not exists email_outbox_pending_idx on email_outbox (status, created_at);

alter table email_outbox enable row level security;

-- Nobody reads this through the app; the sender uses the service-role
-- key, which bypasses RLS. Admins can look at it for troubleshooting.
create policy "admin_read_email_outbox" on email_outbox
  for select
  using (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'));

-- ---------- Queue an email when leave is requested ----------
create or replace function public.queue_leave_request_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester text;
  v_type text;
  v_app_url text := 'https://sop-mwm6.vercel.app';
  r record;
begin
  select full_name into v_requester from profiles where id = new.user_id;
  select name into v_type from leave_types where id = new.leave_type_id;

  for r in
    select * from resolve_email_recipients(new.organization_id, 'leave_request', new.user_id)
  loop
    insert into email_outbox (organization_id, to_email, to_name, subject, body_html, event_key)
    values (
      new.organization_id,
      r.email,
      r.full_name,
      'Leave request — ' || coalesce(v_requester, 'A team member'),
      '<p>' || coalesce(v_requester, 'A team member') || ' has requested '
        || coalesce(v_type, 'leave') || '.</p>'
        || '<p><strong>Dates:</strong> ' || new.start_date
        || case when new.end_date <> new.start_date then ' &rarr; ' || new.end_date else '' end
        || ' (' || new.days || ' day' || case when new.days = 1 then '' else 's' end || ')</p>'
        || case when new.reason is not null
             then '<p><strong>Reason:</strong> ' || new.reason || '</p>' else '' end
        || '<p><a href="' || v_app_url || '/dashboard/leave/manage">Review this request</a></p>',
      'leave_request'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_queue_leave_request_email on leave_requests;
create trigger trg_queue_leave_request_email
after insert on leave_requests
for each row execute function public.queue_leave_request_email();

-- ---------- Queue an email when leave is decided ----------
create or replace function public.queue_leave_reviewed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_type text;
  v_mode text;
  v_app_url text := 'https://sop-mwm6.vercel.app';
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  -- This one always goes to the requester if the event is enabled at
  -- all -- "who to notify" isn't a meaningful choice here.
  select recipient_mode into v_mode
  from email_notification_rules
  where organization_id = new.organization_id and event_key = 'leave_reviewed';

  if v_mode is null or v_mode = 'off' then
    return new;
  end if;

  select u.email::text, p.full_name into v_email, v_name
  from profiles p join auth.users u on u.id = p.id
  where p.id = new.user_id;

  if v_email is null then
    return new;
  end if;

  select name into v_type from leave_types where id = new.leave_type_id;

  insert into email_outbox (organization_id, to_email, to_name, subject, body_html, event_key)
  values (
    new.organization_id,
    v_email,
    v_name,
    'Your leave request was ' || new.status,
    '<p>Your ' || coalesce(v_type, 'leave') || ' request for <strong>' || new.start_date
      || case when new.end_date <> new.start_date then ' &rarr; ' || new.end_date else '' end
      || '</strong> was <strong>' || new.status || '</strong>.</p>'
      || case when new.review_note is not null
           then '<p><strong>Note:</strong> ' || new.review_note || '</p>' else '' end
      || '<p><a href="' || v_app_url || '/dashboard/leave">View your leave</a></p>',
    'leave_reviewed'
  );

  return new;
end;
$$;

drop trigger if exists trg_queue_leave_reviewed_email on leave_requests;
create trigger trg_queue_leave_reviewed_email
after update of status on leave_requests
for each row execute function public.queue_leave_reviewed_email();

-- ---------- Queue an email for a new client requirement ----------
create or replace function public.queue_new_requirement_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_client text;
  v_app_url text := 'https://sop-mwm6.vercel.app';
  r record;
begin
  if new.client_id is not null then
    select organization_id, company_name into v_org_id, v_client
    from clients where id = new.client_id;
  else
    v_org_id := new.organization_id;
    v_client := 'Internal';
  end if;

  if v_org_id is null then
    return new;
  end if;

  for r in
    select * from resolve_email_recipients(v_org_id, 'new_requirement', new.created_by)
  loop
    insert into email_outbox (organization_id, to_email, to_name, subject, body_html, event_key)
    values (
      v_org_id,
      r.email,
      r.full_name,
      'New requirement — ' || coalesce(v_client, 'a client'),
      '<p><strong>' || new.title || '</strong></p>'
        || '<p>From: ' || coalesce(v_client, 'a client') || '</p>'
        || case when new.deadline is not null
             then '<p>Deadline: ' || new.deadline || '</p>' else '' end
        || '<p><a href="' || v_app_url || '/dashboard/requirements/' || new.id
        || '">Open requirement</a></p>',
      'new_requirement'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_queue_new_requirement_email on requirements;
create trigger trg_queue_new_requirement_email
after insert on requirements
for each row execute function public.queue_new_requirement_email();

-- ---------- Queue an email when a client approves or asks for changes ----------
create or replace function public.queue_client_decision_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_client_id uuid;
  v_client text;
  v_app_url text := 'https://sop-mwm6.vercel.app';
  r record;
begin
  if new.status not in ('approved', 'revision') or old.status = new.status then
    return new;
  end if;

  select req.client_id, req.organization_id into v_client_id, v_org_id
  from requirements req where req.id = new.requirement_id;

  if v_client_id is not null then
    select organization_id, company_name into v_org_id, v_client
    from clients where id = v_client_id;
  end if;

  if v_org_id is null then
    return new;
  end if;

  for r in
    select * from resolve_email_recipients(v_org_id, 'client_decision', new.last_changed_by)
  loop
    insert into email_outbox (organization_id, to_email, to_name, subject, body_html, event_key)
    values (
      v_org_id,
      r.email,
      r.full_name,
      case when new.status = 'approved'
        then 'Client approved: ' || new.title
        else 'Revision requested: ' || new.title end,
      '<p><strong>' || new.title || '</strong></p>'
        || '<p>' || coalesce(v_client, 'The client') || ' has '
        || case when new.status = 'approved' then 'approved this work.'
                else 'requested changes.' end || '</p>'
        || '<p><a href="' || v_app_url || '/dashboard/tasks/' || new.id || '">Open task</a></p>',
      'client_decision'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_queue_client_decision_email on tasks;
create trigger trg_queue_client_decision_email
after update of status on tasks
for each row execute function public.queue_client_decision_email();

-- ---------- Seed sensible defaults ----------
-- Leave requests default to the people who can actually action them;
-- everything else starts off, so nobody is surprised by email they
-- didn't ask for.
insert into email_notification_rules (organization_id, event_key, recipient_mode)
select o.id, e.key, e.mode
from organizations o
cross join (values
  ('leave_request', 'approvers'),
  ('leave_reviewed', 'owner'),
  ('new_requirement', 'off'),
  ('client_decision', 'off')
) as e(key, mode)
on conflict (organization_id, event_key) do nothing;
