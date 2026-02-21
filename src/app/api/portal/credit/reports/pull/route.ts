import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  contactId: z.string().trim().min(1),
  provider: z.string().trim().max(40).optional().nullable(),
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
        requestedAt: now.toISOString(),
        contact: { id: contact.id, name: contact.name, email: contact.email },
        note: "Provider pull integration not configured yet",
      } as any,
    },
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

  return NextResponse.json({ ok: true, report: created });
}
