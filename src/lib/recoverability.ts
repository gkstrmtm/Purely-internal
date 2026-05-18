import crypto from "crypto";

import { prisma } from "@/lib/db";

export const RECOVERABILITY_ENTITY_TYPES = {
  CONTACT: "portal_contact",
  TASK: "portal_task",
  BLOG_POST: "client_blog_post",
} as const;

export type RecoverabilityEntityType = (typeof RECOVERABILITY_ENTITY_TYPES)[keyof typeof RECOVERABILITY_ENTITY_TYPES];

export const RECOVERABILITY_ENTITY_LABELS: Record<RecoverabilityEntityType, string> = {
  [RECOVERABILITY_ENTITY_TYPES.CONTACT]: "Contact",
  [RECOVERABILITY_ENTITY_TYPES.TASK]: "Task",
  [RECOVERABILITY_ENTITY_TYPES.BLOG_POST]: "Blog post",
};

export const DEFAULT_RECOVERABILITY_RETENTION_DAYS = 30;

export type ArchivedRecordSearchResult = {
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  entityType: RecoverabilityEntityType;
  entityId: string;
  archivedAtIso: string;
  archivedByUserId: string | null;
  archivedByName: string | null;
  archivedByEmail: string | null;
  name: string | null;
  title: string | null;
  email: string | null;
  slug: string | null;
  status: string | null;
};

type RecoverabilityAction = "ARCHIVE" | "RESTORE" | "PURGE";

type ArchivedEntityRecord = {
  ownerId: string;
  entityType: RecoverabilityEntityType;
  entityId: string;
  archivedAtIso: string;
  archivedByUserId: string | null;
  restoredAtIso: string | null;
  purgedAtIso: string | null;
  data: Record<string, unknown> | null;
};

function cleanText(value: unknown, maxLength: number) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function encodeMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return JSON.stringify(metadata);
}

function decodeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

function sanitizePurgeMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const safeMetadata: Record<string, unknown> = {};

  for (const key of ["name", "title", "email", "slug", "status"] as const) {
    const value = cleanText(metadata[key], key === "title" ? 240 : key === "status" ? 80 : 320);
    if (value) safeMetadata[key] = value;
  }

  const dependencySummary = metadata.dependencySummary;
  if (dependencySummary && typeof dependencySummary === "object" && !Array.isArray(dependencySummary)) {
    const entries = Object.entries(dependencySummary)
      .map(([key, value]) => [cleanText(key, 80), Number(value)] as const)
      .filter(([key, value]) => key && Number.isFinite(value) && value > 0);
    if (entries.length) safeMetadata.dependencySummary = Object.fromEntries(entries);
  }

  return Object.keys(safeMetadata).length ? safeMetadata : null;
}

export async function ensureRecoverabilitySchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RecoverableArchive" (
      "id" TEXT NOT NULL,
      "ownerId" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "archivedByUserId" TEXT,
      "archiveReason" TEXT,
      "restoredAt" TIMESTAMPTZ,
      "restoredByUserId" TEXT,
      "purgedAt" TIMESTAMPTZ,
      "purgedByUserId" TEXT,
      "purgeReason" TEXT,
      "dataJson" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "RecoverableArchive_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "RecoverableArchive" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMPTZ;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "RecoverableArchive" ADD COLUMN IF NOT EXISTS "purgedByUserId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "RecoverableArchive" ADD COLUMN IF NOT EXISTS "purgeReason" TEXT;`);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "RecoverableArchive_ownerId_entityType_entityId_key"
    ON "RecoverableArchive" ("ownerId", "entityType", "entityId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RecoverableArchive_ownerId_entityType_restoredAt_idx"
    ON "RecoverableArchive" ("ownerId", "entityType", "restoredAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RecoverableArchive_ownerId_entityType_restoredAt_purgedAt_idx"
    ON "RecoverableArchive" ("ownerId", "entityType", "restoredAt", "purgedAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RecoverabilityAuditEvent" (
      "id" TEXT NOT NULL,
      "ownerId" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "actorUserId" TEXT,
      "reason" TEXT,
      "dataJson" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "RecoverabilityAuditEvent_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RecoverabilityAuditEvent_ownerId_createdAt_idx"
    ON "RecoverabilityAuditEvent" ("ownerId", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RecoverabilityAuditEvent_entity_idx"
    ON "RecoverabilityAuditEvent" ("entityType", "entityId", "createdAt");
  `);
}

async function writeRecoverabilityAuditEvent(input: {
  ownerId: string;
  entityType: RecoverabilityEntityType;
  entityId: string;
  action: RecoverabilityAction;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await ensureRecoverabilitySchema();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "RecoverabilityAuditEvent"
        ("id", "ownerId", "entityType", "entityId", "action", "actorUserId", "reason", "dataJson", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
    `,
    crypto.randomUUID().replace(/-/g, ""),
    input.ownerId,
    input.entityType,
    input.entityId,
    input.action,
    cleanText(input.actorUserId, 120),
    cleanText(input.reason, 500),
    encodeMetadata(input.metadata),
    new Date(),
  );
}

export async function archiveEntity(input: {
  ownerId: string;
  entityType: RecoverabilityEntityType;
  entityId: string;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await ensureRecoverabilitySchema();

  const existing = (await prisma.$queryRawUnsafe(
    `
      SELECT "archivedAt", "restoredAt"
      FROM "RecoverableArchive"
      WHERE "ownerId" = $1 AND "entityType" = $2 AND "entityId" = $3
      LIMIT 1
    `,
    input.ownerId,
    input.entityType,
    input.entityId,
  )) as Array<{ archivedAt?: Date | string | null; restoredAt?: Date | string | null }>;

  if (existing[0] && !existing[0].restoredAt) {
    return {
      ok: true as const,
      alreadyArchived: true as const,
      archivedAtIso: existing[0].archivedAt ? new Date(existing[0].archivedAt).toISOString() : null,
    };
  }

  const now = new Date();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "RecoverableArchive"
        ("id", "ownerId", "entityType", "entityId", "archivedAt", "archivedByUserId", "archiveReason", "restoredAt", "restoredByUserId", "dataJson", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8::jsonb, $5, $5)
      ON CONFLICT ("ownerId", "entityType", "entityId") DO UPDATE SET
        "archivedAt" = EXCLUDED."archivedAt",
        "archivedByUserId" = EXCLUDED."archivedByUserId",
        "archiveReason" = EXCLUDED."archiveReason",
        "restoredAt" = NULL,
        "restoredByUserId" = NULL,
        "purgedAt" = NULL,
        "purgedByUserId" = NULL,
        "purgeReason" = NULL,
        "dataJson" = COALESCE(EXCLUDED."dataJson", "RecoverableArchive"."dataJson"),
        "updatedAt" = EXCLUDED."updatedAt"
    `,
    crypto.randomUUID().replace(/-/g, ""),
    input.ownerId,
    input.entityType,
    input.entityId,
    now,
    cleanText(input.actorUserId, 120),
    cleanText(input.reason, 500),
    encodeMetadata(input.metadata),
  );

  await writeRecoverabilityAuditEvent({
    ownerId: input.ownerId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: "ARCHIVE",
    actorUserId: input.actorUserId,
    reason: input.reason,
    metadata: input.metadata,
  });

  return { ok: true as const, alreadyArchived: false as const, archivedAtIso: now.toISOString() };
}

export async function restoreArchivedEntity(input: {
  ownerId: string;
  entityType: RecoverabilityEntityType;
  entityId: string;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await ensureRecoverabilitySchema();

  const now = new Date();
  const updated = await prisma.$executeRawUnsafe(
    `
      UPDATE "RecoverableArchive"
      SET "restoredAt" = $1,
          "restoredByUserId" = $2,
          "updatedAt" = $1
      WHERE "ownerId" = $3
        AND "entityType" = $4
        AND "entityId" = $5
        AND "restoredAt" IS NULL
        AND "purgedAt" IS NULL
    `,
    now,
    cleanText(input.actorUserId, 120),
    input.ownerId,
    input.entityType,
    input.entityId,
  );

  if (!Number(updated)) return { ok: false as const, restored: false as const };

  await writeRecoverabilityAuditEvent({
    ownerId: input.ownerId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: "RESTORE",
    actorUserId: input.actorUserId,
    reason: input.reason,
    metadata: input.metadata,
  });

  return { ok: true as const, restored: true as const, restoredAtIso: now.toISOString() };
}

export async function getArchivedEntityRecord(input: {
  ownerId: string;
  entityType: RecoverabilityEntityType;
  entityId: string;
}) {
  await ensureRecoverabilitySchema();

  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT
        "ownerId",
        "entityType",
        "entityId",
        "archivedAt",
        "archivedByUserId",
        "restoredAt",
        "purgedAt",
        "dataJson"
      FROM "RecoverableArchive"
      WHERE "ownerId" = $1
        AND "entityType" = $2
        AND "entityId" = $3
      LIMIT 1
    `,
    input.ownerId,
    input.entityType,
    input.entityId,
  )) as Array<{
    ownerId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    archivedAt?: Date | string | null;
    archivedByUserId?: string | null;
    restoredAt?: Date | string | null;
    purgedAt?: Date | string | null;
    dataJson?: unknown;
  }>;

  const row = rows[0];
  const entityType = row?.entityType as RecoverabilityEntityType | null;
  if (!row?.ownerId || !entityType || !row.entityId || !row.archivedAt) return null;
  if (!Object.values(RECOVERABILITY_ENTITY_TYPES).includes(entityType)) return null;

  return {
    ownerId: String(row.ownerId),
    entityType,
    entityId: String(row.entityId),
    archivedAtIso: new Date(row.archivedAt).toISOString(),
    archivedByUserId: cleanText(row.archivedByUserId, 120),
    restoredAtIso: row.restoredAt ? new Date(row.restoredAt).toISOString() : null,
    purgedAtIso: row.purgedAt ? new Date(row.purgedAt).toISOString() : null,
    data: decodeMetadata(row.dataJson),
  } satisfies ArchivedEntityRecord;
}

export async function purgeArchivedEntity(input: {
  ownerId: string;
  entityType: RecoverabilityEntityType;
  entityId: string;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await ensureRecoverabilitySchema();

  const now = new Date();
  const safeMetadata = sanitizePurgeMetadata(input.metadata);
  const updated = await prisma.$executeRawUnsafe(
    `
      UPDATE "RecoverableArchive"
      SET "purgedAt" = $1,
          "purgedByUserId" = $2,
          "purgeReason" = $3,
          "dataJson" = $4::jsonb,
          "updatedAt" = $1
      WHERE "ownerId" = $5
        AND "entityType" = $6
        AND "entityId" = $7
        AND "restoredAt" IS NULL
        AND "purgedAt" IS NULL
    `,
    now,
    cleanText(input.actorUserId, 120),
    cleanText(input.reason, 500),
    encodeMetadata(safeMetadata),
    input.ownerId,
    input.entityType,
    input.entityId,
  );

  if (!Number(updated)) return { ok: false as const, purged: false as const };

  await writeRecoverabilityAuditEvent({
    ownerId: input.ownerId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: "PURGE",
    actorUserId: input.actorUserId,
    reason: input.reason,
    metadata: safeMetadata,
  });

  return { ok: true as const, purged: true as const, purgedAtIso: now.toISOString() };
}

export async function getActiveArchivedEntityIdSet(input: {
  ownerId: string;
  entityType: RecoverabilityEntityType;
  entityIds?: string[];
}) {
  await ensureRecoverabilitySchema();

  const ids = Array.from(new Set((input.entityIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  const params: unknown[] = [input.ownerId, input.entityType];
  let sql = `
    SELECT "entityId"
    FROM "RecoverableArchive"
    WHERE "ownerId" = $1
      AND "entityType" = $2
      AND "restoredAt" IS NULL
      AND "purgedAt" IS NULL
  `;

  if (ids.length) {
    const placeholders = ids.map((_, index) => `$${params.length + index + 1}`).join(", ");
    params.push(...ids);
    sql += ` AND "entityId" IN (${placeholders})`;
  }

  const rows = (await prisma.$queryRawUnsafe(sql, ...params)) as Array<{ entityId?: string | null }>;
  return new Set(rows.map((row) => String(row.entityId || "")).filter(Boolean));
}

export async function isEntityArchived(input: {
  ownerId: string;
  entityType: RecoverabilityEntityType;
  entityId: string;
}) {
  const ids = await getActiveArchivedEntityIdSet({
    ownerId: input.ownerId,
    entityType: input.entityType,
    entityIds: [input.entityId],
  });
  return ids.has(input.entityId);
}

export async function countActiveArchivedEntities(input: {
  ownerId: string;
  entityType: RecoverabilityEntityType;
}) {
  await ensureRecoverabilitySchema();

  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT COUNT(*)::int AS "count"
      FROM "RecoverableArchive"
      WHERE "ownerId" = $1
        AND "entityType" = $2
        AND "restoredAt" IS NULL
        AND "purgedAt" IS NULL
    `,
    input.ownerId,
    input.entityType,
  )) as Array<{ count?: number | string | null }>;

  return Number(rows[0]?.count || 0);
}

export async function searchArchivedEntities(input: {
  ownerId?: string | null;
  ownerQuery?: string | null;
  entityType?: RecoverabilityEntityType | null;
  archivedByQuery?: string | null;
  query?: string | null;
  archivedFrom?: Date | null;
  archivedTo?: Date | null;
  take?: number;
}) {
  await ensureRecoverabilitySchema();

  const params: unknown[] = [];
  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const whereParts = [`archive."restoredAt" IS NULL`, `archive."purgedAt" IS NULL`];
  const ownerId = cleanText(input.ownerId, 120);
  if (ownerId) whereParts.push(`archive."ownerId" = ${push(ownerId)}`);
  if (input.entityType) whereParts.push(`archive."entityType" = ${push(input.entityType)}`);

  const ownerQuery = cleanText(input.ownerQuery, 200)?.toLowerCase();
  if (ownerQuery) {
    const pattern = `%${ownerQuery}%`;
    const placeholder = push(pattern);
    whereParts.push(`(
      LOWER(COALESCE(owner."email", '')) LIKE ${placeholder}
      OR LOWER(COALESCE(owner."name", '')) LIKE ${placeholder}
      OR LOWER(archive."ownerId") LIKE ${placeholder}
    )`);
  }

  const archivedByQuery = cleanText(input.archivedByQuery, 200)?.toLowerCase();
  if (archivedByQuery) {
    const pattern = `%${archivedByQuery}%`;
    const placeholder = push(pattern);
    whereParts.push(`(
      LOWER(COALESCE(actor."email", '')) LIKE ${placeholder}
      OR LOWER(COALESCE(actor."name", '')) LIKE ${placeholder}
      OR LOWER(COALESCE(archive."archivedByUserId", '')) LIKE ${placeholder}
    )`);
  }

  const query = cleanText(input.query, 200)?.toLowerCase();
  if (query) {
    const pattern = `%${query}%`;
    const placeholder = push(pattern);
    whereParts.push(`(
      LOWER(COALESCE(archive."dataJson"->>'name', '')) LIKE ${placeholder}
      OR LOWER(COALESCE(archive."dataJson"->>'title', '')) LIKE ${placeholder}
      OR LOWER(COALESCE(archive."dataJson"->>'email', '')) LIKE ${placeholder}
      OR LOWER(COALESCE(archive."dataJson"->>'slug', '')) LIKE ${placeholder}
      OR LOWER(archive."entityId") LIKE ${placeholder}
    )`);
  }

  if (input.archivedFrom && Number.isFinite(input.archivedFrom.getTime())) {
    whereParts.push(`archive."archivedAt" >= ${push(input.archivedFrom)}`);
  }
  if (input.archivedTo && Number.isFinite(input.archivedTo.getTime())) {
    whereParts.push(`archive."archivedAt" <= ${push(input.archivedTo)}`);
  }

  const take = Math.max(1, Math.min(200, Number(input.take) || 50));
  const sql = `
    SELECT
      archive."ownerId",
      owner."name" AS "ownerName",
      owner."email" AS "ownerEmail",
      archive."entityType",
      archive."entityId",
      archive."archivedAt",
      archive."archivedByUserId",
      actor."name" AS "archivedByName",
      actor."email" AS "archivedByEmail",
      archive."dataJson"->>'name' AS "name",
      archive."dataJson"->>'title' AS "title",
      archive."dataJson"->>'email' AS "email",
      archive."dataJson"->>'slug' AS "slug",
      archive."dataJson"->>'status' AS "status"
    FROM "RecoverableArchive" archive
    LEFT JOIN "User" owner ON owner."id" = archive."ownerId"
    LEFT JOIN "User" actor ON actor."id" = archive."archivedByUserId"
    WHERE ${whereParts.join(" AND ")}
    ORDER BY archive."archivedAt" DESC
    LIMIT ${push(take)}
  `;

  const rows = (await prisma.$queryRawUnsafe(sql, ...params)) as Array<{
    ownerId?: string | null;
    ownerName?: string | null;
    ownerEmail?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    archivedAt?: Date | string | null;
    archivedByUserId?: string | null;
    archivedByName?: string | null;
    archivedByEmail?: string | null;
    name?: string | null;
    title?: string | null;
    email?: string | null;
    slug?: string | null;
    status?: string | null;
  }>;

  return rows
    .map((row) => {
      const entityType = row.entityType as RecoverabilityEntityType | null;
      if (!row.ownerId || !entityType || !row.entityId || !row.archivedAt) return null;
      if (!Object.values(RECOVERABILITY_ENTITY_TYPES).includes(entityType)) return null;
      return {
        ownerId: String(row.ownerId),
        ownerName: cleanText(row.ownerName, 200),
        ownerEmail: cleanText(row.ownerEmail, 320),
        entityType,
        entityId: String(row.entityId),
        archivedAtIso: new Date(row.archivedAt).toISOString(),
        archivedByUserId: cleanText(row.archivedByUserId, 120),
        archivedByName: cleanText(row.archivedByName, 200),
        archivedByEmail: cleanText(row.archivedByEmail, 320),
        name: cleanText(row.name, 200),
        title: cleanText(row.title, 240),
        email: cleanText(row.email, 320),
        slug: cleanText(row.slug, 160),
        status: cleanText(row.status, 80),
      } satisfies ArchivedRecordSearchResult;
    })
    .filter((row): row is ArchivedRecordSearchResult => Boolean(row));
}