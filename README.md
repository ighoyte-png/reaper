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

7. **Accounts & invites**: apply migrations through [`123_public_registration_approval.sql`](supabase/migrations/123_public_registration_approval.sql). Add `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL`. Configure Auth Site URL / Redirect URLs and SMTP.  
   - **Public registration:** `/register` (gated by **Allow public registration** on `/admin`). Optional **Require account approval** → pending screen until Approve/Reject.  
   - **Platform provision:** `/admin` → **Create account** (owner email invite + org + owner Person). Turn public registration off for invite-only production.  
   - **Addon allowlists:** platform defaults + per-account toggles in account Detail (ClickUp today). Tenant still configures/enables the addon after allow.  
   - **Workspace invites:** **Settings → Members** (pending invites with resend/revoke) or **People → Invite**. Accept via `/invite/accept`.  
   - Lifecycle details: [`docs/ACCOUNTS.md`](docs/ACCOUNTS.md).

8. **Platform admin**: set `PLATFORM_ADMIN_EMAILS` (break-glass), create the Auth user without self-serve registration, set `app_metadata.platform_admin=true` (or `PLATFORM_ADMIN_ALLOW_EMAIL_ONLY=true` temporarily). Sign in → `/admin`. Additional operators can be granted in-app under **Platform operators**. **Enter** upserts an admin membership without wiping other memberships. Audit events are written to `platform_audit_log`.

9. **Multi-workspace memberships**: one Auth user → many orgs (`organization_memberships`). URL `/{workspace}/…` selects the active org. Soft-deleting a person removes that org’s membership only. Self-serve extra workspaces (when registration allowed): **Settings → Create workspace**.

10. **Billing hooks (no Checkout yet):** each org has a `billing_accounts` row (`plan_key`, `status`, `seat_limit`, Stripe ids). Platform account detail can edit plan fields manually. Optional `STRIPE_WEBHOOK_SECRET` + `POST /api/billing/stripe-webhook` updates subscription status when Stripe is wired later.

11. **Security hardening**: apply [`057_security_hardening.sql`](supabase/migrations/057_security_hardening.sql) (and membership migrations). Run `npm run security:check` and `npm run security:rls` against staging — see [`supabase/tests/database/security_hardening_checklist.sql`](supabase/tests/database/security_hardening_checklist.sql).

12. **Org search** (optional): apply [`058_org_search.sql`](supabase/migrations/058_org_search.sql) for Cmd/Ctrl+K deep search.

With env vars set, the UI switches from local demo login to real Supabase auth and persists schedule/projects/people in Postgres.

## Features

- Schedule grid (week / 2-week): create, move, resize, duplicate assignments
- Project total budget with planned / remaining burn bars
- Capacity colors + leave overlays + over-budget warnings
- People, projects, clients CRUD
- Utilization heatmap, budgets report, financial forecast
- Light / dark theme toggle
