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
  const debugEnabled = url.searchParams.get("debug") === "1";

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

  let contactsRaw: any[] = [];
  let totalContacts = 0;

  try {
    [contactsRaw, totalContacts] = await Promise.all([
      (prisma as any).portalContact.findMany({
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
      (prisma as any).portalContact.count({ where: { ownerId } }),
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

  // Best-effort: load tags for the contacts on this page.
  const tagsByContactId = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
  try {
    const contactIds = contacts.map((c) => String(c.id)).filter(Boolean);
    if (contactIds.length) {
      const rows = await (prisma as any).portalContactTagAssignment.findMany({
        where: { ownerId, contactId: { in: contactIds } },
        take: 2000,
        select: {
          contactId: true,
          tag: { select: { id: true, name: true, color: true } },
        },
      });

      for (const r of rows || []) {
        const cid = String(r.contactId || "");
        const t = r.tag;
        if (!cid || !t) continue;
        const list = tagsByContactId.get(cid) || [];
        list.push({
          id: String(t.id),
          name: String(t.name || "").slice(0, 60),
          color: typeof t.color === "string" ? String(t.color) : null,
        });
        tagsByContactId.set(cid, list);
      }
    }
  } catch {
    // ignore
  }

  // Best-effort: load unlinked leads (optional table).
  let unlinkedLeadsRaw: any[] = [];
  let totalUnlinkedLeads = 0;
  try {
    const leadsWhere: any = { ownerId, contactId: null };
    if (leadsCursor) {
      leadsWhere.OR = [
        { createdAt: { lt: leadsCursor.t } },
        { createdAt: { equals: leadsCursor.t }, id: { lt: leadsCursor.id } },
      ];
    }

    [unlinkedLeadsRaw, totalUnlinkedLeads] = await Promise.all([
      (prisma as any).portalLead.findMany({
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
      (prisma as any).portalLead.count({ where: { ownerId, contactId: null } }),
    ]);
  } catch (e: any) {
    if (!isMissingRelationError(e)) {
      // ignore other lead failures; contacts are still useful.
    }
  }

  const leadsHasMore = unlinkedLeadsRaw.length > take;
  const unlinkedLeads = leadsHasMore ? unlinkedLeadsRaw.slice(0, take) : unlinkedLeadsRaw;
  const unlinkedLeadsNextCursor = leadsHasMore
    ? (() => {
        const last = unlinkedLeads[unlinkedLeads.length - 1];
        return last?.createdAt ? makeCursor(last.createdAt, String(last.id)) : null;
      })()
    : null;

  const payload: any = {
    ok: true,
    totalContacts,
    totalUnlinkedLeads,
    contactsNextCursor,
    unlinkedLeadsNextCursor,
    contacts: contacts.map((c) => {
      const cid = String(c.id);
      return {
        id: cid,
        name: c.name,
        email: c.email,
        phone: c.phone,
        createdAtIso: c.createdAt ? c.createdAt.toISOString() : null,
        updatedAtIso: c.updatedAt ? c.updatedAt.toISOString() : null,
        tags: tagsByContactId.get(cid) || [],
      };
    }),
    unlinkedLeads: unlinkedLeads.map((l) => ({
      id: String(l.id),
      businessName: l.businessName,
      email: l.email,
      phone: l.phone,
      website: l.website,
      createdAtIso: l.createdAt ? l.createdAt.toISOString() : null,
      assignedToUserId: l.assignedToUserId,
    })),
  };

  if (debugEnabled) {
    payload.debug = {
      ownerId,
      returnedContacts: contacts.length,
      totalContacts,
      returnedUnlinkedLeads: unlinkedLeads.length,
      totalUnlinkedLeads,
      contactsSampleIds: contacts.slice(0, 5).map((c) => String(c.id)),
    };
  }

  return NextResponse.json(payload);
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
  const customVariables =
    body?.customVariables && typeof body.customVariables === "object" && !Array.isArray(body.customVariables)
      ? (body.customVariables as Record<string, string>)
      : null;

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
    customVariables,
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
