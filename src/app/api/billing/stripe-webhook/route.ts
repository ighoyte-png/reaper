import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Stripe webhook stub — verifies signature when STRIPE_WEBHOOK_SECRET is set,
 * then updates billing_accounts for subscription lifecycle events.
 * No Checkout / Customer Portal yet.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const rawBody = await request.text();

  if (secret) {
    const sig = request.headers.get("stripe-signature") ?? "";
    if (!verifyStripeSignature(rawBody, sig, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  let event: {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const obj = event.data?.object ?? {};
  const type = event.type ?? "";

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    const customerId = String(obj.customer ?? "");
    const subscriptionId = String(obj.id ?? "");
    const statusRaw = String(obj.status ?? "none");
    const status = mapStripeStatus(statusRaw);
    const orgId =
      typeof obj.metadata === "object" &&
      obj.metadata &&
      "organization_id" in (obj.metadata as object)
        ? String((obj.metadata as { organization_id?: string }).organization_id)
        : null;

    let organizationId = orgId;
    if (!organizationId && customerId) {
      const { data } = await admin
        .from("billing_accounts")
        .select("organization_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      organizationId = data?.organization_id
        ? String(data.organization_id)
        : null;
    }

    if (organizationId) {
      await admin.from("billing_accounts").upsert(
        {
          organization_id: organizationId,
          stripe_customer_id: customerId || null,
          stripe_subscription_id:
            type === "customer.subscription.deleted" ? null : subscriptionId,
          status:
            type === "customer.subscription.deleted" ? "canceled" : status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
    }
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(status: string): string {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}

/** Minimal Stripe-Signature v1 check (timestamp + payload). */
function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): boolean {
  const parts = header.split(",").map((p) => p.trim());
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v ?? "";
    if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const signed = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  return signatures.some((sig) => {
    const got = Buffer.from(sig, "utf8");
    return (
      got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)
    );
  });
}
