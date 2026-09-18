-- =========================================================
-- MWM Agency OS — Migration 008: Client-level chat, files, notifications
-- Run this in Supabase SQL Editor AFTER migration_007
-- =========================================================

-- ---------- 1. New columns on messages ----------
-- client_id: for messages tied to a CLIENT generally (the "switch to a
-- client's profile" chat), as opposed to task_id which ties a message
-- to one specific task.
-- recipient_id: for 'personal' visibility -- identifies which single
-- client contact this private thread is with.
alter table messages add column if not exists client_id uuid references clients(id) on delete cascade;
alter table messages add column if not exists recipient_id uuid references auth.users(id);

-- ---------- 2. Replace the older messages policies with a unified set ----------
-- Covers both shapes: task-level messages (task_id set, visibility
-- 'client'/'internal' -- unchanged behaviour) and the new client-level
-- messages (client_id set, visibility 'public'/'internal'/'personal').
drop policy if exists "staff_org_access_messages" on messages;
drop policy if exists "client_read_own_client_messages" on messages;
drop policy if exists "client_create_own_client_messages" on messages;

create policy "read_messages" on messages
  for select
  using (
    (
      task_id is not null
      and exists (
        select 1 from tasks t
        join requirements r on r.id = t.requirement_id
        join clients c on c.id = r.client_id
        where t.id = messages.task_id
        and (
          (
            current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
            and c.organization_id = current_user_org_id()
          )
          or (messages.visibility = 'client' and c.id = current_user_client_id())
        )
      )
    )
    or
    (
      client_id is not null
      and exists (
        select 1 from clients c
        where c.id = messages.client_id
        and (
          (
            messages.visibility = 'public'
            and (
              (
                current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
                and c.organization_id = current_user_org_id()
              )
              or c.id = current_user_client_id()
            )
          )
          or (
            messages.visibility = 'internal'
            and current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
            and c.organization_id = current_user_org_id()
          )
          or (
            messages.visibility = 'personal'
            and (
              (current_user_role() in ('super_admin','admin') and c.organization_id = current_user_org_id())
              or messages.recipient_id = auth.uid()
              or messages.sender_id = auth.uid()
            )
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
        join clients c on c.id = r.client_id
        where t.id = messages.task_id
        and (
          (
            current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
            and c.organization_id = current_user_org_id()
          )
          or (messages.visibility = 'client' and c.id = current_user_client_id())
        )
      )
    )
    or
    (
      client_id is not null
      and exists (
        select 1 from clients c
        where c.id = messages.client_id
        and (
          (
            messages.visibility = 'public'
            and (
              (
                current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
                and c.organization_id = current_user_org_id()
              )
              or c.id = current_user_client_id()
            )
          )
          or (
            messages.visibility = 'internal'
            and current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
            and c.organization_id = current_user_org_id()
          )
          or (
            -- Agency (owner/admin) can start a personal thread with any
            -- contact of their own org's client. Staff (project_manager/
            -- team_lead/employee) are deliberately excluded here -- they
            -- can never send a personal message to a client.
            messages.visibility = 'personal'
            and (
              (
                current_user_role() in ('super_admin','admin')
                and c.organization_id = current_user_org_id()
                and messages.recipient_id is not null
              )
              or (messages.recipient_id = auth.uid() and c.id = current_user_client_id())
            )
          )
        )
      )
    )
  );

-- ---------- 3. Storage bucket for chat file attachments ----------
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

create policy "authenticated_upload_chat_attachments"
on storage.objects for insert
with check (bucket_id = 'chat-attachments' and auth.role() = 'authenticated');

create policy "public_read_chat_attachments"
on storage.objects for select
using (bucket_id = 'chat-attachments');

-- ---------- 4. files table: was RLS-enabled with no policy (blocked everything) ----------
create policy "authenticated_read_files" on files
  for select
  using (auth.role() = 'authenticated');

create policy "authenticated_insert_files" on files
  for insert
  with check (auth.role() = 'authenticated');

-- ---------- 5. notifications: self read/update ----------
create policy "users_read_own_notifications" on notifications
  for select
  using (user_id = auth.uid());

create policy "users_update_own_notifications" on notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- 6. Auto-notify on new messages ----------
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_client_id uuid;
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

  if new.visibility in ('public','client') then
    insert into notifications (user_id, title, body)
    select p.id, 'New message', left(coalesce(new.body, ''), 100)
    from profiles p
    where p.organization_id = v_org_id and p.id <> new.sender_id;

    insert into notifications (user_id, title, body)
    select cu.id, 'New message', left(coalesce(new.body, ''), 100)
    from client_users cu
    where cu.client_id = v_client_id and cu.id <> new.sender_id;

  elsif new.visibility = 'personal' then
    if new.recipient_id is not null and new.recipient_id <> new.sender_id then
      insert into notifications (user_id, title, body)
      values (new.recipient_id, 'New personal message', left(coalesce(new.body, ''), 100));
    end if;

    insert into notifications (user_id, title, body)
    select p.id, 'New personal message', left(coalesce(new.body, ''), 100)
    from profiles p
    where p.organization_id = v_org_id
      and p.role in ('super_admin','admin')
      and p.id <> new.sender_id;

  elsif new.visibility = 'internal' then
    insert into notifications (user_id, title, body)
    select p.id, 'New internal note', left(coalesce(new.body, ''), 100)
    from profiles p
    where p.organization_id = v_org_id and p.id <> new.sender_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_new_message on messages;
create trigger trg_notify_on_new_message
after insert on messages
for each row execute function public.notify_on_new_message();

-- ---------- 7. Auto-notify when a task is assigned ----------
create or replace function public.notify_on_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    insert into notifications (user_id, title, body)
    values (new.assigned_to, 'Task assigned to you', new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_task_assigned on tasks;
create trigger trg_notify_on_task_assigned
after insert or update of assigned_to on tasks
for each row execute function public.notify_on_task_assigned();

-- ---------- 8. Realtime for notifications (for the notification bell) ----------
alter publication supabase_realtime add table notifications;
