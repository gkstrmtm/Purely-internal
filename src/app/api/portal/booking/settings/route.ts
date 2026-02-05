import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  enabled: z.boolean().optional(),
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(400).optional().nullable(),
  durationMinutes: z.number().int().min(10).max(180).optional(),
  timeZone: z.string().min(1).max(80).optional(),
  slug: z.string().min(3).max(80).optional(),
});

async function ensureSite(ownerId: string) {
  const existing = await prisma.portalBookingSite.findUnique({
    where: { ownerId },
    select: {
      id: true,
      ownerId: true,
      slug: true,
      enabled: true,
      title: true,
      description: true,
      durationMinutes: true,
      timeZone: true,
      updatedAt: true,
    },
  });
  if (existing) return existing;

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true, timeZone: true } }),
    prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }),
  ]);

  const base = slugify(profile?.businessName ?? user?.name ?? user?.email?.split("@")[0] ?? "booking");
  const desired = base.length >= 3 ? base : "booking";

  let slug = desired;
  const collision = await prisma.portalBookingSite.findUnique({ where: { slug } });
  if (collision) {
    slug = `${desired}-${ownerId.slice(0, 6)}`;
  }

  const title = profile?.businessName?.trim() ? `Book with ${profile.businessName.trim()}` : "Book a call";

  return prisma.portalBookingSite.create({
    data: {
      ownerId,
      slug,
      title,
      timeZone: user?.timeZone ?? "America/New_York",
      durationMinutes: 30,
      enabled: false,
    },
    select: {
      id: true,
      ownerId: true,
      slug: true,
      enabled: true,
      title: true,
      description: true,
      durationMinutes: true,
      timeZone: true,
      updatedAt: true,
    },
  });
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const site = await ensureSite(ownerId);

  return NextResponse.json({
    ok: true,
    site: {
      id: site.id,
      slug: site.slug,
      enabled: site.enabled,
      title: site.title,
      description: site.description,
      durationMinutes: site.durationMinutes,
      timeZone: site.timeZone,
      updatedAt: site.updatedAt,
    },
  });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const current = await ensureSite(ownerId);

  let nextSlug = parsed.data.slug ? slugify(parsed.data.slug) : undefined;
  if (nextSlug && nextSlug.length < 3) nextSlug = undefined;

  if (nextSlug && nextSlug !== current.slug) {
    const collision = await prisma.portalBookingSite.findUnique({ where: { slug: nextSlug } });
    if (collision) {
      return NextResponse.json({ error: "That booking link is already taken." }, { status: 409 });
    }
  }

  const updated = await prisma.portalBookingSite.update({
    where: { ownerId },
    data: {
      enabled: parsed.data.enabled ?? undefined,
      title: parsed.data.title ?? undefined,
      description: parsed.data.description === null ? null : parsed.data.description ?? undefined,
      durationMinutes: parsed.data.durationMinutes ?? undefined,
      timeZone: parsed.data.timeZone ?? undefined,
      slug: nextSlug ?? undefined,
    },
    select: {
      id: true,
      ownerId: true,
      slug: true,
      enabled: true,
      title: true,
      description: true,
      durationMinutes: true,
      timeZone: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    site: {
      id: updated.id,
      slug: updated.slug,
      enabled: updated.enabled,
      title: updated.title,
      description: updated.description,
      durationMinutes: updated.durationMinutes,
      timeZone: updated.timeZone,
      updatedAt: updated.updatedAt,
    },
  });
}
