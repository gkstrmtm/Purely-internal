import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { platformAdminAuthError } from "@/lib/platformAdminGrants";
import {
  RECOVERABILITY_ENTITY_LABELS,
  RECOVERABILITY_ENTITY_TYPES,
  searchArchivedEntities,
} from "@/lib/recoverability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  ownerId: z.string().trim().min(1).max(120).optional(),
  ownerQuery: z.string().trim().max(200).optional(),
  entityType: z
    .enum([
      RECOVERABILITY_ENTITY_TYPES.CONTACT,
      RECOVERABILITY_ENTITY_TYPES.TASK,
      RECOVERABILITY_ENTITY_TYPES.BLOG_POST,
    ])
    .optional(),
  archivedBy: z.string().trim().max(200).optional(),
  query: z.string().trim().max(200).optional(),
  archivedFrom: z.string().trim().max(40).optional(),
  archivedTo: z.string().trim().max(40).optional(),
  take: z.string().trim().max(4).optional(),
});

function parseDateParam(raw: string | undefined, endOfDay = false) {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const candidate = value.length <= 10
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(value);

  if (!Number.isFinite(candidate.getTime())) return null;
  return candidate;
}

function displayLabel(record: {
  entityType: keyof typeof RECOVERABILITY_ENTITY_LABELS;
  name: string | null;
  title: string | null;
  email: string | null;
  slug: string | null;
  entityId: string;
}) {
  if (record.entityType === RECOVERABILITY_ENTITY_TYPES.CONTACT) {
    return record.name || record.email || record.entityId;
  }
  if (record.entityType === RECOVERABILITY_ENTITY_TYPES.TASK) {
    return record.title || record.entityId;
  }
  return record.title || record.slug || record.entityId;
}

export async function GET(req: Request) {
  const auth = await requirePlatformAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: platformAdminAuthError(auth.status) }, { status: auth.status });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    ownerId: url.searchParams.get("ownerId") ?? undefined,
    ownerQuery: url.searchParams.get("ownerQuery") ?? undefined,
    entityType: url.searchParams.get("entityType") ?? undefined,
    archivedBy: url.searchParams.get("archivedBy") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
    archivedFrom: url.searchParams.get("archivedFrom") ?? undefined,
    archivedTo: url.searchParams.get("archivedTo") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
  }

  const archivedFrom = parseDateParam(parsed.data.archivedFrom, false);
  const archivedTo = parseDateParam(parsed.data.archivedTo, true);
  if ((parsed.data.archivedFrom && !archivedFrom) || (parsed.data.archivedTo && !archivedTo)) {
    return NextResponse.json({ ok: false, error: "Invalid archived date filter" }, { status: 400 });
  }

  const records = await searchArchivedEntities({
    ownerId: parsed.data.ownerId ?? null,
    ownerQuery: parsed.data.ownerQuery ?? null,
    entityType: parsed.data.entityType ?? null,
    archivedByQuery: parsed.data.archivedBy ?? null,
    query: parsed.data.query ?? null,
    archivedFrom,
    archivedTo,
    take: parsed.data.take ? Number.parseInt(parsed.data.take, 10) : 100,
  });

  return NextResponse.json({
    ok: true,
    records: records.map((record) => ({
      ownerId: record.ownerId,
      ownerLabel: record.ownerName || record.ownerEmail || record.ownerId,
      ownerEmail: record.ownerEmail,
      entityType: record.entityType,
      entityTypeLabel: RECOVERABILITY_ENTITY_LABELS[record.entityType],
      entityId: record.entityId,
      displayLabel: displayLabel(record),
      secondaryLabel:
        record.entityType === RECOVERABILITY_ENTITY_TYPES.CONTACT
          ? record.email
          : record.entityType === RECOVERABILITY_ENTITY_TYPES.BLOG_POST
            ? record.slug
            : null,
      archivedAtIso: record.archivedAtIso,
      archivedByUserId: record.archivedByUserId,
      archivedByLabel: record.archivedByName || record.archivedByEmail || record.archivedByUserId || "Unknown",
      metadata: {
        name: record.name,
        title: record.title,
        email: record.email,
        slug: record.slug,
        status: record.status,
      },
    })),
  });
}