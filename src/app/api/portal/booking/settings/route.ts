import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

  photoUrl: z.string().trim().max(500).optional().nullable(),
  meetingLocation: z.string().trim().max(120).optional().nullable(),
  meetingDetails: z.string().trim().max(600).optional().nullable(),
  appointmentPurpose: z.string().trim().max(600).optional().nullable(),
  toneDirection: z.string().trim().max(600).optional().nullable(),
  notificationEmails: z.array(z.string().trim().email()).max(20).optional().nullable(),
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
      photoUrl: true,
      notificationEmails: true,
      appointmentPurpose: true,
      toneDirection: true,
      meetingLocation: true,
      meetingDetails: true,
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
      photoUrl: true,
      notificationEmails: true,
      appointmentPurpose: true,
      toneDirection: true,
      meetingLocation: true,
      meetingDetails: true,
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
      photoUrl: site.photoUrl ?? null,
      meetingLocation: site.meetingLocation ?? null,
      meetingDetails: site.meetingDetails ?? null,
      appointmentPurpose: site.appointmentPurpose ?? null,
      toneDirection: site.toneDirection ?? null,
      notificationEmails: (site.notificationEmails as unknown) ?? null,
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

      photoUrl: parsed.data.photoUrl === null ? null : parsed.data.photoUrl ?? undefined,
      meetingLocation: parsed.data.meetingLocation === null ? null : parsed.data.meetingLocation ?? undefined,
      meetingDetails: parsed.data.meetingDetails === null ? null : parsed.data.meetingDetails ?? undefined,
      appointmentPurpose: parsed.data.appointmentPurpose === null ? null : parsed.data.appointmentPurpose ?? undefined,
      toneDirection: parsed.data.toneDirection === null ? null : parsed.data.toneDirection ?? undefined,
      notificationEmails:
        parsed.data.notificationEmails === null
          ? Prisma.DbNull
          : parsed.data.notificationEmails
            ? (parsed.data.notificationEmails.length ? parsed.data.notificationEmails : Prisma.DbNull)
            : undefined,
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
      photoUrl: true,
      notificationEmails: true,
      appointmentPurpose: true,
      toneDirection: true,
      meetingLocation: true,
      meetingDetails: true,
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
      photoUrl: updated.photoUrl ?? null,
      meetingLocation: updated.meetingLocation ?? null,
      meetingDetails: updated.meetingDetails ?? null,
      appointmentPurpose: updated.appointmentPurpose ?? null,
      toneDirection: updated.toneDirection ?? null,
      notificationEmails: (updated.notificationEmails as unknown) ?? null,
      updatedAt: updated.updatedAt,
    },
  });
}
