# CRM Platform (Web App)

Frontend + API layer for the CRM project.

## Stack
- Next.js 16 (App Router)
- Supabase (Auth + PostgreSQL + RLS)
- Brevo API (transactional emails)

## Required env vars
Create `web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
BREVO_API_KEY=...
CRON_SECRET=optional-secret-for-followup-job
```

## Install and run
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Auth flow
- `/login` for login/signup/reset password
- `/auth/callback` for Supabase auth callback
- Protected pages: dashboard, contacts, companies, leads, tasks, emails, settings

## Implemented APIs
- `GET/POST /api/contacts`
- `PATCH/DELETE /api/contacts/:id`
- `GET/POST /api/companies`
- `PATCH/DELETE /api/companies/:id`
- `GET/POST /api/leads`
- `PATCH/DELETE /api/leads/:id`
- `POST /api/leads/:id/stage`
- `GET/POST /api/tasks`
- `PATCH/DELETE /api/tasks/:id`
- `GET /api/dashboard`
- `GET /api/meta`
- `GET /api/emails/logs`
- `POST /api/emails/send`
- `POST /api/jobs/followup`

## Quality checks
```bash
npm run lint
npm run build
npm run test:unit
npm run test:component
npm run test:api
npm run test:coverage
```

## End-to-end checks
```bash
npm run test:e2e:smoke
npm run test:e2e:full
```
