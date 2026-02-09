import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { runOwnerAutomationByIdForInboundSms } from "@/lib/portalAutomationsRunner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  automationId: z.string().trim().min(1).max(200),
  from: z.string().trim().min(3).max(32),
  body: z.string().trim().min(0).max(2000).default(""),
});

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const raw = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const ownerId = auth.session.user.id;

  const twilio = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  const to = twilio?.fromNumberE164 || "";

  await runOwnerAutomationByIdForInboundSms({
    ownerId,
    automationId: parsed.data.automationId,
    from: parsed.data.from,
    to,
    body: parsed.data.body,
  });

  return NextResponse.json({ ok: true });
}
