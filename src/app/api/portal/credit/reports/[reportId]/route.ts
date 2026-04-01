import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeCreditScope(raw: unknown): "PERSONAL" | "BUSINESS" | "BOTH" {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (value === "BUSINESS" || value === "BOTH") return value;
  return "PERSONAL";
}

export async function GET(_req: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const { reportId } = await ctx.params;
  const id = String(reportId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ownerId = session.session.user.id;

  const report = await prisma.creditReport.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      provider: true,
      importedAt: true,
      createdAt: true,
      rawJson: true,
      contactId: true,
      contact: { select: { id: true, name: true, email: true } },
      items: {
        orderBy: [{ auditTag: "asc" }, { createdAt: "desc" }],
        take: 500,
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
      },
    },
  });

  if (!report) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    report: {
      ...report,
      creditScope: normalizeCreditScope((report.rawJson as any)?.creditScope ?? (report.rawJson as any)?.scope),
    },
  });
}
