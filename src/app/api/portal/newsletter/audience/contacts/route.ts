import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  ids: z.string().trim().max(5000).optional(),
  take: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const n = Number.parseInt(String(v || ""), 10);
      if (!Number.isFinite(n)) return 50;
      return Math.max(1, Math.min(200, n));
    }),
});

const postSchema = z.object({
  contactIds: z.array(z.string().trim().min(1).max(80)).max(200),
});

function splitIds(value: string | undefined): string[] {
  if (!value) return [];
  const raw = value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 200) break;
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    ids: url.searchParams.get("ids") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
  }

  const ids = splitIds(parsed.data.ids);
  const q = (parsed.data.q || "").trim();
  const take = parsed.data.take;

  const where: any = { ownerId };
  if (ids.length) {
    where.id = { in: ids };
  } else if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  const contacts = await prisma.portalContact.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      updatedAt: true,
      tagAssignments: {
        select: {
          tag: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return NextResponse.json({
    ok: true,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
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
  });
}

function normalizeStrings(items: unknown, max: number) {
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
    if (out.length >= max) break;
  }
  return out;
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("newsletter", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
    select: { dataJson: true },
  });

  const current = existing?.dataJson && typeof existing.dataJson === "object" && !Array.isArray(existing.dataJson)
    ? (existing.dataJson as Record<string, unknown>)
    : {};
  const external = current.external && typeof current.external === "object" && !Array.isArray(current.external)
    ? (current.external as Record<string, unknown>)
    : {};
  const internal = current.internal && typeof current.internal === "object" && !Array.isArray(current.internal)
    ? (current.internal as Record<string, unknown>)
    : {};
  const audience = external.audience && typeof external.audience === "object" && !Array.isArray(external.audience)
    ? (external.audience as Record<string, unknown>)
    : {};

  const previousContactIds = normalizeStrings(audience.contactIds, 200);
  const nextContactIds = normalizeStrings([...previousContactIds, ...parsed.data.contactIds], 200);
  const next = {
    ...current,
    external: {
      ...external,
      audience: {
        ...audience,
        tagIds: normalizeStrings(audience.tagIds, 200),
        contactIds: nextContactIds,
        emails: normalizeStrings(audience.emails, 200),
        userIds: normalizeStrings(audience.userIds, 200),
        sendAllUsers: Boolean(audience.sendAllUsers),
      },
    },
    internal,
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
    create: { ownerId, serviceSlug: "newsletter", status: "IN_PROGRESS", dataJson: next as any },
    update: { dataJson: next as any },
    select: { id: true },
  });

  const added = Math.max(0, nextContactIds.length - previousContactIds.length);
  return NextResponse.json({ ok: true, added, total: nextContactIds.length });
}
