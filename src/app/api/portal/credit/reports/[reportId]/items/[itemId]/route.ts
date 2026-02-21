import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z.object({
  auditTag: z.enum(["PENDING", "NEGATIVE", "POSITIVE"]).optional(),
  disputeStatus: z.string().trim().max(60).optional().nullable(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ reportId: string; itemId: string }> }) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const { reportId, itemId } = await ctx.params;
  const rid = String(reportId || "").trim();
  const iid = String(itemId || "").trim();
  if (!rid || !iid) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const ownerId = session.session.user.id;

  const report = await prisma.creditReport.findFirst({ where: { id: rid, ownerId }, select: { id: true } });
  if (!report) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const updated = await prisma.creditReportItem.updateMany({
    where: { id: iid, reportId: rid },
    data: {
      ...(parsed.data.auditTag ? { auditTag: parsed.data.auditTag } : {}),
      ...(parsed.data.disputeStatus !== undefined ? { disputeStatus: parsed.data.disputeStatus || null } : {}),
      updatedAt: new Date(),
    },
  });

  if (!updated.count) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const item = await prisma.creditReportItem.findFirst({
    where: { id: iid, reportId: rid },
    select: {
      id: true,
      bureau: true,
      kind: true,
      label: true,
      auditTag: true,
      disputeStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, item });
}
