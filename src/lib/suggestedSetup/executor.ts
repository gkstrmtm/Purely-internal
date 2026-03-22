import crypto from "crypto";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { slugify } from "@/lib/slugify";
import { ensureStoredBlogSiteSlug, setStoredBlogSiteSlug } from "@/lib/blogSiteSlug";

import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";

export type ApplyResult = {
  ok: true;
  appliedIds: string[];
  skippedIds: string[];
} | {
  ok: false;
  error: string;
  appliedIds: string[];
  skippedIds: string[];
};

async function ensureUniqueBlogSlug(ownerId: string, desiredName: string): Promise<{ canUseSlugColumn: boolean; slug: string | null }> {
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  const base = slugify(desiredName) || "blog";
  const desired = base.length >= 3 ? base : "blog";

  if (!canUseSlugColumn) return { canUseSlugColumn, slug: desired };

  let slug = desired;
  const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } }).catch(() => null)) as any;
  if (collision && String(collision.ownerId) !== ownerId) {
    slug = `${desired}-${ownerId.slice(0, 6)}`;
  }
  return { canUseSlugColumn, slug };
}

async function applyBlogsCreateSite(ownerId: string, payload: Record<string, unknown>) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const desiredName = name || "Hosted site";

  const existing = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }).catch(() => null);
  if (existing?.id) return;

  const { canUseSlugColumn, slug } = await ensureUniqueBlogSlug(ownerId, desiredName);

  if (!canUseSlugColumn && slug) {
    try {
      await ensureStoredBlogSiteSlug(ownerId, desiredName);
      await setStoredBlogSiteSlug(ownerId, slug);
    } catch {
      // ignore
    }
  }

  const verificationToken = crypto.randomBytes(18).toString("hex");
  await (prisma.clientBlogSite as any).create({
    data: {
      ownerId,
      name: desiredName,
      primaryDomain: null,
      verifiedAt: null,
      verificationToken,
      ...(canUseSlugColumn ? { slug } : {}),
    },
    select: { id: true },
  });
}

async function applyBlogsAutomationSettings(ownerId: string, payload: Record<string, unknown>) {
  const enabled = payload.enabled === true;
  const frequencyDays = typeof payload.frequencyDays === "number" && Number.isFinite(payload.frequencyDays)
    ? Math.min(30, Math.max(1, Math.floor(payload.frequencyDays)))
    : 7;
  const autoPublish = payload.autoPublish === true;
  const topics = Array.isArray(payload.topics)
    ? payload.topics.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean).slice(0, 50)
    : [];

  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
    select: { dataJson: true },
  }).catch(() => null);

  const prev = existing?.dataJson && typeof existing.dataJson === "object" ? (existing.dataJson as any) : null;
  const cursor = typeof prev?.cursor === "number" && Number.isFinite(prev.cursor) ? Math.max(0, Math.floor(prev.cursor)) : 0;
  const lastRunAt = typeof prev?.lastRunAt === "string" ? prev.lastRunAt : undefined;

  const next = { enabled, frequencyDays, topics, cursor, autoPublish, lastRunAt };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
    create: { ownerId, serviceSlug: "blogs", status: "IN_PROGRESS", dataJson: next },
    update: { dataJson: next },
    select: { id: true },
  });
}

export async function applySuggestedSetupActions(opts: {
  ownerId: string;
  actions: SuggestedSetupAction[];
}): Promise<ApplyResult> {
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const action of opts.actions) {
    try {
      if (action.kind === "blogs.createSite") {
        await applyBlogsCreateSite(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "blogs.setAutomationSettings") {
        await applyBlogsAutomationSettings(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      skippedIds.push(action.id);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Apply failed",
        appliedIds,
        skippedIds: [...skippedIds, action.id],
      };
    }
  }

  return { ok: true, appliedIds, skippedIds };
}
