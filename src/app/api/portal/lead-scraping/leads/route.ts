import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  take: z.number().int().min(1).max(500).default(200),
  q: z.string().trim().max(200).default(""),
  kind: z.enum(["B2B", "B2C"]).optional(),
  ids: z.array(z.string().trim().max(120)).max(500).optional(),
  recentBatch: z.boolean().optional(),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeStringArray(value: unknown, limit: number) {
  const arr = Array.isArray(value) ? value : [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const entry of arr) {
    const text = String(entry || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    next.push(text);
    if (next.length >= limit) break;
  }
  return next;
}

function extractAiVerification(dataJson: unknown) {
  const root = asRecord(dataJson);
  const verification = asRecord(root?.aiVerification);
  if (!verification) {
    return {
      synopsis: null,
      contactPerson: null,
      alternateEmails: [] as string[],
      secondaryPhones: [] as string[],
      businessFacts: [] as string[],
      isChain: null as boolean | null,
    };
  }

  return {
    synopsis: typeof verification.synopsis === "string" ? String(verification.synopsis).trim().slice(0, 600) || null : null,
    contactPerson: typeof verification.contactPerson === "string" ? String(verification.contactPerson).trim().slice(0, 160) || null : null,
    alternateEmails: normalizeStringArray(verification.alternateEmails, 6),
    secondaryPhones: normalizeStringArray(verification.secondaryPhones, 6),
    businessFacts: normalizeStringArray(verification.businessFacts, 8),
    isChain: typeof verification.isChain === "boolean" ? verification.isChain : null,
  };
}

function isMissingColumnError(e: unknown) {
  const anyErr = e as any;
  if (anyErr && typeof anyErr === "object" && typeof anyErr.code === "string") {
    // Prisma: column does not exist
    if (anyErr.code === "P2022") return true;
  }
  const msg = e instanceof Error ? e.message : "";
  return msg.includes("does not exist") && msg.includes("column");
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractCoordinates(dataJson: unknown): { latitude: number; longitude: number } | null {
  const root = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? (dataJson as Record<string, unknown>) : null;
  if (!root) return null;

  const googlePlaces =
    root.googlePlaces && typeof root.googlePlaces === "object" && !Array.isArray(root.googlePlaces)
      ? (root.googlePlaces as Record<string, unknown>)
      : null;
  const googleLocation =
    googlePlaces?.location && typeof googlePlaces.location === "object" && !Array.isArray(googlePlaces.location)
      ? (googlePlaces.location as Record<string, unknown>)
      : null;
  const googleDetails =
    googlePlaces?.details && typeof googlePlaces.details === "object" && !Array.isArray(googlePlaces.details)
      ? (googlePlaces.details as Record<string, unknown>)
      : null;
  const googleDetailsLocation =
    googleDetails?.location && typeof googleDetails.location === "object" && !Array.isArray(googleDetails.location)
      ? (googleDetails.location as Record<string, unknown>)
      : null;
  const legacyGeometry =
    googleDetails?.geometry && typeof googleDetails.geometry === "object" && !Array.isArray(googleDetails.geometry)
      ? (googleDetails.geometry as Record<string, unknown>)
      : null;
  const legacyGeometryLocation =
    legacyGeometry?.location && typeof legacyGeometry.location === "object" && !Array.isArray(legacyGeometry.location)
      ? (legacyGeometry.location as Record<string, unknown>)
      : null;

  const googleLatitude =
    toFiniteNumber(googleLocation?.latitude) ??
    toFiniteNumber(googleLocation?.lat) ??
    toFiniteNumber(googleDetailsLocation?.latitude) ??
    toFiniteNumber(googleDetailsLocation?.lat) ??
    toFiniteNumber(legacyGeometryLocation?.lat);
  const googleLongitude =
    toFiniteNumber(googleLocation?.longitude) ??
    toFiniteNumber(googleLocation?.lng) ??
    toFiniteNumber(googleDetailsLocation?.longitude) ??
    toFiniteNumber(googleDetailsLocation?.lng) ??
    toFiniteNumber(legacyGeometryLocation?.lng);
  if (googleLatitude !== null && googleLongitude !== null) {
    return { latitude: googleLatitude, longitude: googleLongitude };
  }

  const osm = root.osm && typeof root.osm === "object" && !Array.isArray(root.osm) ? (root.osm as Record<string, unknown>) : null;
  const osmElement =
    osm?.element && typeof osm.element === "object" && !Array.isArray(osm.element)
      ? (osm.element as Record<string, unknown>)
      : null;
  const osmCenter =
    osmElement?.center && typeof osmElement.center === "object" && !Array.isArray(osmElement.center)
      ? (osmElement.center as Record<string, unknown>)
      : null;

  const osmLatitude = toFiniteNumber(osmElement?.lat) ?? toFiniteNumber(osmCenter?.lat);
  const osmLongitude = toFiniteNumber(osmElement?.lon) ?? toFiniteNumber(osmCenter?.lon);
  if (osmLatitude !== null && osmLongitude !== null) {
    return { latitude: osmLatitude, longitude: osmLongitude };
  }

  return null;
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const url = new URL(req.url);
  const includeCounts = url.searchParams.get("includeCounts") !== "0";
  const includeContactTags = url.searchParams.get("includeContactTags") !== "0";
  const takeRaw = url.searchParams.get("take");
  const qRaw = url.searchParams.get("q");
  const kindRaw = url.searchParams.get("kind");
  const idsRaw = url.searchParams.getAll("id");
  const recentBatchRaw = url.searchParams.get("recentBatch");

  if (includeContactTags) {
    await ensurePortalContactTagsReady().catch(() => null);
  }
  const hasEmail = await hasPublicColumn("PortalLead", "email").catch(() => false);
  const hasStarred = await hasPublicColumn("PortalLead", "starred").catch(() => false);
  const hasTag = await hasPublicColumn("PortalLead", "tag").catch(() => false);
  const hasTagColor = await hasPublicColumn("PortalLead", "tagColor").catch(() => false);
  const hasContactId = await hasPublicColumn("PortalLead", "contactId").catch(() => false);
  const hasAssignedToUserId = await hasPublicColumn("PortalLead", "assignedToUserId").catch(() => false);
  const parsed = querySchema.safeParse({
    take: takeRaw ? Number(takeRaw) : undefined,
    q: qRaw ?? undefined,
    kind: kindRaw ?? undefined,
    ids: idsRaw,
    recentBatch: recentBatchRaw === "1" ? true : undefined,
  });
  const take = parsed.success ? parsed.data.take : 200;
  const q = parsed.success ? parsed.data.q : "";
  const kind = parsed.success ? parsed.data.kind : undefined;
  const ids = parsed.success ? (parsed.data.ids ?? []).map((value) => String(value || "").trim()).filter(Boolean).slice(0, 500) : [];
  const recentBatch = parsed.success ? parsed.data.recentBatch === true : false;

  let effectiveIds = ids;

  if (recentBatch && !effectiveIds.length) {
    const batchKind = kind ?? "B2B";
    const latestLead = await prisma.portalLead.findFirst({
      where: { ownerId, kind: batchKind },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }).catch(() => null);

    if (latestLead?.createdAt) {
      const newestCreatedAt = latestLead.createdAt.getTime();
      const upperBound = new Date(newestCreatedAt + 2 * 60 * 1000);
      const lowerBound = new Date(newestCreatedAt - 6 * 60 * 60 * 1000);
      const recentRows = await prisma.portalLead.findMany({
        where: {
          ownerId,
          kind: batchKind,
          createdAt: {
            gte: lowerBound,
            lte: upperBound,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 150,
        select: { id: true, createdAt: true },
      }).catch(() => [] as Array<{ id: string; createdAt: Date }>);

      effectiveIds = recentRows
        .filter((row) => newestCreatedAt - row.createdAt.getTime() <= 45 * 60 * 1000)
        .map((row) => String(row.id))
        .filter(Boolean)
        .slice(0, 150);
    }
  }

  const search = q.trim();
  const baseWhere = kind
    ? ({ ownerId, kind, ...(effectiveIds.length ? { id: { in: effectiveIds } } : {}) } as const)
    : ({ ownerId, ...(effectiveIds.length ? { id: { in: effectiveIds } } : {}) } as const);
  const searchWhere = search
    ? {
        ...baseWhere,
        OR: [
          { businessName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
          { website: { contains: search, mode: "insensitive" as const } },
          { address: { contains: search, mode: "insensitive" as const } },
          { niche: { contains: search, mode: "insensitive" as const } },
          { placeId: { contains: search, mode: "insensitive" as const } },
          { tag: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : baseWhere;

  const result = await (async () => {
    try {
      const select = {
        id: true,
        kind: true,
        source: true,
        businessName: true,
        ...(hasEmail ? ({ email: true } as any) : {}),
        phone: true,
        website: true,
        address: true,
        niche: true,
        placeId: true,
        dataJson: true,
        ...(hasStarred ? ({ starred: true } as any) : {}),
        ...(hasTag ? ({ tag: true } as any) : {}),
        ...(hasTagColor ? ({ tagColor: true } as any) : {}),
        createdAt: true,
        ...(hasContactId ? ({ contactId: true } as any) : {}),
        ...(hasAssignedToUserId ? ({ assignedToUserId: true } as any) : {}),
      } as any;
      const orderBy = hasStarred ? ([{ starred: "desc" }, { createdAt: "desc" }] as any[]) : ([{ createdAt: "desc" }] as any[]);

      if (recentBatch && !effectiveIds.length) {
        return { totalCount: null, matchedCount: null, leads: [] };
      }

      if (!includeCounts) {
        const leads = await prisma.portalLead.findMany({
          where: searchWhere as any,
          orderBy,
          take,
          select,
        });

        return { totalCount: null, matchedCount: null, leads };
      }

      const [totalCount, matchedCount, leads] = await prisma.$transaction([
        prisma.portalLead.count({ where: baseWhere }),
        prisma.portalLead.count({ where: searchWhere as any }),
        prisma.portalLead.findMany({
          where: searchWhere as any,
          orderBy,
          take,
          select,
        }),
      ]);

      return { totalCount, matchedCount, leads };
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;

      // Backwards compatible read (when DB migrations haven't been applied yet).
      const legacyWhere = search
        ? {
            ...baseWhere,
            OR: [
              { businessName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { website: { contains: search, mode: "insensitive" as const } },
              { address: { contains: search, mode: "insensitive" as const } },
              { niche: { contains: search, mode: "insensitive" as const } },
              { placeId: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : baseWhere;

      if (!includeCounts) {
        const legacy = await prisma.portalLead.findMany({
          where: legacyWhere as any,
          orderBy: [{ createdAt: "desc" }],
          take,
          select: {
            id: true,
            kind: true,
            source: true,
            businessName: true,
            phone: true,
            website: true,
            address: true,
            niche: true,
            placeId: true,
            createdAt: true,
          },
        });

        return {
          totalCount: null,
          matchedCount: null,
          leads: legacy.map((l) => ({
            ...l,
            email: null as string | null,
            starred: false as boolean,
            tag: null as string | null,
            tagColor: null as string | null,
          })),
        };
      }

      const [totalCount, matchedCount, legacy] = await prisma.$transaction([
        prisma.portalLead.count({ where: baseWhere }),
        prisma.portalLead.count({ where: legacyWhere as any }),
        prisma.portalLead.findMany({
          where: legacyWhere as any,
          orderBy: [{ createdAt: "desc" }],
          take,
          select: {
            id: true,
            kind: true,
            source: true,
            businessName: true,
            phone: true,
            website: true,
            address: true,
            niche: true,
            placeId: true,
            createdAt: true,
          },
        }),
      ]);

      return {
        totalCount,
        matchedCount,
        leads: legacy.map((l) => ({
          ...l,
          email: null as string | null,
          starred: false as boolean,
          tag: null as string | null,
          tagColor: null as string | null,
        })),
      };
    }
  })();

  const normalized = result.leads.map((l) => ({
    id: l.id,
    kind: l.kind,
    source: l.source,
    businessName: l.businessName,
    email: l.email ?? null,
    phone: l.phone,
    website: l.website,
    address: l.address,
    niche: l.niche,
    placeId: l.placeId,
    starred: Boolean(l.starred),
    tag: (l as any).tag ?? null,
    tagColor: (l as any).tagColor ?? null,
    contactId: hasContactId ? ((l as any).contactId ?? null) : null,
    assignedToUserId: hasAssignedToUserId ? ((l as any).assignedToUserId ?? null) : null,
    assignedToUserIds:
      (l as any).dataJson &&
      typeof (l as any).dataJson === "object" &&
      !Array.isArray((l as any).dataJson) &&
      Array.isArray(((l as any).dataJson as Record<string, unknown>).assignedToUserIds)
        ? Array.from(
            new Set(
              ((((l as any).dataJson as Record<string, unknown>).assignedToUserIds as unknown[]) || [])
                .map((value) => String(value || "").trim())
                .filter(Boolean),
            ),
          )
        : hasAssignedToUserId && (l as any).assignedToUserId
          ? [String((l as any).assignedToUserId)]
          : [],
    dataJson: (l as any).dataJson ?? null,
    createdAtIso: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
  }));

  const withCoordinates = normalized.map((lead) => {
    const stored = extractCoordinates((lead as any).dataJson);
    return {
      ...lead,
      latitude: stored?.latitude ?? null,
      longitude: stored?.longitude ?? null,
    };
  });

  const contactIds = includeContactTags
    ? Array.from(new Set(withCoordinates.map((l) => String(l.contactId || "")).filter(Boolean)))
    : [];
  const tagsByContactId = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
  if (includeContactTags && contactIds.length) {
    try {
      const rows = await (prisma as any).portalContactTagAssignment.findMany({
        where: { ownerId, contactId: { in: contactIds } },
        take: 6000,
        select: { contactId: true, tag: { select: { id: true, name: true, color: true } } },
      });

      for (const r of rows || []) {
        const cid = String(r.contactId);
        const t = r.tag;
        if (!t) continue;
        const list = tagsByContactId.get(cid) || [];
        list.push({ id: String(t.id), name: String(t.name), color: t.color ? String(t.color) : null });
        tagsByContactId.set(cid, list);
      }
    } catch {
      // ignore
    }
  }

  const withTags = withCoordinates.map((l) => ({
    ...extractAiVerification((l as any).dataJson),
    id: l.id,
    kind: l.kind,
    source: l.source,
    businessName: l.businessName,
    email: l.email,
    phone: l.phone,
    website: l.website,
    address: l.address,
    niche: l.niche,
    placeId: l.placeId,
    starred: l.starred,
    tag: l.tag,
    tagColor: l.tagColor,
    latitude: l.latitude,
    longitude: l.longitude,
    createdAtIso: l.createdAtIso,
    contactId: l.contactId ? String(l.contactId) : null,
    assignedToUserId: l.assignedToUserId ? String(l.assignedToUserId) : null,
    assignedToUserIds: Array.isArray((l as any).assignedToUserIds) ? ((l as any).assignedToUserIds as string[]) : [],
    contactTags: includeContactTags && l.contactId ? tagsByContactId.get(String(l.contactId)) || [] : [],
  }));

  return NextResponse.json({ ok: true, totalCount: result.totalCount, matchedCount: result.matchedCount, leads: withTags });
}
