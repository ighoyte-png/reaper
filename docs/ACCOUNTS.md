# Accounts lifecycle (enterprise)

Supabase Auth stays the IdP. An **organization** is the billable **account** (tenant). Platform operators manage every account; workspace admins manage members inside one account.

Production stance: prefer **provision / invite-only** tenants, or public `/register` with **Require account approval** on. Keep `app_settings.allow_workspace_signup` as the public registration on/off switch.

## Lifecycle matrix

| Action | Actor | Path |
|--------|-------|------|
| Create account | End user | `/register` → Auth signup → `bootstrap_organization` (when `allow_workspace_signup`) |
| Create account | Platform | `POST /api/platform/accounts` |
| Approve / reject | Platform | `POST …/accounts/[id]/approve` or `…/reject` |
| Enter account | Platform | `POST /api/platform/accounts/[id]/enter` (+ audit) |
| Disable / rename / delete | Platform | `PATCH/DELETE …/accounts/[id]` (+ audit) |
| Invite member | Manager | `POST /api/accounts/invites` (+ People invite still works) |
| Accept invite | Invitee | `/invite/accept?token=…` → membership |
| Offboard | Manager | Soft-delete person / remove membership (cannot remove last owner) |
| Billing | — | `billing_accounts` + webhook stub; no Checkout yet |
| Addon allowlist | Platform | Defaults in settings; per-account in account detail |

## Public registration + approval

- **On/off:** `app_settings.allow_workspace_signup` (login links to `/register` when on).
- **Google:** `/login` and `/register` support Continue / Sign up with Google (see [`AUTH_GOOGLE.md`](AUTH_GOOGLE.md)). After OAuth, `/auth/continue` claims pending invites by email, then either enters the workspace or prompts for org name (register intent / signup open).
- **Approval:** `app_settings.require_account_approval`. When on, bootstrap sets `organizations.approval_status = 'pending'`. Owner can sign in and sees `/pending-approval` / app-shell pending screen until a platform operator **Approves** or **Rejects**.
- **Approve** sets `approved`, clears `disabled_at`, and applies `default_allowed_addons` to `organization_addon_allowlist`.
- **Reject** sets `rejected` + `disabled_at` (+ optional reason).
- `disabled_at` remains the operator kill-switch for already-approved accounts (distinct from pending/rejected UX).

## Invites + Google

- Invite the member’s Google address; they may set a password from the Auth invite **or** use **Continue with Google** with that same email.
- Claim path (`/api/accounts/invites/claim`) runs on login/OAuth continue so they join the invited org instead of creating a new one.

## Addon allowlists

- Platform-owned table `organization_addon_allowlist` (`organization_id`, `addon_key`, `allowed`). Missing key = **not allowed**.
- `app_settings.default_allowed_addons` (e.g. `clickup`) applied on approve and on platform provision.
- Tenant admins still toggle `addon_clickup_settings.enabled` after the platform allows the addon. Enable + sync/inbound fail closed when not allowlisted.

## Contracts

### Platform

- `GET/POST /api/platform/me` — operator flag / hard gate
- `GET/PATCH /api/platform/settings` — registration, approval, default addons, upload limits
- `GET /api/platform/accounts` — list (`?approval=pending|approved|rejected`)
- `POST /api/platform/accounts` — `{ name, slug?, ownerEmail, ownerName?, delivery? }`
- `GET/PATCH /api/platform/accounts/[id]` — detail / rename / disable / plan fields
- `POST /api/platform/accounts/[id]/approve` / `…/reject`
- `GET/PUT /api/platform/accounts/[id]/addons` — per-account allowlist
- `POST /api/platform/accounts/[id]/enter` — alias of workspaces enter
- `GET /api/platform/operators` / `POST` / `DELETE` — grant/revoke platform operators
- `GET /api/platform/accounts/[id]/audit` — recent audit events

Existing `/api/platform/workspaces*` remain as compatibility aliases.

### Workspace invites

- `GET /api/accounts/invites` — pending invites for current org
- `POST /api/accounts/invites` — `{ email, role, fullName?, personId?, delivery? }`
- `POST /api/accounts/invites/[id]/resend`
- `POST /api/accounts/invites/[id]/revoke`
- `POST /api/accounts/invites/accept` — `{ token }` (authenticated invitee)

### Billing hooks

- `billing_accounts` row per org
- `getAccountEntitlements(orgId)` helper
- `POST /api/billing/stripe-webhook` — signature verify when configured; updates subscription fields

## Identity notes

- Platform access: `PLATFORM_ADMIN_EMAILS` (break-glass) **or** `platform_operators` row; `app_metadata.platform_admin` set when granting in-app.
- Membership SoT: `organization_memberships` (+ `is_owner`).
- Directory: `people` (login optional via `profile_id`).
