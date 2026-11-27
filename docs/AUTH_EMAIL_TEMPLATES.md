# Auth email templates (Supabase)

Templates live in [`supabase/email-templates/`](../supabase/email-templates/). Paste them into **Supabase → Authentication → Email Templates**. They are not applied automatically on hosted projects.

## Confirm sign up

1. Open **Confirm sign up**.
2. **Subject:** `Confirm your email for Reaper`
3. Paste the body from [`confirm-signup.html`](../supabase/email-templates/confirm-signup.html) (HTML source).
4. Ensure **Site URL** is your app origin (e.g. `https://app.reaperpm.com`) and that origin is on the Redirect URLs allow list.
5. Turn **Confirm email** on under Auth → Providers → Email (production).

### Link format

The CTA uses the SSR-safe hash path (no PKCE cookie required):

```text
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/login
```

Handled by [`src/app/auth/callback/route.ts`](../src/app/auth/callback/route.ts).

### Personalization

Signup stores `full_name` / `org_name` in `user_metadata`. The template greets with `{{ .Data.full_name }}` when present.

### Logo

The mark loads from `{{ .SiteURL }}/reaper_logo.svg`. That file must be publicly reachable on the Site URL host.
