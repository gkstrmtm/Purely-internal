import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseCursor(raw: string | null): { t: Date; id: string } | null {
  const v = (raw || "").trim();
  if (!v) return null;
  try {
    const decoded = Buffer.from(v, "base64url").toString("utf8");
    const j = JSON.parse(decoded);
    const tRaw = typeof j?.t === "string" ? j.t : null;
    const id = typeof j?.id === "string" ? j.id : null;
    if (!tRaw || !id) return null;
    const t = new Date(tRaw);
    if (!Number.isFinite(t.getTime())) return null;
    return { t, id: String(id) };
  } catch {
    return null;
  }
}

function makeCursor(t: Date, id: string) {
  return Buffer.from(JSON.stringify({ t: t.toISOString(), id }), "utf8").toString("base64url");
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("people");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const url = new URL(req.url);
  const take = Math.max(1, Math.min(50, Number(url.searchParams.get("take") || 50) || 50));
  const contactsCursor = parseCursor(url.searchParams.get("contactsCursor"));
  const leadsCursor = parseCursor(url.searchParams.get("leadsCursor"));

  const contactsWhere: any = { ownerId };
  if (contactsCursor) {
    contactsWhere.OR = [
      { updatedAt: { lt: contactsCursor.t } },
      { updatedAt: { equals: contactsCursor.t }, id: { lt: contactsCursor.id } },
    ];
  }

  const leadsWhere: any = { ownerId, contactId: null };
  if (leadsCursor) {
    leadsWhere.OR = [
      { createdAt: { lt: leadsCursor.t } },
      { createdAt: { equals: leadsCursor.t }, id: { lt: leadsCursor.id } },
    ];
  }

  const [contactsRaw, unlinkedLeadsRaw, totalContacts, totalUnlinkedLeads] = await Promise.all([
    prisma.portalContact.findMany({
      where: contactsWhere,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        tagAssignments: {
          select: {
            tag: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: take + 1,
    }),
    prisma.portalLead.findMany({
      where: leadsWhere,
      select: {
        id: true,
        businessName: true,
        email: true,
        phone: true,
        website: true,
        createdAt: true,
        assignedToUserId: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
    }),
    prisma.portalContact.count({ where: { ownerId } }),
    prisma.portalLead.count({ where: { ownerId, contactId: null } }),
  ]);

  const contactsHasMore = contactsRaw.length > take;
  const contacts = contactsHasMore ? contactsRaw.slice(0, take) : contactsRaw;
  const contactsNextCursor = contactsHasMore
    ? (() => {
        const last = contacts[contacts.length - 1];
        return last?.updatedAt ? makeCursor(last.updatedAt, String(last.id)) : null;
      })()
    : null;

  const leadsHasMore = unlinkedLeadsRaw.length > take;
  const unlinkedLeads = leadsHasMore ? unlinkedLeadsRaw.slice(0, take) : unlinkedLeadsRaw;
  const unlinkedLeadsNextCursor = leadsHasMore
    ? (() => {
        const last = unlinkedLeads[unlinkedLeads.length - 1];
        return last?.createdAt ? makeCursor(last.createdAt, String(last.id)) : null;
      })()
    : null;

  return NextResponse.json({
    ok: true,
    totalContacts,
    totalUnlinkedLeads,
    contactsNextCursor,
    unlinkedLeadsNextCursor,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      createdAtIso: c.createdAt ? c.createdAt.toISOString() : null,
      updatedAtIso: c.updatedAt ? c.updatedAt.toISOString() : null,
      tags: (c as any).tagAssignments
        ? (c as any).tagAssignments
            .map((a: any) => a?.tag)
            .filter(Boolean)
            .map((t: any) => ({
              id: String(t.id),
              name: String(t.name || "").slice(0, 60),
              color: typeof t.color === "string" ? String(t.color) : null,
            }))
        : [],
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
