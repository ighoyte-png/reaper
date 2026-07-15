import { createServerClient } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Completes email auth (recovery / invite / magic link).
 *
 * Prefer `token_hash` + `type` (via customized Supabase email templates) —
 * that path does not need a PKCE code verifier. `?code=` still works when the
 * reset was started in this same browser (verifier cookie present).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/set-password";
  const safeNext = next.startsWith("/") ? next : "/set-password";

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
      // Same-browser PKCE: let the client exchange (it can read its own cookies).
      if (/code verifier/i.test(error.message)) {
        const fallback = new URL(`${origin}/set-password`);
        fallback.searchParams.set("code", code);
        return NextResponse.redirect(fallback);
      }
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
    return response;
  }

  return response;
}
