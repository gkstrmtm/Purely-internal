import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoredSettings = {
  enabled?: boolean;
  frequencyDays?: number;
  topics?: string[];
  cursor?: number;
  autoPublish?: boolean;
  lastRunAt?: string;
};

function normalizeTopics(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 50) break;
  }
  return out;
}

function parseStored(value: unknown): Required<Pick<StoredSettings, "enabled" | "frequencyDays" | "topics" | "cursor" | "autoPublish">> & Pick<StoredSettings, "lastRunAt"> {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return {
    enabled: Boolean(rec?.enabled),
    frequencyDays: typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
      ? Math.min(30, Math.max(1, Math.floor(rec.frequencyDays)))
      : 7,
    topics: normalizeTopics(rec?.topics),
    cursor: typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0,
    autoPublish: Boolean(rec?.autoPublish),
    lastRunAt: typeof rec?.lastRunAt === "string" ? rec.lastRunAt : undefined,
  };
}

const putSchema = z.object({
  enabled: z.boolean(),
  frequencyDays: z.number().int().min(1).max(30),
  topics: z.array(z.string().trim().min(1).max(200)).max(50),
  autoPublish: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireClientSessionForService("blogs");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
    select: { id: true, dataJson: true, updatedAt: true },
  });

  const parsed = parseStored(setup?.dataJson);

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
  let lastGeneratedAt: Date | null = null;
  if (site?.id) {
    const last = await prisma.clientBlogPost.findFirst({
      where: { siteId: site.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    lastGeneratedAt = last?.createdAt ?? null;
  }

  const nextDueAt = lastGeneratedAt
    ? new Date(lastGeneratedAt.getTime() + parsed.frequencyDays * 24 * 60 * 60 * 1000)
    : new Date();

  return NextResponse.json({
    ok: true,
    settings: {
      ...parsed,
      lastGeneratedAt: lastGeneratedAt ? lastGeneratedAt.toISOString() : null,
      nextDueAt: nextDueAt.toISOString(),
    },
  });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("blogs");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const ownerId = auth.session.user.id;

  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
    select: { dataJson: true },
  });
  const prev = parseStored(existing?.dataJson);

  const next: StoredSettings = {
    enabled: parsed.data.enabled,
    frequencyDays: parsed.data.frequencyDays,
    topics: normalizeTopics(parsed.data.topics),
    cursor: prev.cursor,
    autoPublish: Boolean(parsed.data.autoPublish),
    lastRunAt: prev.lastRunAt,
  };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
    create: { ownerId, serviceSlug: "blogs", status: "IN_PROGRESS", dataJson: next },
    update: { dataJson: next },
    select: { id: true, dataJson: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, settings: parseStored(row.dataJson), updatedAt: row.updatedAt.toISOString() });
}
