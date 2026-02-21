import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const importSchema = z.object({
  contactId: z.string().trim().min(1).optional().nullable(),
  provider: z.string().trim().max(40).optional().nullable(),
  rawJson: z.unknown(),
});

function extractItems(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  const candidates: any[] = [
    raw.items,
    raw.accounts,
    raw.tradelines,
    raw.inquiries,
    raw.collections,
    raw.publicRecords,
    raw.negativeItems,
    raw?.report?.items,
    raw?.report?.accounts,
    raw?.report?.tradelines,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  return [];
}

function labelForItem(item: any): string {
  const parts = [item?.label, item?.name, item?.creditor, item?.furnisher, item?.company, item?.accountName, item?.accountNumber];
  for (const p of parts) {
    if (typeof p === "string" && p.trim()) return p.trim().slice(0, 180);
  }
  try {
    return JSON.stringify(item).slice(0, 180);
  } catch {
    return "Item";
  }
}

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
      contact: { select: { id: true, name: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({ ok: true, reports });
}

export async function POST(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const json = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const ownerId = session.session.user.id;
  const provider = (parsed.data.provider || "UPLOAD").trim() || "UPLOAD";

  const contactId = parsed.data.contactId ? String(parsed.data.contactId).trim() : "";
  if (contactId) {
    const exists = await prisma.portalContact.findFirst({ where: { id: contactId, ownerId }, select: { id: true } });
    if (!exists) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const rawJson = parsed.data.rawJson;

  const created = await prisma.creditReport.create({
    data: {
      ownerId,
      contactId: contactId || null,
      provider,
      rawJson: rawJson as any,
      importedAt: new Date(),
      createdAt: new Date(),
    },
    select: { id: true },
  });

  const extracted = extractItems(rawJson);
  if (extracted.length) {
    const rows = extracted.slice(0, 1500).map((item: any) => {
      const bureau = typeof item?.bureau === "string" ? item.bureau.slice(0, 40) : null;
      const kind = typeof item?.kind === "string" ? item.kind.slice(0, 60) : null;
      const label = labelForItem(item);
      return {
        reportId: created.id,
        bureau,
        kind,
        label,
        detailsJson: item as any,
        auditTag: "PENDING" as const,
        disputeStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    await prisma.creditReportItem.createMany({ data: rows as any });
  }

  const report = await prisma.creditReport.findFirst({
    where: { id: created.id, ownerId },
    select: {
      id: true,
      provider: true,
      importedAt: true,
      contactId: true,
      contact: { select: { id: true, name: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({ ok: true, report });
}
