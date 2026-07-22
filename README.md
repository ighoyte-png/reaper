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

7. **Member invites** (optional): add `SUPABASE_SERVICE_ROLE_KEY` to `.env` (service_role secret — server only). In Supabase **Authentication → URL configuration**, set Site URL to `http://localhost:3000`. Then **People → Invite** sends an email; the member lands on **My schedule** only.

8. **Platform admin** (optional): set `PLATFORM_ADMIN_EMAILS` to your email(s), run [`039_platform_admin.sql`](supabase/migrations/039_platform_admin.sql). Create the user in Supabase **Authentication → Users** (email + password) — do **not** use Create workspace. Sign in on `/login`; you land on `/admin` with no personal workspace. **Enter** attaches you to a workspace when you need the full app.

With env vars set, the UI switches from local demo login to real Supabase auth and persists schedule/projects/people in Postgres.

## Features

- Schedule grid (week / 2-week): create, move, resize, duplicate assignments
- Project total budget with planned / remaining burn bars
- Capacity colors + leave overlays + over-budget warnings
- People, projects, clients CRUD
- Utilization heatmap, budgets report, financial forecast
- Light / dark theme toggle
