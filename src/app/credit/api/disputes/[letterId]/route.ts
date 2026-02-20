import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

const patchSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  bodyText: z.string().trim().min(1).max(20000).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ letterId: string }> }) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const { letterId } = await ctx.params;
  const id = String(letterId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const letter = await prisma.creditDisputeLetter.findFirst({
    where: { id, ownerId: session.session.user.id },
    select: {
      id: true,
      status: true,
      subject: true,
      bodyText: true,
      createdAt: true,
      updatedAt: true,
      generatedAt: true,
      sentAt: true,
      lastSentTo: true,
      contactId: true,
      creditPullId: true,
      contact: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  if (!letter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, letter });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ letterId: string }> }) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const { letterId } = await ctx.params;
  const id = String(letterId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const patch: any = {};
  if (typeof parsed.data.subject === "string") patch.subject = parsed.data.subject;
  if (typeof parsed.data.bodyText === "string") patch.bodyText = parsed.data.bodyText;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "No changes" }, { status: 400 });

  const updated = await prisma.creditDisputeLetter.updateMany({
    where: { id, ownerId: session.session.user.id },
    data: { ...patch, updatedAt: new Date(), status: "DRAFT" },
  });

  if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const letter = await prisma.creditDisputeLetter.findFirst({
    where: { id, ownerId: session.session.user.id },
    select: {
      id: true,
      status: true,
      subject: true,
      bodyText: true,
      createdAt: true,
      updatedAt: true,
      generatedAt: true,
      sentAt: true,
      lastSentTo: true,
      contact: { select: { id: true, name: true, email: true, phone: true } },
      creditPullId: true,
    },
  });

  return NextResponse.json({ ok: true, letter });
}
