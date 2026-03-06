import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { findOrCreatePortalContact, normalizePhoneKey } from "@/lib/portalContacts";
import { addContactTagAssignment, createOwnerContactTag, ensurePortalContactTagsReady } from "@/lib/portalContactTags";
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

  // Keep this conservative and failure-tolerant. If this probe fails (permissions,
  // driver quirks, etc.), callers should NOT treat it as a definitive "missing".
  // We only use this for optional tables.
  try {
    // Use to_regclass so quoted/case-sensitive tables ("PortalContact") are detected.
    const rel = `public."${safe}"`;
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>
      `SELECT (to_regclass(${rel}) IS NOT NULL) AS "exists";`;
    return Boolean(rows?.[0]?.exists);
  } catch {
    return false;
  }
}

function isMissingRelationError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /does not exist|relation .* does not exist|no such table/i.test(msg);
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

  // Optional tables: we avoid hard errors on brand-new / partially-provisioned portals.
  // Note: we do NOT probe PortalContact anymore. If contacts exist (as confirmed by
  // other features), a probe failure should not cause a false "No contacts" UI.
  const [portalLeadAvailable, portalTagAvailable, portalTagAssignmentAvailable] = await Promise.all([
    hasTable("PortalLead"),
    hasTable("PortalContactTag"),
    hasTable("PortalContactTagAssignment"),
  ]);

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
    const canLoadTags = portalTagAvailable && portalTagAssignmentAvailable;

    [contactsRaw, unlinkedLeadsRaw, totalContacts, totalUnlinkedLeads] = await Promise.all([
      canLoadTags
        ? prisma.portalContact.findMany({
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
          })
        : prisma.portalContact.findMany({
            where: contactsWhere,
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              createdAt: true,
              updatedAt: true,
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
    if (isMissingRelationError(e)) {
      return NextResponse.json({
        ok: true,
        totalContacts: 0,
        totalUnlinkedLeads: 0,
        contactsNextCursor: null,
        unlinkedLeadsNextCursor: null,
        contacts: [],
        unlinkedLeads: [],
      });
    }
    // Do not surface this as an error for end-users; treat as empty state.
    return NextResponse.json({
      ok: true,
      totalContacts: 0,
      totalUnlinkedLeads: 0,
      contactsNextCursor: null,
      unlinkedLeadsNextCursor: null,
      contacts: [],
      unlinkedLeads: [],
      warning: "People data not ready",
      details: e instanceof Error ? e.message : String(e ?? "Unknown error"),
    });
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

function splitTags(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const parts = s
    .split(/[\n\r,;|]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p.slice(0, 60));
    if (out.length >= 10) break;
  }
  return out;
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("people");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const name = String(body?.name ?? "").trim().slice(0, 80);
  const email = String(body?.email ?? "").trim().slice(0, 120);
  const phone = String(body?.phone ?? "").trim().slice(0, 40);
  const tags = splitTags(body?.tags);

  if (!name) {
    return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  }

  if (phone) {
    const norm = normalizePhoneKey(phone);
    if (norm.error) {
      return NextResponse.json({ ok: false, error: norm.error }, { status: 400 });
    }
  }

  // Best-effort: schema installers might not be ready yet on brand new portals.
  await ensurePortalContactTagsReady().catch(() => null);

  const contactId = await findOrCreatePortalContact({
    ownerId,
    name,
    email: email || null,
    phone: phone || null,
  });

  if (!contactId) {
    return NextResponse.json({ ok: false, error: "Could not create contact" }, { status: 400 });
  }

  if (tags.length) {
    for (const tagName of tags) {
      const tag = await createOwnerContactTag({ ownerId, name: tagName }).catch(() => null);
      if (!tag) continue;
      await addContactTagAssignment({ ownerId, contactId, tagId: tag.id }).catch(() => null);
    }
  }

  return NextResponse.json({ ok: true, contactId });
}
