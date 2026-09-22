-- =========================================================
-- MWM Agency OS — Migration 028: New Requirement notifications
-- Run this in Supabase SQL Editor AFTER migration_027
-- =========================================================
-- Notifies everyone else who has access to a requirement whenever a
-- new one is created -- works the same regardless of who created it:
-- a client submitting one notifies Agency/assigned Staff, and an
-- Agency/Staff member creating one notifies that client's users too.
-- These notifications are what the sidebar's "Requirements" badge
-- count is drawn from (any unread notification whose link points
-- under /dashboard/requirements).

create or replace function public.notify_on_new_requirement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from clients where id = new.client_id;

  -- Agency owners/admins of this org, and any staff specifically
  -- assigned to this client.
  insert into notifications (user_id, title, body, link)
  select p.id, 'New Requirement', new.title, '/dashboard/requirements/' || new.id
  from profiles p
  where p.organization_id = v_org_id
    and p.id is distinct from new.created_by
    and (
      p.role in ('super_admin', 'admin')
      or exists (
        select 1 from client_team_members ctm
        where ctm.client_id = new.client_id and ctm.user_id = p.id
      )
    );

  -- The client's own users.
  insert into notifications (user_id, title, body, link)
  select cu.id, 'New Requirement', new.title, '/dashboard/requirements/' || new.id
  from client_users cu
  where cu.client_id = new.client_id
    and cu.id is distinct from new.created_by;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_new_requirement on requirements;
create trigger trg_notify_on_new_requirement
after insert on requirements
for each row execute function public.notify_on_new_requirement();
