-- =========================================================
-- MWM Agency OS — Migration 053: Seed entitlement on first approval
-- Run this in Supabase SQL Editor AFTER migration_052
-- =========================================================
-- Approving someone's first leave of the year created their balance
-- row with `used` filled in but `entitled` left at 0 -- so a 2-day
-- approval showed "2 used of 0" and a balance of -2, even though the
-- leave type grants 10 days.
--
-- The UI fell back to the type's default only when NO row existed;
-- once one did, its 0 won. Fixing it here rather than in the UI, so
-- the stored figure is right for anything else reading it.

create or replace function public.apply_leave_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
  v_default numeric;
begin
  v_year := extract(year from new.start_date)::int;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    select default_days into v_default from leave_types where id = new.leave_type_id;

    -- On insert, seed entitled from the type so the row starts from
    -- the real allowance. On conflict the row already exists, so its
    -- entitled is left alone -- an admin may have overridden it.
    insert into leave_balances (user_id, leave_type_id, year, used, entitled)
    values (new.user_id, new.leave_type_id, v_year, new.days, coalesce(v_default, 0))
    on conflict (user_id, leave_type_id, year)
    do update set used = leave_balances.used + new.days, updated_at = now();

    insert into leave_ledger (user_id, leave_type_id, year, change, reason, leave_request_id, created_by)
    values (new.user_id, new.leave_type_id, v_year, -new.days, 'Leave approved', new.id, auth.uid());

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

-- Repair rows already created the wrong way: anything sitting at 0
-- entitled gets the type's default. A genuine 0 (Unpaid Leave) is
-- unaffected, since its default is 0 too.
update leave_balances lb
set entitled = lt.default_days, updated_at = now()
from leave_types lt
where lb.leave_type_id = lt.id
  and lb.entitled = 0
  and lt.default_days > 0;
