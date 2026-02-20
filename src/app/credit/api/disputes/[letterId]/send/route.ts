import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { trySendTransactionalEmail } from "@/lib/emailSender";

const bodySchema = z.object({
  to: z.string().trim().email().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ letterId: string }> }) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const { letterId } = await ctx.params;
  const id = String(letterId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const letter = await prisma.creditDisputeLetter.findFirst({
    where: { id, ownerId: session.session.user.id },
    select: {
      id: true,
      subject: true,
      bodyText: true,
      status: true,
      contact: { select: { email: true, name: true } },
    },
  });

  if (!letter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const to = (parsed.data.to || letter.contact.email || "").trim();
  if (!to) return NextResponse.json({ ok: false, error: "Contact has no email" }, { status: 400 });

  const subject = (letter.subject || "Credit Dispute Letter").trim();
  const text = (letter.bodyText || "").trim();

  const send = await trySendTransactionalEmail({
    to,
    subject,
    text,
  });

  if (!send.ok) {
    const reason = send.reason || "Failed to send";
    return NextResponse.json({ ok: false, error: reason, skipped: (send as any).skipped === true }, { status: 400 });
  }

  await prisma.creditDisputeLetter.updateMany({
    where: { id, ownerId: session.session.user.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      lastSentTo: to,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
