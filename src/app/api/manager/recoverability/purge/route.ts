import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { platformAdminAuthError } from "@/lib/platformAdminGrants";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import {
  getArchivedEntityRecord,
  purgeArchivedEntity,
  RECOVERABILITY_ENTITY_LABELS,
  RECOVERABILITY_ENTITY_TYPES,
} from "@/lib/recoverability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    ownerId: z.string().trim().min(1).max(120),
    entityId: z.string().trim().min(1).max(120),
    entityType: z.enum([
      RECOVERABILITY_ENTITY_TYPES.CONTACT,
      RECOVERABILITY_ENTITY_TYPES.TASK,
      RECOVERABILITY_ENTITY_TYPES.BLOG_POST,
    ]),
    reason: z.string().trim().min(1).max(500),
    confirmation: z.literal("PURGE"),
  })
  .strict();

function safeString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function safeArchiveMetadata(archiveRecord: Awaited<ReturnType<typeof getArchivedEntityRecord>>) {
  if (!archiveRecord?.data) return null;
  return {
    name: safeString(archiveRecord.data.name, 200),
    title: safeString(archiveRecord.data.title, 240),
    email: safeString(archiveRecord.data.email, 320),
    slug: safeString(archiveRecord.data.slug, 160),
    status: safeString(archiveRecord.data.status, 80),
  };
}

function dependencySummaryToMessage(summary: Record<string, number>) {
  const active = Object.entries(summary).filter(([, value]) => value > 0);
  if (!active.length) return null;
  return active.map(([label, value]) => `${label}: ${value}`).join(", ");
}

export async function POST(req: Request) {
  const auth = await requirePlatformAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: platformAdminAuthError(auth.status) }, { status: auth.status });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const { ownerId, entityId, entityType, reason } = parsed.data;

  const archiveRecord = await getArchivedEntityRecord({ ownerId, entityType, entityId });
  if (!archiveRecord || archiveRecord.restoredAtIso || archiveRecord.purgedAtIso) {
    return NextResponse.json({ ok: false, error: "Archived record not found" }, { status: 404 });
  }

  try {
    if (entityType === RECOVERABILITY_ENTITY_TYPES.CONTACT) {
      const existing = await prisma.portalContact.findFirst({
        where: { id: entityId, ownerId },
        select: {
          id: true,
          name: true,
          email: true,
          _count: {
            select: {
              bookings: true,
              reviews: true,
              inboxThreads: true,
              portalLeads: true,
              creditPulls: true,
              creditDisputeLetters: true,
              creditReports: true,
            },
          },
        },
      });

      if (existing) {
        const dependencySummary = {
          bookings: existing._count.bookings,
          reviews: existing._count.reviews,
          inboxThreads: existing._count.inboxThreads,
          portalLeads: existing._count.portalLeads,
          creditPulls: existing._count.creditPulls,
          creditDisputeLetters: existing._count.creditDisputeLetters,
          creditReports: existing._count.creditReports,
        };
        const dependencyMessage = dependencySummaryToMessage(dependencySummary);

        if (dependencyMessage) {
          return NextResponse.json(
            {
              ok: false,
              error: `Permanent purge is blocked for this contact because dependent records still exist: ${dependencyMessage}. Use the separate legal/privacy deletion path when required.`,
            },
            { status: 409 },
          );
        }

        await prisma.portalContact.delete({ where: { id: existing.id } });

        const purged = await purgeArchivedEntity({
          ownerId,
          entityType,
          entityId,
          actorUserId: auth.userId,
          reason,
          metadata: {
            name: existing.name,
            email: existing.email,
          },
        });

        return NextResponse.json({ ok: purged.ok, purged: purged.purged });
      }

      const purged = await purgeArchivedEntity({
        ownerId,
        entityType,
        entityId,
        actorUserId: auth.userId,
        reason,
        metadata: safeArchiveMetadata(archiveRecord),
      });

      return NextResponse.json({ ok: purged.ok, purged: purged.purged });
    }

    if (entityType === RECOVERABILITY_ENTITY_TYPES.TASK) {
      await ensurePortalTasksSchema();

      const existingRows = (await prisma.$queryRawUnsafe(
        `SELECT "id", "title" FROM "PortalTask" WHERE "ownerId" = $1 AND "id" = $2 LIMIT 1`,
        ownerId,
        entityId,
      )) as Array<{ id?: string | null; title?: string | null }>;

      if (existingRows[0]?.id) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "PortalTaskMemberCompletion" WHERE "ownerId" = $1 AND "taskId" = $2`,
          ownerId,
          entityId,
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "PortalTask" WHERE "ownerId" = $1 AND "id" = $2`,
          ownerId,
          entityId,
        );
      }

      const purged = await purgeArchivedEntity({
        ownerId,
        entityType,
        entityId,
        actorUserId: auth.userId,
        reason,
        metadata: {
          title: existingRows[0]?.title ? String(existingRows[0].title) : safeArchiveMetadata(archiveRecord)?.title,
        },
      });

      return NextResponse.json({ ok: purged.ok, purged: purged.purged });
    }

    const existingPost = await prisma.clientBlogPost.findFirst({
      where: { id: entityId, site: { ownerId } },
      select: { id: true, title: true, slug: true, status: true },
    });

    if (existingPost) {
      await prisma.clientBlogPost.delete({ where: { id: existingPost.id } });
    }

    const purged = await purgeArchivedEntity({
      ownerId,
      entityType,
      entityId,
      actorUserId: auth.userId,
      reason,
      metadata: {
        title: existingPost?.title || safeArchiveMetadata(archiveRecord)?.title,
        slug: existingPost?.slug || safeArchiveMetadata(archiveRecord)?.slug,
        status: existingPost?.status || safeArchiveMetadata(archiveRecord)?.status,
      },
    });

    return NextResponse.json({ ok: purged.ok, purged: purged.purged });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        {
          ok: false,
          error: `Permanent purge is blocked for this ${RECOVERABILITY_ENTITY_LABELS[entityType].toLowerCase()} because dependent records still exist.`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Purge failed" },
      { status: 500 },
    );
  }
}