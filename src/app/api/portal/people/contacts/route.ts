import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("people");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const [contacts, unlinkedLeads] = await Promise.all([
    prisma.portalContact.findMany({
      where: { ownerId },
      select: { id: true, name: true, email: true, phone: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.portalLead.findMany({
      where: { ownerId, contactId: null },
      select: {
        id: true,
        businessName: true,
        email: true,
        phone: true,
        website: true,
        createdAt: true,
        assignedToUserId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      createdAtIso: c.createdAt ? c.createdAt.toISOString() : null,
      updatedAtIso: c.updatedAt ? c.updatedAt.toISOString() : null,
    })),
    unlinkedLeads: unlinkedLeads.map((l) => ({
      id: l.id,
      businessName: l.businessName,
      email: l.email,
      phone: l.phone,
      website: l.website,
      createdAtIso: l.createdAt ? l.createdAt.toISOString() : null,
      assignedToUserId: l.assignedToUserId,
    })),
  });
}
