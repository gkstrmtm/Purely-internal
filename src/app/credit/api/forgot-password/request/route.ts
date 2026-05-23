import { NextResponse } from "next/server";
import { z } from "zod";

import { createAndSendPortalPasswordResetCode } from "@/lib/portalPasswordReset";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  channel: z.enum(["email", "sms"]).optional(),
});

export async function POST(req: Request) {
  const variant = "credit";

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
    return NextResponse.json({ ok: false, error: "Unable to send code right now." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
