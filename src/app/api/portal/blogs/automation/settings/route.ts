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
  contextFiles?: AutomationContextFile[];
  cursor?: number;
  autoPublish?: boolean;
  lastRunAt?: string;
};

type AutomationContextFile = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tag: string;
  shareUrl: string;
  previewUrl?: string;
  createdAt?: string;
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

function normalizeContextFiles(items: unknown): AutomationContextFile[] {
  if (!Array.isArray(items)) return [];
  const out: AutomationContextFile[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as any).id || "").trim().slice(0, 120);
    const fileName = String((item as any).fileName || "").trim().slice(0, 260);
    const mimeType = String((item as any).mimeType || "application/octet-stream").trim().slice(0, 200);
    const fileSize = Number.isFinite((item as any).fileSize) ? Math.max(0, Math.floor(Number((item as any).fileSize))) : 0;
    const tag = String((item as any).tag || "").trim().slice(0, 120);
    const shareUrl = String((item as any).shareUrl || "").trim().slice(0, 2000);
    const previewUrl = String((item as any).previewUrl || "").trim().slice(0, 2000);
    const createdAt = String((item as any).createdAt || "").trim().slice(0, 120);
    if (!id || !fileName || !shareUrl) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      fileName,
      mimeType,
      fileSize,
      tag,
      shareUrl,
      ...(previewUrl ? { previewUrl } : {}),
      ...(createdAt ? { createdAt } : {}),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function parseStored(value: unknown): Required<Pick<StoredSettings, "enabled" | "frequencyDays" | "topics" | "contextFiles" | "cursor" | "autoPublish">> & Pick<StoredSettings, "lastRunAt"> {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return {
    enabled: Boolean(rec?.enabled),
    frequencyDays: typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
      ? Math.min(30, Math.max(1, Math.floor(rec.frequencyDays)))
      : 7,
    topics: normalizeTopics(rec?.topics),
    contextFiles: normalizeContextFiles(rec?.contextFiles),
    cursor: typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0,
    autoPublish: Boolean(rec?.autoPublish),
    lastRunAt: typeof rec?.lastRunAt === "string" ? rec.lastRunAt : undefined,
  };
}

const putSchema = z.object({
  enabled: z.boolean(),
  frequencyDays: z.number().int().min(1).max(30),
  topics: z.array(z.string().trim().min(1).max(200)).max(50),
  contextFiles: z.array(
    z.object({
      id: z.string().trim().min(1).max(120),
      fileName: z.string().trim().min(1).max(260),
      mimeType: z.string().trim().min(1).max(200),
      fileSize: z.number().int().min(0).max(250 * 1024 * 1024),
      tag: z.string().trim().max(120).optional().default(""),
      shareUrl: z.string().trim().min(1).max(2000),
      previewUrl: z.string().trim().max(2000).optional(),
      createdAt: z.string().trim().max(120).optional(),
    }),
  ).max(12).optional().default([]),
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
    contextFiles: normalizeContextFiles(parsed.data.contextFiles),
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
