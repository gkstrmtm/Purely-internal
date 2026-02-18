import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import {
  getRequestOrigin,
  signBookingRescheduleToken,
  verifyBookingRescheduleToken,
} from "@/lib/bookingReschedule";
import { scheduleFollowUpsForBooking } from "@/lib/followUpAutomation";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { trySendTransactionalEmail } from "@/lib/emailSender";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  startAt: z.string().min(1),
  t: z.string().min(1),
});

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
  to: string;
  subject: string;
  body: string;
  fromName?: string;
}) {
  await trySendTransactionalEmail({ to, subject, text: body, fromName }).catch(() => null);
}

async function sendSms(ownerId: string, to: string, body: string) {
  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", twilio.fromNumberE164);
  form.set("Body", body.slice(0, 900));

  await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; bookingId: string }> },
) {
  const { slug, bookingId } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";

  const [hasMeetingLocation, hasMeetingDetails] = await Promise.all([
    hasPublicColumn("PortalBookingSite", "meetingLocation"),
    hasPublicColumn("PortalBookingSite", "meetingDetails"),
  ]);

  const site = await (prisma as any).portalBookingSite.findUnique({
    where: { slug },
    select: {
      id: true,
      ownerId: true,
      enabled: true,
      slug: true,
      title: true,
      durationMinutes: true,
      timeZone: true,
      ...(hasMeetingLocation ? { meetingLocation: true } : {}),
      ...(hasMeetingDetails ? { meetingDetails: true } : {}),
      owner: { select: { name: true, email: true } },
    } as any,
  });

  if (!site || !site.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booking = await prisma.portalBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.siteId !== site.id || booking.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ok = verifyBookingRescheduleToken({
    bookingId: String(booking.id),
    contactEmail: String(booking.contactEmail || ""),
    token,
  });

  if (!ok) {
    return NextResponse.json({ error: "Invalid reschedule link." }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    site: {
      slug: site.slug,
      title: site.title,
      durationMinutes: site.durationMinutes,
      timeZone: site.timeZone,
      meetingLocation: hasMeetingLocation ? ((site as any).meetingLocation ?? null) : null,
      meetingDetails: hasMeetingDetails ? ((site as any).meetingDetails ?? null) : null,
      hostName: site.owner?.name ?? null,
    },
    booking: {
      id: booking.id,
      startAt: booking.startAt,
      endAt: booking.endAt,
      contactName: booking.contactName,
      contactEmail: booking.contactEmail,
      contactPhone: booking.contactPhone,
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; bookingId: string }> },
) {
  const { slug, bookingId } = await params;
  const origin = getRequestOrigin(req);

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const site = await (prisma as any).portalBookingSite.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, enabled: true, title: true, durationMinutes: true, timeZone: true, owner: { select: { name: true, email: true } } },
  });
  if (!site || !site.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booking = await prisma.portalBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.siteId !== site.id || booking.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ok = verifyBookingRescheduleToken({
    bookingId: String(booking.id),
    contactEmail: String(booking.contactEmail || ""),
    token: parsed.data.t,
  });
  if (!ok) {
    return NextResponse.json({ error: "Invalid reschedule link." }, { status: 403 });
  }

  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid time." }, { status: 400 });
  }

  const durationMs = new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime();
  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : site.durationMinutes * 60_000;
  const endAt = new Date(startAt.getTime() + safeDurationMs);

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

  const existing = await (prisma as any).portalBooking.findMany({
    where: {
      siteId: site.id,
      status: "SCHEDULED",
      id: { not: booking.id },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
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

  const updated = await prisma.portalBooking.update({
    where: { id: booking.id },
    data: { startAt, endAt },
  });

  // Best-effort follow-up scheduling (never block a successful reschedule).
  try {
    await scheduleFollowUpsForBooking(String(site.ownerId), String(updated.id));
  } catch {
    // ignore
  }

  const rescheduleToken = signBookingRescheduleToken({
    bookingId: String(updated.id),
    contactEmail: String(updated.contactEmail || ""),
  });
  const rescheduleUrl = rescheduleToken
    ? new URL(`/book/${encodeURIComponent(slug)}/reschedule/${encodeURIComponent(String(updated.id))}?t=${encodeURIComponent(rescheduleToken)}`, origin).toString()
    : null;

  // Best-effort notifications.
  try {
    const profile = await prisma.businessProfile.findUnique({
      where: { ownerId: site.ownerId },
      select: { businessName: true },
    });
    const fromName = profile?.businessName?.trim() || site.owner?.name?.trim() || "Purely Automation";
    const when = `${formatInTimeZone(startAt, site.timeZone)} (${site.timeZone})`;

    await sendEmail({
      to: updated.contactEmail,
      subject: `Booking rescheduled: ${site.title}`,
      body: [
        `Your booking was rescheduled: ${site.title}`,
        "",
        `New time: ${when}`,
        rescheduleUrl ? "" : null,
        rescheduleUrl ? `Need to reschedule again? ${rescheduleUrl}` : null,
        "",
        `If you have questions, reply to this email.`,
      ]
        .filter(Boolean)
        .join("\n"),
      fromName,
    });

    if (updated.contactPhone) {
      await sendSms(site.ownerId, updated.contactPhone, `Rescheduled: ${site.title} - ${when}`);
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, booking: updated, rescheduleUrl });
}
