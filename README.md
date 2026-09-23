# MWM Agency OS

**Macarthur Web & Marketing Agency** — Agency Operating System.

A single system covering: Client Onboarding, Requirement Management, Project & Task
Management (Kanban), Work-based Chat, Approval & Revision workflow, Reporting, and
Billing.

## Stack

- **Next.js** (App Router) — frontend
- **Supabase** — Postgres database, Auth, Realtime chat, File storage
- **Tailwind CSS** — styling
- **Vercel** — hosting/deploy
- **GitHub** — version control (this repo)

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and fill in your Supabase project's URL and anon key
   (found in Supabase Dashboard → Project Settings → API):
   ```bash
   cp .env.example .env.local
   ```
3. Also add `SUPABASE_SERVICE_ROLE_KEY` (the **secret** key, same API page —
   never the publishable/anon one) — needed by `/api/admin/*` routes that
   create client/staff accounts. **Never** prefix this one with
   `NEXT_PUBLIC_`; it must stay server-only.
4. Set up the database: open the Supabase SQL Editor and run, in order:
   `supabase/schema.sql`, then `supabase/migration_002_requirements_policy.sql`,
   then `supabase/migration_003_owner_profile.sql`, then
   `supabase/migration_004_client_scoped_requirements.sql`, then
   `supabase/migration_005_tasks_policy.sql`, then
   `supabase/migration_006_messages_policy.sql`, then
   `supabase/migration_007_multi_tenant.sql`, then
   `supabase/migration_008_client_chat_and_notifications.sql`, then
   `supabase/migration_009_client_task_approvals.sql`, then
   `supabase/migration_010_assignment_scoping_and_notification_links.sql`, then
   `supabase/migration_011_file_limit_and_auto_delete.sql` (edit the
   placeholder secret key inside it first -- see the comment at its top),
   then `supabase/migration_012_tasks_updated_at_trigger.sql`, then
   `supabase/migration_013_staff_personal_messages.sql`, then
   `supabase/migration_014_mentions.sql`, then
   `supabase/migration_015_client_read_assigned_staff.sql`, then
   `supabase/migration_016_monthly_reports.sql`, then
   `supabase/migration_017_profile_sections.sql`, then
   `supabase/migration_018_platform_owner_and_email_requests.sql`, then
   `supabase/migration_019_dual_agency_platform_owner.sql`, then
   `supabase/migration_020_task_status_history.sql`, then
   `supabase/migration_021_monthly_report_rolling_expiry.sql`, then
   `supabase/migration_022_account_deletion.sql`, then
   `supabase/migration_023_client_social_links.sql`, then
   `supabase/migration_024_requirement_journey.sql`, then
   `supabase/migration_025_multiple_task_assignees.sql`, then
   `supabase/migration_026_requirement_edit_delete_file.sql`, then
   `supabase/migration_027_multiple_documents.sql`, then
   `supabase/migration_028_new_requirement_notifications.sql`, then
   `supabase/migration_029_task_conversion_notifications.sql`, then
   `supabase/migration_030_fill_notification_gaps.sql`, then
   `supabase/migration_031_cascade_delete_task.sql`, then
   `supabase/migration_032_billing.sql`, then
   `supabase/migration_033_time_tracking.sql`.
5. Run the dev server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  page.js            → landing page
  login/page.js       → client/staff login
  dashboard/page.js   → placeholder dashboard (stats cards)
  layout.js           → root layout
  globals.css          → Tailwind base styles
lib/
  supabaseClient.js    → Supabase client (browser)
supabase/
  schema.sql           → database schema (tables, enums, RLS starter policies)
```

## Database Overview

Core tables: `organizations`, `profiles`, `clients`, `client_users`, `projects`,
`requirements`, `tasks`, `task_checklist_items`, `files`, `messages`, `approvals`,
`invoices`, `activity_log`, `notifications`.

See `supabase/schema.sql` for full definitions, enums (`requirement_status`,
`task_status`, `priority_level`, `user_role`), and starter Row Level Security
policies — **tighten these before going to production.**

## Status

🚧 Early scaffold. Auth wiring, Kanban board, chat UI, and reporting dashboards are
not yet built — this commit sets up the foundation (project structure, Supabase
schema, basic pages) to build on.

## Roadmap

- **Phase 1 (MVP):** auth, client portal, requirement submission, task management,
  Kanban, file upload, chat, approvals, activity log, dashboard.
- **Phase 2:** content calendar, meetings, monthly reports, invoicing, client
  feedback, SOP library, service requests, email/WhatsApp notifications.
- **Phase 3 (AI):** requirement → task suggestions, AI client assistant.
