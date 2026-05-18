import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { platformAdminAuthError } from "@/lib/platformAdminGrants";
import {
  isEntityArchived,
  RECOVERABILITY_ENTITY_TYPES,
  restoreArchivedEntity,
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
  })
  .strict();

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

  if (!(await isEntityArchived({ ownerId, entityType, entityId }))) {
    return NextResponse.json({ ok: false, error: "Archived record not found" }, { status: 404 });
  }

  if (entityType === RECOVERABILITY_ENTITY_TYPES.CONTACT) {
    const existing = await prisma.portalContact.findFirst({
      where: { id: entityId, ownerId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });

    const restored = await restoreArchivedEntity({
      ownerId,
      entityType,
      entityId,
      actorUserId: auth.userId,
      reason,
      metadata: { name: existing.name, email: existing.email, phone: existing.phone },
    });

    return NextResponse.json({ ok: restored.ok, restored: restored.restored });
  }

  if (entityType === RECOVERABILITY_ENTITY_TYPES.TASK) {
    const existingRows = (await prisma.$queryRawUnsafe(
      `SELECT "id", "title" FROM "PortalTask" WHERE "ownerId" = $1 AND "id" = $2 LIMIT 1`,
      ownerId,
      entityId,
    )) as Array<{ id?: string | null; title?: string | null }>;

    if (!existingRows[0]?.id) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    const restored = await restoreArchivedEntity({
      ownerId,
      entityType,
      entityId,
      actorUserId: auth.userId,
      reason,
      metadata: { title: existingRows[0].title ? String(existingRows[0].title) : null },
    });

    return NextResponse.json({ ok: restored.ok, restored: restored.restored });
  }

  const existingPost = await prisma.clientBlogPost.findFirst({
    where: { id: entityId, site: { ownerId } },
    select: { id: true, title: true, slug: true, status: true },
  });

  if (!existingPost) {
    return NextResponse.json({ ok: false, error: "Blog post not found" }, { status: 404 });
  }

  await prisma.clientBlogPost.update({
    where: { id: existingPost.id },
    data: { archivedAt: null },
    select: { id: true },
  });

  const restored = await restoreArchivedEntity({
    ownerId,
    entityType,
    entityId,
    actorUserId: auth.userId,
    reason,
    metadata: { title: existingPost.title, slug: existingPost.slug, status: existingPost.status },
  });

  return NextResponse.json({ ok: restored.ok, restored: restored.restored });
}