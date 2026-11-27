# Sign in with Google

## Dashboard setup

1. [Google Cloud Console](https://console.cloud.google.com/) → create OAuth client (Web).
2. Authorized redirect URI (Supabase callback):
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase → **Authentication → Providers → Google** → enable, paste Client ID + Secret.
4. Supabase → **URL configuration**:
   - Site URL: `https://app.reaperpm.com` (or local origin)
   - Redirect allow list includes:
     - `https://app.reaperpm.com/auth/callback`
     - `http://localhost:3000/auth/callback` (dev)

## App flow

| Entry | Behavior |
|-------|----------|
| Login → Continue with Google | OAuth → `/auth/callback` → `/auth/continue` → claim invites → workspace |
| Register → Sign up with Google | Same, then **Name your workspace** if no membership |
| Invite accept → login with Google | `?next=/invite/accept?token=…` preserved when possible; otherwise continue claims by email |

## Inviting members

- Invite the person’s **Google email** (must match exactly).
- They can open the invite email (password path) **or** skip to **Continue with Google** on login with that same account.
- On return, `POST /api/accounts/invites/claim` attaches membership for any pending invite on that email (no bootstrap of a new org).
- If Auth already created a user via `inviteUserByEmail`, Google sign-in with the same email should attach to that user (Supabase identity linking). If linking fails, use the invite link once, then Google works for later logins.

## Notes

- Google does not use the confirm-email template; Google verifies the address.
- Public registration still respects **Allow public registration** / approval flags after Google signup names the workspace.
