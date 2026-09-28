-- =========================================================
-- MWM Agency OS — Migration 049: Leave Management
-- Run this in Supabase SQL Editor AFTER migration_048
-- =========================================================
-- Modelled on how established HR systems handle leave, with the parts
-- that matter for correctness rather than just a request form:
--
--   * Leave TYPES are data, not hardcoded -- the agency adds its own.
--   * WEEKEND days are configurable per agency (Fri+Sat here, Sat+Sun
--     elsewhere) rather than assumed.
--   * HOLIDAYS are excluded from leave day counts automatically, so a
--     week containing a public holiday doesn't wrongly cost 5 days.
--   * BALANCES are backed by a LEDGER -- every accrual and deduction
--     is a row, so a disputed balance can be traced instead of being
--     a single number nobody can explain.
--   * Overlapping requests are rejected in the database, not just the
--     UI, so a double-booked day can't slip through.

-- ---------- 1. Per-agency leave settings ----------
create table if not exists leave_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  -- ISO day numbers: 0=Sunday ... 6=Saturday. Default Fri+Sat.
  weekend_days int[] not null default '{5,6}',
  year_start_month int not null default 1 check (year_start_month between 1 and 12),
  allow_negative_balance boolean not null default false,
  updated_at timestamptz default now()
);

-- ---------- 2. Leave types (agency-defined) ----------
create table if not exists leave_types (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  default_days numeric(5,1) not null default 0,
  is_paid boolean not null default true,
  color text default '#1F4E79',
  requires_note boolean not null default false,
  is_active boolean not null default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  unique (organization_id, name)
);

-- ---------- 3. Public / agency holidays ----------
create table if not exists holidays (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (organization_id, holiday_date)
);

create index if not exists holidays_org_date_idx on holidays (organization_id, holiday_date);

-- ---------- 4. Balances + ledger ----------
create table if not exists leave_balances (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  leave_type_id uuid references leave_types(id) on delete cascade,
  year int not null,
  entitled numeric(5,1) not null default 0,
  used numeric(5,1) not null default 0,
  carried_forward numeric(5,1) not null default 0,
  updated_at timestamptz default now(),
  unique (user_id, leave_type_id, year)
);

-- Every change to a balance lands here. Without this, a balance is a
-- number nobody can explain when it's questioned.
create table if not exists leave_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  leave_type_id uuid references leave_types(id) on delete cascade,
  year int not null,
  change numeric(5,1) not null,
  reason text not null,
  leave_request_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists leave_ledger_user_idx on leave_ledger (user_id, year);

-- ---------- 5. Requests ----------
create table if not exists leave_requests (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  leave_type_id uuid references leave_types(id) on delete set null,
  start_date date not null,
  end_date date not null,
  -- Half days only make sense on a single-date request.
  is_half_day boolean not null default false,
  half_day_period text check (half_day_period in ('first', 'second')),
  days numeric(5,1) not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz default now(),
  check (end_date >= start_date),
  check (not is_half_day or start_date = end_date)
);

create index if not exists leave_requests_user_idx on leave_requests (user_id, start_date);
create index if not exists leave_requests_org_status_idx on leave_requests (organization_id, status);

-- ---------- 6. Working-day calculation ----------
-- Lives in SQL so the stored day count can't disagree with what the
-- UI showed -- the number that gets deducted is computed here.
create or replace function public.count_working_days(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_weekend int[];
  v_days numeric := 0;
  d date;
begin
  select weekend_days into v_weekend from leave_settings where organization_id = p_org_id;
  if v_weekend is null then
    v_weekend := '{5,6}';
  end if;

  d := p_start;
  while d <= p_end loop
    if not (extract(dow from d)::int = any(v_weekend))
       and not exists (
         select 1 from holidays h
         where h.organization_id = p_org_id and h.holiday_date = d
       )
    then
      v_days := v_days + 1;
    end if;
    d := d + 1;
  end loop;

  return v_days;
end;
$$;

-- ---------- 7. Stamp the day count + block overlaps ----------
create or replace function public.prepare_leave_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days numeric;
begin
  -- Always recompute rather than trusting a client-supplied number.
  v_days := count_working_days(new.organization_id, new.start_date, new.end_date);
  if new.is_half_day then
    v_days := least(v_days, 1) * 0.5;
  end if;
  new.days := v_days;

  if v_days <= 0 then
    raise exception 'Those dates contain no working days (weekend or holiday).';
  end if;

  -- An overlapping request for the same person is almost always a
  -- mistake, and double-deducts their balance if it goes through.
  if exists (
    select 1 from leave_requests lr
    where lr.user_id = new.user_id
      and lr.id is distinct from new.id
      and lr.status in ('pending', 'approved')
      and lr.start_date <= new.end_date
      and lr.end_date >= new.start_date
  ) then
    raise exception 'You already have a leave request covering those dates.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prepare_leave_request on leave_requests;
create trigger trg_prepare_leave_request
before insert or update of start_date, end_date, is_half_day on leave_requests
for each row execute function public.prepare_leave_request();

-- ---------- 8. Apply the balance change on approval ----------
create or replace function public.apply_leave_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
begin
  v_year := extract(year from new.start_date)::int;

  -- Approved: deduct.
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into leave_balances (user_id, leave_type_id, year, used)
    values (new.user_id, new.leave_type_id, v_year, new.days)
    on conflict (user_id, leave_type_id, year)
    do update set used = leave_balances.used + new.days, updated_at = now();

    insert into leave_ledger (user_id, leave_type_id, year, change, reason, leave_request_id, created_by)
    values (new.user_id, new.leave_type_id, v_year, -new.days, 'Leave approved', new.id, auth.uid());

  -- Was approved, now isn't (cancelled or reversed): give it back.
  elsif old.status = 'approved' and new.status in ('cancelled', 'rejected') then
    update leave_balances
    set used = greatest(0, used - old.days), updated_at = now()
    where user_id = new.user_id and leave_type_id = new.leave_type_id and year = v_year;

    insert into leave_ledger (user_id, leave_type_id, year, change, reason, leave_request_id, created_by)
    values (new.user_id, new.leave_type_id, v_year, old.days, 'Leave ' || new.status, new.id, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_leave_balance on leave_requests;
create trigger trg_apply_leave_balance
after update of status on leave_requests
for each row execute function public.apply_leave_balance();

-- ---------- 9. Notifications ----------
create or replace function public.notify_on_leave_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select full_name into v_name from profiles where id = new.user_id;

  -- Approvers: owners/admins plus PMs and team leads.
  insert into notifications (user_id, title, body, link)
  select p.id, 'Leave request', coalesce(v_name, 'Someone') || ' — ' || new.start_date || ' to ' || new.end_date,
    '/dashboard/leave/manage'
  from profiles p
  where p.organization_id = new.organization_id
    and p.role in ('super_admin', 'admin', 'project_manager', 'team_lead')
    and p.id is distinct from new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_leave_request on leave_requests;
create trigger trg_notify_on_leave_request
after insert on leave_requests
for each row execute function public.notify_on_leave_request();

create or replace function public.notify_on_leave_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    insert into notifications (user_id, title, body, link)
    values (
      new.user_id,
      'Leave ' || new.status,
      new.start_date || ' to ' || new.end_date ||
        case when new.review_note is not null then ' — ' || new.review_note else '' end,
      '/dashboard/leave'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_leave_reviewed on leave_requests;
create trigger trg_notify_on_leave_reviewed
after update of status on leave_requests
for each row execute function public.notify_on_leave_reviewed();

-- A holiday affects everyone's plans, so announce it.
create or replace function public.notify_on_new_holiday()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, title, body, link)
  select p.id, 'Holiday added', new.name || ' — ' || new.holiday_date, '/dashboard/leave'
  from profiles p
  where p.organization_id = new.organization_id
    and p.id is distinct from new.created_by;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_new_holiday on holidays;
create trigger trg_notify_on_new_holiday
after insert on holidays
for each row execute function public.notify_on_new_holiday();

-- ---------- 10. RLS ----------
alter table leave_settings enable row level security;
alter table leave_types enable row level security;
alter table holidays enable row level security;
alter table leave_balances enable row level security;
alter table leave_ledger enable row level security;
alter table leave_requests enable row level security;

-- Settings / types / holidays: everyone in the agency reads, only
-- owners and admins change.
create policy "org_read_leave_settings" on leave_settings
  for select using (organization_id = current_user_org_id());
create policy "admin_manage_leave_settings" on leave_settings
  for all
  using (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'))
  with check (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'));

create policy "org_read_leave_types" on leave_types
  for select using (organization_id = current_user_org_id());
create policy "admin_manage_leave_types" on leave_types
  for all
  using (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'))
  with check (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'));

create policy "org_read_holidays" on holidays
  for select using (organization_id = current_user_org_id());
create policy "admin_manage_holidays" on holidays
  for all
  using (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'))
  with check (organization_id = current_user_org_id() and current_user_role() in ('super_admin', 'admin'));

-- Balances: your own, or anyone's if you approve leave.
create policy "read_leave_balances" on leave_balances
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from profiles me, profiles them
      where me.id = auth.uid()
        and them.id = leave_balances.user_id
        and me.organization_id = them.organization_id
        and me.role in ('super_admin', 'admin', 'project_manager', 'team_lead')
    )
  );
create policy "admin_manage_leave_balances" on leave_balances
  for all
  using (current_user_role() in ('super_admin', 'admin'))
  with check (current_user_role() in ('super_admin', 'admin'));

create policy "read_leave_ledger" on leave_ledger
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from profiles me, profiles them
      where me.id = auth.uid()
        and them.id = leave_ledger.user_id
        and me.organization_id = them.organization_id
        and me.role in ('super_admin', 'admin', 'project_manager', 'team_lead')
    )
  );

-- Requests: yours, or your agency's if you're an approver.
create policy "read_leave_requests" on leave_requests
  for select
  using (
    user_id = auth.uid()
    or (
      organization_id = current_user_org_id()
      and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead')
    )
  );

create policy "create_own_leave_request" on leave_requests
  for insert
  with check (user_id = auth.uid() and organization_id = current_user_org_id());

-- The requester can cancel; approvers can decide. Both go through
-- UPDATE, so the column-level guard below keeps them apart.
create policy "update_leave_requests" on leave_requests
  for update
  using (
    user_id = auth.uid()
    or (
      organization_id = current_user_org_id()
      and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead')
    )
  )
  with check (
    user_id = auth.uid()
    or (
      organization_id = current_user_org_id()
      and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead')
    )
  );

-- Stop someone approving their own leave, and stop a requester
-- setting any status other than cancelled on their own request.
create or replace function public.enforce_leave_review_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if new.status is distinct from old.status then
    select role into v_role from profiles where id = auth.uid();

    if new.status in ('approved', 'rejected') then
      if auth.uid() = new.user_id then
        raise exception 'You cannot review your own leave request.';
      end if;
      if v_role is null or v_role not in ('super_admin', 'admin', 'project_manager', 'team_lead') then
        raise exception 'Only an owner, admin, project manager or team lead can review leave.';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;

    if new.status = 'cancelled' and auth.uid() <> old.user_id
       and (v_role is null or v_role not in ('super_admin', 'admin')) then
      raise exception 'Only the requester or an admin can cancel a leave request.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_leave_review_rules on leave_requests;
create trigger trg_enforce_leave_review_rules
before update on leave_requests
for each row execute function public.enforce_leave_review_rules();

-- ---------- 11. Seed defaults for existing agencies ----------
insert into leave_settings (organization_id)
select id from organizations
on conflict (organization_id) do nothing;

insert into leave_types (organization_id, name, default_days, is_paid, color, sort_order)
select o.id, t.name, t.days, t.paid, t.color, t.ord
from organizations o
cross join (values
  ('Annual Leave', 10, true, '#2563EB', 1),
  ('Sick Leave', 14, true, '#DC2626', 2),
  ('Casual Leave', 10, true, '#059669', 3),
  ('Unpaid Leave', 0, false, '#6B7280', 4),
  ('Maternity / Paternity', 0, true, '#7C3AED', 5)
) as t(name, days, paid, color, ord)
on conflict (organization_id, name) do nothing;

alter publication supabase_realtime add table leave_requests;
