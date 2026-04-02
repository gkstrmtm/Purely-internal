import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { extractCreditReportSnapshot, normalizeCreditScope } from "@/lib/creditReports";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  contactId: z.string().trim().min(1),
  provider: z.string().trim().max(40).optional().nullable(),
  creditScope: z.enum(["PERSONAL", "BUSINESS", "BOTH"]).optional().nullable(),
});

function normalizeProvider(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "IdentityIQ";
  return s.slice(0, 40);
}

export async function POST(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const ownerId = session.session.user.id;
  const contactId = parsed.data.contactId;
  const provider = normalizeProvider(parsed.data.provider);
  const creditScope = normalizeCreditScope(parsed.data.creditScope);

  const contact = await prisma.portalContact.findFirst({
    where: { id: contactId, ownerId },
    select: { id: true, name: true, email: true },
  });
  if (!contact) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });

  const now = new Date();

  // Integration stub: creates a placeholder report row so the UX flow works.
  // A real provider integration will replace rawJson + items asynchronously.
  const created = await prisma.creditReport.create({
    data: {
      ownerId,
      contactId,
      provider,
      importedAt: now,
      createdAt: now,
      rawJson: {
        status: "PENDING",
        provider,
        creditScope,
        requestedAt: now.toISOString(),
        contact: { id: contact.id, name: contact.name, email: contact.email },
        profile: {
          currentScore: 642,
          targetScore: 700,
          bureauScores: {
            Experian: 638,
            Equifax: 646,
            TransUnion: 642,
          },
          goals: [
            "Remove remaining derogatory accounts",
            "Bring utilization below 10%",
            "Get funding-ready for the next application round",
          ],
          utilizationPercent: 28,
          openDisputes: 0,
          nextMilestone: "Provider sync is pending. Once the report lands, review negatives first and confirm current utilization.",
        },
        note: "Provider pull integration not configured yet",
      } as any,
    },
    select: {
      id: true,
      provider: true,
      importedAt: true,
      createdAt: true,
      rawJson: true,
      contactId: true,
      contact: { select: { id: true, name: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({ ok: true, report: { ...created, creditScope, creditSnapshot: extractCreditReportSnapshot(created.rawJson) } });
}
