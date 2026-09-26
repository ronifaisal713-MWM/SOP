-- =========================================================
-- MWM Agency OS — Migration 039: Staff DM notifications open the conversation
-- Run this in Supabase SQL Editor AFTER migration_038
-- =========================================================
-- A private Staff<->Owner message linked to /dashboard/admin/team,
-- which made the sidebar show an unread badge on "Team" -- misleading,
-- since nothing about the Team page itself changed, and clicking
-- through just showed a member list with no hint of the message.
--
-- Now links with ?openDm=<sender id>, so the badge lands on the right
-- place and clicking it opens that person's conversation directly.

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
  -- Staff <-> Agency private DM -- no client or task involved.
  if new.client_id is null and new.task_id is null
     and new.organization_id is not null and new.recipient_id is not null then
    select role in ('super_admin', 'admin') into v_recipient_is_agency
    from profiles where id = new.recipient_id;

    insert into notifications (user_id, title, body, link)
    values (
      new.recipient_id,
      'New private message',
      left(coalesce(new.body, ''), 100),
      case
        when v_recipient_is_agency
          then '/dashboard/admin/team?openDm=' || new.sender_id
        else '/dashboard?openDm=' || new.sender_id
      end
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
