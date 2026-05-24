import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

import { createAndSendPortalPasswordResetCode } from "@/lib/portalPasswordReset";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  channel: z.enum(["email", "sms"]).optional(),
});

export async function POST(req: Request) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await createAndSendPortalPasswordResetCode({ email: parsed.data.email, variant, channel: parsed.data.channel || "email" });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Reset code did not send. Retry from sign in." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
