import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { sendTransactionalEmail } from "@/lib/emailSender";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  channel: z.enum(["EMAIL", "SMS"]),
  to: z.string().trim().min(3).max(200),
  subject: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(2000),
});

async function sendEmail({ to, subject, body, fromName }: { to: string; subject: string; body: string; fromName: string }) {
  await sendTransactionalEmail({ to, subject, text: body, fromName });
}

async function sendSms({ ownerId, to, body }: { ownerId: string; to: string; body: string }) {
  const res = await sendOwnerTwilioSms({ ownerId, to, body: body.slice(0, 900) });
  if (!res.ok) throw new Error(res.error || "SMS send failed");
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("followUp");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.sendAction);
  if (!charged.ok) {
    return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
  }

  const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
  const fromName = profile?.businessName?.trim() || "Purely Automation";

  if (parsed.data.channel === "EMAIL") {
    await sendEmail({
      to: parsed.data.to,
      subject: parsed.data.subject?.trim() || "Test follow-up",
      body: parsed.data.body,
      fromName,
    });
  } else {
    await sendSms({ ownerId, to: parsed.data.to, body: parsed.data.body });
  }

  return NextResponse.json({ ok: true, note: "Sent." });
}
