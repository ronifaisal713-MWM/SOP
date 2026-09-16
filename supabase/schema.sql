-- =========================================================
-- MWM Agency OS — Initial Database Schema
-- Run this in Supabase SQL Editor (Project -> SQL Editor -> New query)
-- =========================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- Enums ----------
create type user_role as enum (
  'super_admin', 'admin', 'project_manager', 'team_lead', 'employee', 'client_admin', 'client_user'
);

create type requirement_status as enum (
  'new', 'reviewing', 'accepted', 'planned', 'in_progress',
  'internal_review', 'client_review', 'revision', 'approved', 'delivered', 'completed'
);

create type task_status as enum (
  'incoming', 'processing', 'internal_review', 'outgoing',
  'client_review', 'revision', 'approved', 'done'
);

create type priority_level as enum ('urgent', 'high', 'normal', 'low');

-- ---------- Core Tables ----------

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

-- Extends Supabase's built-in auth.users with app-specific role/profile info
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'client_user',
  organization_id uuid references organizations(id),
  created_at timestamptz default now()
);

create table clients (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  contact_person text,
  email text,
  phone text,
  website text,
  industry text,
  business_type text,
  target_market text,
  status text default 'active', -- active | attention_required | at_risk
  created_at timestamptz default now()
);

create table client_users (
  id uuid primary key references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  full_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table projects (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  service_type text, -- Social Media, SEO, Google Ads, Website, etc.
  status text default 'active',
  budget numeric,
  start_date date,
  created_at timestamptz default now()
);

create table requirements (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  category text,
  platform text,
  description text,
  priority priority_level default 'normal',
  status requirement_status default 'new',
  deadline date,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table tasks (
  id uuid primary key default uuid_generate_v4(),
  requirement_id uuid references requirements(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references auth.users(id),
  department text,
  priority priority_level default 'normal',
  status task_status default 'incoming',
  deadline date,
  estimated_hours numeric,
  actual_hours numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table task_checklist_items (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references tasks(id) on delete cascade,
  label text not null,
  is_done boolean default false,
  sort_order int default 0
);

create table files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  storage_path text not null, -- path inside Supabase Storage bucket
  file_name text,
  version int default 1,
  visibility text default 'client', -- 'client' | 'internal'
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references tasks(id) on delete cascade,
  requirement_id uuid references requirements(id) on delete set null,
  sender_id uuid references auth.users(id),
  body text,
  attachment_id uuid references files(id),
  visibility text default 'client', -- 'client' | 'internal'
  created_at timestamptz default now()
);

create table approvals (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references tasks(id) on delete cascade,
  file_id uuid references files(id),
  approved_by uuid references auth.users(id),
  status text default 'pending', -- pending | approved | revision_requested
  comment text,
  approved_at timestamptz
);

create table invoices (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  invoice_number text unique,
  amount numeric not null,
  status text default 'unpaid', -- unpaid | paid | overdue
  period text, -- e.g. "September 2026"
  due_date date,
  created_at timestamptz default now()
);

create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text, -- 'task' | 'requirement' | 'file' | 'approval' ...
  entity_id uuid,
  created_at timestamptz default now()
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ---------- Indexes ----------
create index idx_requirements_client on requirements(client_id);
create index idx_tasks_requirement on tasks(requirement_id);
create index idx_messages_task on messages(task_id);
create index idx_files_project on files(project_id);
create index idx_activity_entity on activity_log(entity_type, entity_id);

-- ---------- Row Level Security ----------
-- Enable RLS; add policies per role as the app is built out.
-- Left intentionally minimal here — tighten before production use.
alter table clients enable row level security;
alter table projects enable row level security;
alter table requirements enable row level security;
alter table tasks enable row level security;
alter table messages enable row level security;
alter table files enable row level security;
alter table approvals enable row level security;
alter table invoices enable row level security;
alter table activity_log enable row level security;
alter table notifications enable row level security;

-- Example starter policy: staff (profiles.role != client_user) can see everything.
-- Client-facing policies should filter by matching client_users.client_id = clients.id.
-- TODO: replace with fine-grained policies before going live.
create policy "staff_full_access_clients" on clients
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('super_admin','admin','project_manager','team_lead','employee')
    )
  );
