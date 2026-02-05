import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";
import { hasPublicColumn } from "@/lib/dbSchema";

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

type BookingColumnFlags = {
  photoUrl: boolean;
  meetingLocation: boolean;
  meetingDetails: boolean;
  appointmentPurpose: boolean;
  toneDirection: boolean;
  notificationEmails: boolean;
};

async function getBookingColumnFlags(): Promise<BookingColumnFlags> {
  const [photoUrl, meetingLocation, meetingDetails, appointmentPurpose, toneDirection, notificationEmails] =
    await Promise.all([
      hasPublicColumn("PortalBookingSite", "photoUrl"),
      hasPublicColumn("PortalBookingSite", "meetingLocation"),
      hasPublicColumn("PortalBookingSite", "meetingDetails"),
      hasPublicColumn("PortalBookingSite", "appointmentPurpose"),
      hasPublicColumn("PortalBookingSite", "toneDirection"),
      hasPublicColumn("PortalBookingSite", "notificationEmails"),
    ]);

  return { photoUrl, meetingLocation, meetingDetails, appointmentPurpose, toneDirection, notificationEmails };
}

function bookingSelect(flags: BookingColumnFlags) {
  const select: Record<string, boolean> = {
    id: true,
    ownerId: true,
    slug: true,
    enabled: true,
    title: true,
    description: true,
    durationMinutes: true,
    timeZone: true,
    updatedAt: true,
  };

  if (flags.photoUrl) select.photoUrl = true;
  if (flags.notificationEmails) select.notificationEmails = true;
  if (flags.appointmentPurpose) select.appointmentPurpose = true;
  if (flags.toneDirection) select.toneDirection = true;
  if (flags.meetingLocation) select.meetingLocation = true;
  if (flags.meetingDetails) select.meetingDetails = true;

  return select as any;
}

async function ensureSite(ownerId: string, flags: BookingColumnFlags) {
  const existing = await prisma.portalBookingSite.findUnique({
    where: { ownerId },
    select: bookingSelect(flags),
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
    select: bookingSelect(flags),
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
  const flags = await getBookingColumnFlags();
  const site = (await ensureSite(ownerId, flags)) as any;

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
      photoUrl: flags.photoUrl ? (site.photoUrl ?? null) : null,
      meetingLocation: flags.meetingLocation ? (site.meetingLocation ?? null) : null,
      meetingDetails: flags.meetingDetails ? (site.meetingDetails ?? null) : null,
      appointmentPurpose: flags.appointmentPurpose ? (site.appointmentPurpose ?? null) : null,
      toneDirection: flags.toneDirection ? (site.toneDirection ?? null) : null,
      notificationEmails: flags.notificationEmails ? ((site.notificationEmails as unknown) ?? null) : null,
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
  const flags = await getBookingColumnFlags();
  const current = (await ensureSite(ownerId, flags)) as any;

  let nextSlug = parsed.data.slug ? slugify(parsed.data.slug) : undefined;
  if (nextSlug && nextSlug.length < 3) nextSlug = undefined;

  if (nextSlug && nextSlug !== current.slug) {
    const collision = await prisma.portalBookingSite.findUnique({ where: { slug: nextSlug } });
    if (collision) {
      return NextResponse.json({ error: "That booking link is already taken." }, { status: 409 });
    }
  }

  const data: Record<string, unknown> = {
    enabled: parsed.data.enabled ?? undefined,
    title: parsed.data.title ?? undefined,
    description: parsed.data.description === null ? null : parsed.data.description ?? undefined,
    durationMinutes: parsed.data.durationMinutes ?? undefined,
    timeZone: parsed.data.timeZone ?? undefined,
    slug: nextSlug ?? undefined,
  };

  if (flags.photoUrl) {
    data.photoUrl = parsed.data.photoUrl === null ? null : parsed.data.photoUrl ?? undefined;
  }
  if (flags.meetingLocation) {
    data.meetingLocation =
      parsed.data.meetingLocation === null ? null : parsed.data.meetingLocation ?? undefined;
  }
  if (flags.meetingDetails) {
    data.meetingDetails = parsed.data.meetingDetails === null ? null : parsed.data.meetingDetails ?? undefined;
  }
  if (flags.appointmentPurpose) {
    data.appointmentPurpose =
      parsed.data.appointmentPurpose === null ? null : parsed.data.appointmentPurpose ?? undefined;
  }
  if (flags.toneDirection) {
    data.toneDirection = parsed.data.toneDirection === null ? null : parsed.data.toneDirection ?? undefined;
  }
  if (flags.notificationEmails) {
    data.notificationEmails =
      parsed.data.notificationEmails === null
        ? Prisma.DbNull
        : parsed.data.notificationEmails
          ? (parsed.data.notificationEmails.length ? parsed.data.notificationEmails : Prisma.DbNull)
          : undefined;
  }

  const updated = await prisma.portalBookingSite.update({
    where: { ownerId },
    data: data as any,
    select: bookingSelect(flags),
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
      photoUrl: flags.photoUrl ? ((updated as any).photoUrl ?? null) : null,
      meetingLocation: flags.meetingLocation ? ((updated as any).meetingLocation ?? null) : null,
      meetingDetails: flags.meetingDetails ? ((updated as any).meetingDetails ?? null) : null,
      appointmentPurpose: flags.appointmentPurpose ? ((updated as any).appointmentPurpose ?? null) : null,
      toneDirection: flags.toneDirection ? ((updated as any).toneDirection ?? null) : null,
      notificationEmails: flags.notificationEmails ? (((updated as any).notificationEmails as unknown) ?? null) : null,
      updatedAt: updated.updatedAt,
    },
  });
}
