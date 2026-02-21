import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { sendTransactionalEmail } from "@/lib/emailSender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const sendSchema = z.object({
  to: z.string().trim().email().optional().nullable(),
});

export async function POST(req: Request, ctx: { params: Promise<{ letterId: string }> }) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const { letterId } = await ctx.params;
  const id = String(letterId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const ownerId = session.session.user.id;

  const letter = await prisma.creditDisputeLetter.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      subject: true,
      bodyText: true,
      contact: { select: { id: true, name: true, email: true } },
    },
  });
  if (!letter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const fallbackTo = letter.contact.email ? String(letter.contact.email) : "";
  const to = (parsed.data.to || "").trim() || fallbackTo;
  if (!to) return NextResponse.json({ ok: false, error: "Contact has no email" }, { status: 400 });

  const subject = (letter.subject || "Credit report dispute letter").trim() || "Credit report dispute letter";
  const text = String(letter.bodyText || "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "Letter is empty" }, { status: 400 });

  await sendTransactionalEmail({
    to,
    subject,
    text,
  });

  await prisma.creditDisputeLetter.updateMany({
    where: { id, ownerId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      lastSentTo: to,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
