import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z.object({
  subject: z.string().trim().max(200).optional(),
  bodyText: z.string().trim().max(20000).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ letterId: string }> }) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const { letterId } = await ctx.params;
  const id = String(letterId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

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
      pdfMediaItemId: true,
      pdfGeneratedAt: true,
      sentAt: true,
      lastSentTo: true,
      contactId: true,
      creditPullId: true,
      contact: { select: { id: true, name: true, email: true, phone: true } },
      pdfMediaItem: { select: { id: true, publicToken: true } },
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
  if (!id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const nextSubject = typeof parsed.data.subject === "string" ? parsed.data.subject : undefined;
  const nextBodyText = typeof parsed.data.bodyText === "string" ? parsed.data.bodyText : undefined;

  const updated = await prisma.creditDisputeLetter.updateMany({
    where: { id, ownerId: session.session.user.id },
    data: {
      ...(nextSubject !== undefined ? { subject: nextSubject } : {}),
      ...(nextBodyText !== undefined ? { bodyText: nextBodyText } : {}),
      status: "DRAFT",
      updatedAt: new Date(),
    },
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
      pdfMediaItemId: true,
      pdfGeneratedAt: true,
      sentAt: true,
      lastSentTo: true,
      creditPullId: true,
      contact: { select: { id: true, name: true, email: true, phone: true } },
      pdfMediaItem: { select: { id: true, publicToken: true } },
    },
  });

  if (!letter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, letter });
}
