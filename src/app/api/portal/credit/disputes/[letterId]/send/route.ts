import { NextResponse } from "next/server";
import { z } from "zod";

import { readCreditDisputeLetterLifecycleMeta, writeCreditDisputeLetterLifecycleMeta } from "@/lib/creditLifecycle";
import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const sendSchema = z.object({
  to: z.string().trim().max(160).optional().nullable(),
  mailedAt: z.string().trim().max(32).optional().nullable(),
  expectedDeliveryDate: z.string().trim().max(32).optional().nullable(),
  latestOutcome: z.string().trim().max(240).optional().nullable(),
});

function parseOptionalDate(value: string | null | undefined) {
  const input = String(value || "").trim();
  if (!input) return null;

  const isoDate = input.match(/^\d{4}-\d{2}-\d{2}$/) ? `${input}T12:00:00.000Z` : input;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

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
      lastSentTo: true,
      promptText: true,
      contact: { select: { id: true, name: true, email: true } },
    },
  });
  if (!letter) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const text = String(letter.bodyText || "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "Letter is empty" }, { status: 400 });

  const mailedTo = (parsed.data.to || "").trim() || letter.lastSentTo || "Mailed copy";
  const mailedAt = parseOptionalDate(parsed.data.mailedAt) || new Date();
  const mailedAtIso = mailedAt.toISOString().slice(0, 10);
  const expectedDeliveryDate = String(parsed.data.expectedDeliveryDate || "").trim() || null;
  const lifecycleMeta = readCreditDisputeLetterLifecycleMeta(letter.promptText);
  const defaultOutcome = expectedDeliveryDate
    ? `Dispute mailed ${mailedAtIso}. Expected delivery ${expectedDeliveryDate}`
    : `Dispute mailed ${mailedAtIso}`;
  const nextMeta = lifecycleMeta
    ? {
        ...lifecycleMeta,
        mailedAt: mailedAt.toISOString(),
        expectedDeliveryDate,
        latestOutcome: (parsed.data.latestOutcome || "").trim() || defaultOutcome,
        latestOutcomeAt: mailedAt.toISOString(),
      }
    : null;

  await prisma.creditDisputeLetter.updateMany({
    where: { id, ownerId },
    data: {
      status: "SENT",
      sentAt: mailedAt,
      lastSentTo: mailedTo,
      ...(nextMeta ? { promptText: writeCreditDisputeLetterLifecycleMeta(letter.promptText, nextMeta) } : {}),
      updatedAt: new Date(),
    },
  });

  if (nextMeta?.sourceReportId && nextMeta?.sourceReportItemId) {
    const sourceReport = await prisma.creditReport.findFirst({ where: { id: nextMeta.sourceReportId, ownerId }, select: { id: true } }).catch(() => null);
    if (sourceReport) {
      await prisma.creditReportItem.updateMany({
        where: { id: nextMeta.sourceReportItemId, reportId: sourceReport.id },
        data: {
          disputeStatus: `Dispute mailed ${mailedAtIso}`,
          updatedAt: mailedAt,
        },
      }).catch(() => null);
    }
  }

  return NextResponse.json({ ok: true });
}
