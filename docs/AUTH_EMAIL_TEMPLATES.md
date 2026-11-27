# Auth email templates (Supabase)

Templates live in [`supabase/email-templates/`](../supabase/email-templates/). Paste them into **Supabase → Authentication → Email Templates**. They are not applied automatically on hosted projects.

## Confirm sign up (required for cross-device confirm)

**Why this matters:** Supabase’s default confirm link uses the PKCE `?code=` redirect. That code only exchanges in the **same browser** that signed up. Our template uses `token_hash` (and a 6-digit OTP) so confirm works from phone mail apps, another laptop, etc.

1. Open **Authentication → Email Templates → Confirm sign up**.
2. **Subject:** `Confirm your email for Reaper`
3. Paste the body from [`confirm-signup.html`](../supabase/email-templates/confirm-signup.html) (HTML source).
4. Ensure **Site URL** is your app origin (e.g. `https://app.reaperpm.com`) and that origin plus `/auth/callback` are on the Redirect URLs allow list.
5. Turn **Confirm email** on under Auth → Providers → Email (production).

### Link format

```text
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/auth/continue
```

Handled by [`src/app/auth/callback/route.ts`](../src/app/auth/callback/route.ts) via `verifyOtp` — **no PKCE cookie**. Do **not** use `next=/login` (stripped by a redirect loop guard) or `next=/set-password` (signup already chose a password).

### OTP fallback

The template also includes `{{ .Token }}` (6-digit code). Users can enter it on [`/check-email`](../src/app/check-email/page.tsx) from any device.

### If the default template is still live

Clicking the old confirm link may still verify the address server-side, then fail the session exchange off-browser. The app recovers by sending them to `/login?confirmed=1` (“Email confirmed. Sign in…”). Prefer pasting the custom template so the link itself just works.

### Personalization

Signup stores `full_name` / `org_name` in `user_metadata`. The template greets with `{{ .Data.full_name }}` when present.

### Logo

The mark loads from `{{ .SiteURL }}/reaper_logo.svg`. That file must be publicly reachable on the Site URL host.
