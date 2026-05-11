import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { ingestCreditReport } from "@/lib/creditReportIngest";
import { extractCreditReportSnapshot, normalizeCreditScope } from "@/lib/creditReports";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const importSchema = z.object({
  contactId: z.string().trim().min(1).optional().nullable(),
  provider: z.string().trim().max(40).optional().nullable(),
  creditScope: z.enum(["PERSONAL", "BUSINESS", "BOTH"]).optional().nullable(),
  rawJson: z.unknown(),
});

export async function GET() {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const ownerId = session.session.user.id;

  const reports = await prisma.creditReport.findMany({
    where: { ownerId },
    orderBy: [{ importedAt: "desc" }, { id: "desc" }],
    take: 25,
    select: {
      id: true,
      provider: true,
      importedAt: true,
      createdAt: true,
      contactId: true,
      rawJson: true,
      contact: { select: { id: true, name: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    reports: reports.map((report) => ({
      ...report,
      creditScope: normalizeCreditScope((report.rawJson as any)?.creditScope ?? (report.rawJson as any)?.scope),
      creditSnapshot: extractCreditReportSnapshot(report.rawJson),
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const json = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const ownerId = session.session.user.id;
  const provider = (parsed.data.provider || "UPLOAD").trim() || "UPLOAD";
  const creditScope = normalizeCreditScope(parsed.data.creditScope);

  const contactId = parsed.data.contactId ? String(parsed.data.contactId).trim() : "";
  if (contactId) {
    const exists = await prisma.portalContact.findFirst({ where: { id: contactId, ownerId }, select: { id: true } });
    if (!exists) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const report = await ingestCreditReport({
    ownerId,
    contactId: contactId || null,
    provider,
    creditScope,
    rawJson: parsed.data.rawJson,
  });

  return NextResponse.json({
    ok: true,
    report: report
      ? {
          ...report,
          creditScope,
          creditSnapshot: report.creditSnapshot ?? extractCreditReportSnapshot(report.rawJson),
        }
      : null,
  });
}
