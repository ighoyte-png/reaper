/**
 * Transactional mail for platform notifications.
 * Prefers Resend (`RESEND_API_KEY` + `MAIL_FROM` / `RESEND_FROM_EMAIL`).
 */

export type SendMailInput = {
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export type SendMailResult =
  | { ok: true; id?: string }
  | { ok: false; skipped?: boolean; error: string };

function mailFrom(): string | null {
  const raw =
    process.env.MAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "";
  return raw || null;
}

export async function sendTransactionalMail(
  input: SendMailInput,
): Promise<SendMailResult> {
  const to = [
    ...new Set(
      input.to.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")),
    ),
  ];
  if (to.length === 0) {
    return { ok: false, skipped: true, error: "No recipients" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = mailFrom();
  if (!apiKey) {
    console.warn(
      "[mail] RESEND_API_KEY not set — skipping send:",
      input.subject,
    );
    return {
      ok: false,
      skipped: true,
      error: "RESEND_API_KEY is not configured",
    };
  }
  if (!from) {
    return {
      ok: false,
      skipped: true,
      error: "Set MAIL_FROM or RESEND_FROM_EMAIL (e.g. Reaper <noreply@reaperpm.com>)",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      const msg =
        body.error?.message ||
        body.message ||
        `Resend HTTP ${res.status}`;
      console.error("[mail] Resend failed:", msg);
      return { ok: false, error: msg };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Mail send failed";
    console.error("[mail]", msg);
    return { ok: false, error: msg };
  }
}
