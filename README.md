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
3. Set up the database: open the Supabase SQL Editor and run `supabase/schema.sql`.
4. Run the dev server:
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
