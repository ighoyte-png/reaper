# Accounts lifecycle (enterprise)

Supabase Auth stays the IdP. An **organization** is the billable **account** (tenant). Platform operators manage every account; workspace admins manage members inside one account.

Production stance: prefer **provision / invite-only** tenants. Keep `app_settings.allow_workspace_signup` for demos; default new production deploys to **off** once operator provisioning is live.

## Lifecycle matrix

| Action | Actor | Legacy path | Target path |
|--------|-------|-------------|-------------|
| Create account | End user | `bootstrap_organization` / login signup | Same when signup on; else blocked |
| Create account | Platform | *(none)* | `POST /api/platform/accounts` |
| Enter account | Platform | `POST /api/platform/workspaces/[id]/enter` | Same (+ audit) |
| Disable / rename / delete | Platform | `PATCH/DELETE …/workspaces/[id]` | Same under Accounts UI (+ audit) |
| Invite member | Manager | `POST /api/invite` (People) | `POST /api/accounts/invites` + People still works |
| Accept invite | Invitee | Auth callback → `/set-password` (membership already created) | Pending invite → `POST /api/accounts/invites/accept` then membership |
| Offboard | Manager | Soft-delete person / remove membership | Same; cannot remove last owner |
| Billing | — | — | `billing_accounts` + webhook stub; no Checkout yet |

## Contracts

### Platform

- `GET/POST /api/platform/me` — operator flag / hard gate
- `GET/PATCH /api/platform/settings` — signup + upload limits
- `GET /api/platform/accounts` — list accounts (member counts, plan, disabled)
- `POST /api/platform/accounts` — `{ name, slug?, ownerEmail, ownerName?, delivery? }`
- `GET/PATCH /api/platform/accounts/[id]` — detail / rename / disable / plan fields
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
