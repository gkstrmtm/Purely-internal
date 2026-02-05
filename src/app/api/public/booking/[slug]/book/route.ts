import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  startAt: z.string().min(1),
  contactName: z.string().min(1).max(80),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(40).optional().nullable(),
  notes: z.string().max(1200).optional().nullable(),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function formatInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function sendEmail({
  to,
  subject,
  body,
  fromName,
}: {
  to: string[];
  subject: string;
  body: string;
  fromName?: string;
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) return;
  if (!to.length) return;

  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: to.map((email) => ({ email })) }],
      from: { email: fromEmail, name: fromName ?? "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  }).catch(() => null);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }

  const site = await prisma.portalBookingSite.findUnique({
    where: { slug },
    select: {
      id: true,
      enabled: true,
      ownerId: true,
      title: true,
      durationMinutes: true,
      timeZone: true,
      meetingLocation: true,
      meetingDetails: true,
      notificationEmails: true,
      owner: { select: { name: true, email: true } },
    },
  });
  if (!site || !site.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid time." }, { status: 400 });
  }

  const durationMinutes = site.durationMinutes;
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  // Ensure host has coverage at this slot.
  const coverage = await prisma.availabilityBlock.findFirst({
    where: { userId: site.ownerId, startAt: { lte: startAt }, endAt: { gte: endAt } },
    select: { id: true },
  });

  if (!coverage) {
    return NextResponse.json(
      { error: "That time just became unavailable. Please choose a different time." },
      { status: 409 },
    );
  }

  // Ensure no conflicts with existing bookings.
  const existing = await prisma.portalBooking.findMany({
    where: { siteId: site.id, status: "SCHEDULED", startAt: { lt: endAt }, endAt: { gt: startAt } },
    select: { startAt: true, endAt: true },
  });

  for (const b of existing) {
    if (overlaps(startAt, endAt, b.startAt, b.endAt)) {
      return NextResponse.json(
        { error: "That time just became unavailable. Please choose a different time." },
        { status: 409 },
      );
    }
  }

  const booking = await prisma.portalBooking.create({
    data: {
      siteId: site.id,
      startAt,
      endAt,
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone?.trim() ? parsed.data.contactPhone.trim() : null,
      notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      notes: true,
    },
  });

  // Best-effort email notifications (never block a successful booking).
  try {
    const profile = await prisma.businessProfile.findUnique({
      where: { ownerId: site.ownerId },
      select: { businessName: true },
    });
    const fromName = profile?.businessName?.trim() || site.owner?.name?.trim() || "Purely Automation";
    const when = `${formatInTimeZone(startAt, site.timeZone)} (${site.timeZone})`;

    const internalRecipients = Array.isArray(site.notificationEmails)
      ? (site.notificationEmails as unknown as string[]).filter((x) => typeof x === "string" && x.includes("@"))
      : [];
    const fallbackOwnerEmail = site.owner?.email ? [site.owner.email] : [];
    const notifyTo = internalRecipients.length ? internalRecipients : fallbackOwnerEmail;

    const internalBody = [
      `New booking: ${site.title}`,
      "",
      `When: ${when}`,
      "",
      `Name: ${booking.contactName}`,
      `Email: ${booking.contactEmail}`,
      booking.contactPhone ? `Phone: ${booking.contactPhone}` : null,
      booking.notes ? `Notes: ${booking.notes}` : null,
      "",
      site.meetingLocation ? `Location: ${site.meetingLocation}` : null,
      site.meetingDetails ? `Details: ${site.meetingDetails}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await sendEmail({
      to: notifyTo,
      subject: `New booking: ${site.title} — ${booking.contactName}`,
      body: internalBody,
      fromName,
    });

    const customerBody = [
      `You're booked: ${site.title}`,
      "",
      `When: ${when}`,
      site.meetingLocation ? `Location: ${site.meetingLocation}` : null,
      site.meetingDetails ? `Details: ${site.meetingDetails}` : null,
      "",
      `If you need to reschedule, reply to this email.`,
    ]
      .filter(Boolean)
      .join("\n");

    await sendEmail({
      to: [booking.contactEmail],
      subject: `Booking confirmed: ${site.title}`,
      body: customerBody,
      fromName,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, booking });
}
