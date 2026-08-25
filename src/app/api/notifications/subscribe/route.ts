import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";

/** Upsert the caller's Web Push subscription. */
export async function POST(request: Request) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string | null;
  };
  if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth) {
    return NextResponse.json(
      { error: "endpoint and keys required" },
      { status: 400 },
    );
  }

  const { error } = await auth.admin.from("push_subscriptions").upsert(
    {
      organization_id: auth.caller.organization_id,
      profile_id: auth.userId,
      endpoint: b.endpoint,
      p256dh: b.keys.p256dh,
      auth: b.keys.auth,
      user_agent: b.userAgent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** List caller's subscriptions. */
export async function GET(request: Request) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("push_subscriptions")
    .select("id, endpoint, user_agent, created_at, last_seen_at")
    .eq("profile_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ subscriptions: data ?? [] });
}

/** Delete a subscription by id or endpoint. */
export async function DELETE(request: Request) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const endpoint = url.searchParams.get("endpoint");
  if (!id && !endpoint) {
    return NextResponse.json(
      { error: "id or endpoint required" },
      { status: 400 },
    );
  }

  let q = auth.supabase
    .from("push_subscriptions")
    .delete()
    .eq("profile_id", auth.userId);
  if (id) q = q.eq("id", id);
  if (endpoint) q = q.eq("endpoint", endpoint);

  const { error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
