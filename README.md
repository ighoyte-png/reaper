# Reaper

Forecast-first resource planning. Set a **project total budget**, put people on the **schedule**, and confirmed planned hours burn the remaining budget — no timesheets.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth + Postgres + RLS) when configured
- Local demo store (localStorage) when Supabase env vars are unset

## Run (local demo)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Enter demo workspace**.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API**
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (not the secret `service_role` key)
3. Copy env file and fill values:

```bash
copy .env.example .env.local
```

Or use `.env` (also loaded by Next.js). Restart `npm run dev` after changes.

4. In **SQL Editor**, run migrations in order:
   - [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql)
   - [`supabase/migrations/002_bootstrap.sql`](supabase/migrations/002_bootstrap.sql)
   - [`supabase/migrations/003_recurrence.sql`](supabase/migrations/003_recurrence.sql) (weekly recurring assignments)

5. **Authentication → Providers → Email**: for local testing, turn **off** “Confirm email” so signup works immediately.

6. Open the app → **Create workspace** (email/password) → **Settings → Load demo data**.

7. **Member invites** (optional): add `SUPABASE_SERVICE_ROLE_KEY` to `.env` (service_role secret — server only). Set `NEXT_PUBLIC_SITE_URL` to your app origin (e.g. `https://app.reaperpm.com`). In Supabase **Authentication → URL configuration**, set Site URL and Redirect URLs for that origin. Configure **Authentication → SMTP** if you want invite emails to deliver. Then **People → Invite** / **Add & Invite** lets you **send email** (Auth SMTP) or **copy a one-time invite link**.

8. **Platform admin** (optional): set `PLATFORM_ADMIN_EMAILS` to your email(s), run [`039_platform_admin.sql`](supabase/migrations/039_platform_admin.sql). Create the user in Supabase **Authentication → Users** (email + password) — do **not** use Create workspace. In **Authentication → Users → user → App Metadata**, set `{ "platform_admin": true }` (or temporarily `PLATFORM_ADMIN_ALLOW_EMAIL_ONLY=true`). Sign in on `/login`; you land on `/admin` with no personal workspace. **Enter** attaches you to a workspace when you need the full app.

9. **Security hardening**: after pulling latest, apply [`057_security_hardening.sql`](supabase/migrations/057_security_hardening.sql). Run `npm run security:check` for share/HTML/URL self-checks. Run `npm run security:rls` against staging (needs service role) for the two-agency RLS matrix — see [`supabase/tests/database/security_hardening_checklist.sql`](supabase/tests/database/security_hardening_checklist.sql).

10. **Org search** (optional): apply [`058_org_search.sql`](supabase/migrations/058_org_search.sql) for Cmd/Ctrl+K deep search across projects, clients, tasks, and comments.

With env vars set, the UI switches from local demo login to real Supabase auth and persists schedule/projects/people in Postgres.

## Features

- Schedule grid (week / 2-week): create, move, resize, duplicate assignments
- Project total budget with planned / remaining burn bars
- Capacity colors + leave overlays + over-budget warnings
- People, projects, clients CRUD
- Utilization heatmap, budgets report, financial forecast
- Light / dark theme toggle
