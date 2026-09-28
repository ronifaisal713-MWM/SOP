-- =========================================================
-- MWM Agency OS — Migration 050: Partial first/last day on leave
-- Run this in Supabase SQL Editor AFTER migration_049
-- =========================================================
-- migration_049 only supported a half day on a single-date request.
-- Real leave often starts or ends mid-day: "out from the 10th
-- afternoon until the 13th" is 3.5 days, and forcing that into two
-- separate requests is both annoying and makes the history harder to
-- read.
--
-- Replaces the single is_half_day flag with a half day on each END of
-- the range, which covers every real case:
--   start_half only  -> leave begins after lunch
--   end_half only    -> leave ends at lunch
--   both             -> starts and ends mid-day
--   single date+half -> the old behaviour, unchanged

alter table leave_requests add column if not exists start_half boolean not null default false;
alter table leave_requests add column if not exists end_half boolean not null default false;

-- Carry the old flag across so existing requests keep their meaning.
update leave_requests
set start_half = true
where is_half_day = true and start_half = false;

-- The old constraint tied half days to single-date requests; that's
-- exactly what we're lifting.
alter table leave_requests drop constraint if exists leave_requests_check1;
alter table leave_requests drop constraint if exists leave_requests_check2;

-- On a single-date request the two halves mean the same thing, so
-- asking for both would be a full day -- reject it as a mistake
-- rather than silently counting 1.0.
alter table leave_requests add constraint single_date_one_half
  check (not (start_date = end_date and start_half and end_half));

create or replace function public.prepare_leave_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days numeric;
  v_start_is_working boolean;
  v_end_is_working boolean;
  v_weekend int[];
begin
  v_days := count_working_days(new.organization_id, new.start_date, new.end_date);

  if v_days <= 0 then
    raise exception 'Those dates contain no working days (weekend or holiday).';
  end if;

  select weekend_days into v_weekend from leave_settings
  where organization_id = new.organization_id;
  if v_weekend is null then
    v_weekend := '{5,6}';
  end if;

  -- Only deduct a half if that end is actually a working day --
  -- marking a Friday as "half" shouldn't subtract anything, since it
  -- was never counted in the first place.
  v_start_is_working :=
    not (extract(dow from new.start_date)::int = any(v_weekend))
    and not exists (
      select 1 from holidays h
      where h.organization_id = new.organization_id and h.holiday_date = new.start_date
    );

  v_end_is_working :=
    not (extract(dow from new.end_date)::int = any(v_weekend))
    and not exists (
      select 1 from holidays h
      where h.organization_id = new.organization_id and h.holiday_date = new.end_date
    );

  if new.start_half and v_start_is_working then
    v_days := v_days - 0.5;
  end if;

  -- On a single date both flags refer to the same day, so the check
  -- constraint above already prevents double-subtracting.
  if new.end_half and v_end_is_working and new.end_date <> new.start_date then
    v_days := v_days - 0.5;
  end if;

  if v_days <= 0 then
    raise exception 'That works out to zero days of leave.';
  end if;

  new.days := v_days;
  -- Keep the legacy flag in step so older rows and any code still
  -- reading it stay consistent.
  new.is_half_day := (new.start_date = new.end_date and new.start_half);

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
before insert or update of start_date, end_date, start_half, end_half, is_half_day on leave_requests
for each row execute function public.prepare_leave_request();
