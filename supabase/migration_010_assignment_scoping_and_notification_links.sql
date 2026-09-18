-- =========================================================
-- MWM Agency OS — Migration 010: Assignment-scoped staff access
-- Run this in Supabase SQL Editor AFTER migration_009
-- =========================================================

-- Until now, ANY staff member (project_manager/team_lead/employee) in an
-- organization could see EVERY client's requirements/tasks/chat, as long
-- as they were in the same org. That's wrong now that client_team_members
-- exists: a staff member should only see the clients they've actually
-- been assigned to. Agency (super_admin/admin) is unaffected -- they
-- still see everything in their own org.

-- ---------- 1. Helper: can this user access this client's data? ----------
create or replace function public.current_user_can_access_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from clients c
    where c.id = target_client_id
    and c.organization_id = current_user_org_id()
    and (
      current_user_role() in ('super_admin', 'admin')
      or (
        current_user_role() in ('project_manager', 'team_lead', 'employee')
        and exists (
          select 1 from client_team_members ctm
          where ctm.client_id = target_client_id
          and ctm.user_id = auth.uid()
        )
      )
    )
  );
$$;

grant execute on function public.current_user_can_access_client(uuid) to authenticated;

-- ---------- 2. clients ----------
drop policy if exists "staff_read_own_org_clients" on clients;
create policy "staff_read_own_org_clients" on clients
  for select
  using (current_user_can_access_client(id));

-- ---------- 3. requirements ----------
drop policy if exists "read_requirements" on requirements;
drop policy if exists "create_requirements" on requirements;
drop policy if exists "update_requirements" on requirements;

create policy "read_requirements" on requirements
  for select
  using (
    current_user_can_access_client(client_id)
    or client_id = current_user_client_id()
  );

create policy "create_requirements" on requirements
  for insert
  with check (
    current_user_can_access_client(client_id)
    or client_id = current_user_client_id()
  );

create policy "update_requirements" on requirements
  for update
  using (
    current_user_can_access_client(client_id)
    or client_id = current_user_client_id()
  );

-- ---------- 4. tasks ----------
drop policy if exists "read_tasks" on tasks;
drop policy if exists "staff_create_tasks" on tasks;
drop policy if exists "staff_update_tasks" on tasks;

create policy "read_tasks" on tasks
  for select
  using (
    exists (
      select 1 from requirements r
      where r.id = tasks.requirement_id
      and (
        current_user_can_access_client(r.client_id)
        or r.client_id = current_user_client_id()
      )
    )
  );

create policy "staff_create_tasks" on tasks
  for insert
  with check (
    exists (
      select 1 from requirements r
      where r.id = tasks.requirement_id
      and current_user_can_access_client(r.client_id)
    )
  );

create policy "staff_update_tasks" on tasks
  for update
  using (
    exists (
      select 1 from requirements r
      where r.id = tasks.requirement_id
      and current_user_can_access_client(r.client_id)
    )
  );

-- ---------- 5. messages (both task-level and client-level shapes) ----------
drop policy if exists "read_messages" on messages;
drop policy if exists "create_messages" on messages;

create policy "read_messages" on messages
  for select
  using (
    (
      task_id is not null
      and exists (
        select 1 from tasks t
        join requirements r on r.id = t.requirement_id
        where t.id = messages.task_id
        and (
          current_user_can_access_client(r.client_id)
          or (messages.visibility = 'client' and r.client_id = current_user_client_id())
        )
      )
    )
    or
    (
      client_id is not null
      and (
        (
          messages.visibility = 'public'
          and (current_user_can_access_client(client_id) or client_id = current_user_client_id())
        )
        or (
          messages.visibility = 'internal'
          and current_user_can_access_client(client_id)
        )
        or (
          messages.visibility = 'personal'
          and (
            (
              current_user_role() in ('super_admin', 'admin')
              and exists (
                select 1 from clients c
                where c.id = messages.client_id and c.organization_id = current_user_org_id()
              )
            )
            or messages.recipient_id = auth.uid()
            or messages.sender_id = auth.uid()
          )
        )
      )
    )
  );

create policy "create_messages" on messages
  for insert
  with check (
    (
      task_id is not null
      and exists (
        select 1 from tasks t
        join requirements r on r.id = t.requirement_id
        where t.id = messages.task_id
        and (
          current_user_can_access_client(r.client_id)
          or (messages.visibility = 'client' and r.client_id = current_user_client_id())
        )
      )
    )
    or
    (
      client_id is not null
      and (
        (
          messages.visibility = 'public'
          and (current_user_can_access_client(client_id) or client_id = current_user_client_id())
        )
        or (
          messages.visibility = 'internal'
          and current_user_can_access_client(client_id)
        )
        or (
          messages.visibility = 'personal'
          and (
            (
              current_user_role() in ('super_admin', 'admin')
              and exists (
                select 1 from clients c
                where c.id = messages.client_id and c.organization_id = current_user_org_id()
              )
              and messages.recipient_id is not null
            )
            or (messages.recipient_id = auth.uid() and messages.client_id = current_user_client_id())
          )
        )
      )
    )
  );

-- ---------- 6. client_users ----------
drop policy if exists "staff_read_own_org_client_users" on client_users;
create policy "staff_read_own_org_client_users" on client_users
  for select
  using (current_user_can_access_client(client_id));

-- ---------- 7. client_team_members: only Agency manages assignments ----------
-- Previously any staff could assign clients to anyone in the org -- that's
-- an Agency (owner/admin) decision, not something staff should do to
-- themselves or each other.
drop policy if exists "staff_manage_own_org_assignments" on client_team_members;

create policy "agency_manage_assignments" on client_team_members
  for all
  using (
    current_user_role() in ('super_admin', 'admin')
    and exists (
      select 1 from clients c
      where c.id = client_team_members.client_id
      and c.organization_id = current_user_org_id()
    )
  )
  with check (
    current_user_role() in ('super_admin', 'admin')
    and exists (
      select 1 from clients c
      where c.id = client_team_members.client_id
      and c.organization_id = current_user_org_id()
    )
  );

create policy "staff_read_own_assignments" on client_team_members
  for select
  using (user_id = auth.uid());

-- ---------- 8. Notifications: add a click-through link ----------
alter table notifications add column if not exists link text;

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
begin
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

  if new.visibility in ('public','client') then
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
      -- Staff/agency recipients have a profiles row (land on the client
      -- workspace); a client recipient doesn't (land on their dashboard,
      -- chat popup auto-opened).
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
      and p.role in ('super_admin','admin')
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

create or replace function public.notify_on_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    insert into notifications (user_id, title, body, link)
    values (new.assigned_to, 'Task assigned to you', new.title, '/dashboard/tasks/' || new.id);
  end if;
  return new;
end;
$$;
