import { createServerClient } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeAuthNextPath } from "@/lib/paths";

function defaultNextForAuth(opts: {
  code: string | null;
  type: EmailOtpType | null;
  rawNext: string | null;
}): string {
  // Invite / recovery always set a password. Signup already chose one.
  if (opts.type === "recovery" || opts.type === "invite") {
    return "/set-password";
  }
  if (opts.type === "email" || opts.type === "signup" || opts.type === "magiclink") {
    return "/auth/continue";
  }
  // `next=/login` is intentionally rejected by safeAuthNextPath (loop guard).
  // Treat that explicit intent as "go continue / sign in", not set-password.
  if (opts.rawNext === "/login" || opts.rawNext?.startsWith("/login?")) {
    return opts.code ? "/auth/continue" : "/login?confirmed=1";
  }
  if (opts.code) return "/auth/continue";
  // Bare token_hash without type: prefer continue over forcing a new password.
  return "/auth/continue";
}

/**
 * Completes email auth (recovery / invite / magic link) and OAuth (Google).
 *
 * Prefer `token_hash` + `type` (via customized Supabase email templates) —
 * that path does not need a PKCE code verifier. `?code=` is used for OAuth /
 * PKCE when the verifier cookie is present.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const oauthError = searchParams.get("error");
  const oauthDesc = searchParams.get("error_description");

  if (oauthError) {
    const msg = oauthDesc || oauthError || "Google sign-in failed";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`,
    );
  }

  const rawNext = searchParams.get("next");
  const safeNext =
    safeAuthNextPath(rawNext) ??
    defaultNextForAuth({ code, type, rawNext });

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login`);
  }

  let response = NextResponse.redirect(`${origin}${safeNext}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.redirect(`${origin}${safeNext}`);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
    return response;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // PKCE verifier lives in the browser that started the flow. For email
      // confirm, Supabase has already verified the address before redirecting
      // with ?code= — send them to sign in instead of a dead-end error.
      if (/code verifier/i.test(error.message)) {
        const nextLooksLikeOAuth =
          safeNext.startsWith("/auth/continue") ||
          searchParams.get("next")?.includes("auth/continue");
        if (nextLooksLikeOAuth) {
          const fallback = new URL(`${origin}/auth/continue`);
          fallback.searchParams.set("code", code);
          return NextResponse.redirect(fallback);
        }
        return NextResponse.redirect(`${origin}/login?confirmed=1`);
      }
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
    return response;
  }

  return response;
}
