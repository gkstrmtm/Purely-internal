import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";
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

async function hasTable(tableName: string): Promise<boolean> {
  const safe = String(tableName || "").replace(/[^A-Za-z0-9_]/g, "");
  if (!safe) return false;
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND lower(table_name) = lower('${safe}')
    ) AS "exists";`,
  );
  return Boolean(rows?.[0]?.exists);
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

  // This endpoint must work even if the DB was recreated and
  // runtime schema installers haven't been triggered yet.
  await ensurePortalContactTagsReady().catch(() => null);

  const url = new URL(req.url);
  const take = Math.max(1, Math.min(50, Number(url.searchParams.get("take") || 50) || 50));
  const contactsCursor = parseCursor(url.searchParams.get("contactsCursor"));
  const leadsCursor = parseCursor(url.searchParams.get("leadsCursor"));

  const portalLeadAvailable = await hasTable("PortalLead").catch(() => false);

  const contactsWhere: any = { ownerId };
  if (contactsCursor) {
    contactsWhere.OR = [
      { updatedAt: { lt: contactsCursor.t } },
      { updatedAt: { equals: contactsCursor.t }, id: { lt: contactsCursor.id } },
    ];
  }

  const leadsWhere: any = { ownerId, contactId: null };
  if (portalLeadAvailable && leadsCursor) {
    leadsWhere.OR = [
      { createdAt: { lt: leadsCursor.t } },
      { createdAt: { equals: leadsCursor.t }, id: { lt: leadsCursor.id } },
    ];
  }

  let contactsRaw: any[] = [];
  let unlinkedLeadsRaw: any[] = [];
  let totalContacts = 0;
  let totalUnlinkedLeads = 0;

  try {
    [contactsRaw, unlinkedLeadsRaw, totalContacts, totalUnlinkedLeads] = await Promise.all([
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
      portalLeadAvailable
        ? prisma.portalLead.findMany({
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
          })
        : Promise.resolve([]),
      prisma.portalContact.count({ where: { ownerId } }),
      portalLeadAvailable ? prisma.portalLead.count({ where: { ownerId, contactId: null } }) : Promise.resolve(0),
    ]);
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load contacts/leads",
        details: e instanceof Error ? e.message : String(e ?? "Unknown error"),
      },
      { status: 500 },
    );
  }

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
