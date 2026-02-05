import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getRequestOrigin, signBookingRescheduleToken } from "@/lib/bookingReschedule";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  startAt: z.string().min(1),
  forceAvailability: z.boolean().optional(),
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
  to: string;
  subject: string;
  body: string;
  fromName?: string;
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) return;

  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName ?? "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  }).catch(() => null);
}

async function sendSms(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", fromNumber);
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { bookingId } = await params;
  const ownerId = auth.session.user.id;
  const origin = getRequestOrigin(req);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const site = await (prisma as any).portalBookingSite.findUnique({
    where: { ownerId },
    select: { id: true, slug: true, title: true, durationMinutes: true, timeZone: true },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const booking = await (prisma as any).portalBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.siteId !== site.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (booking.status !== "SCHEDULED") {
    return NextResponse.json({ ok: true, booking });
  }

  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid time." }, { status: 400 });
  }

  const durationMs = new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime();
  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : site.durationMinutes * 60_000;
  const endAt = new Date(startAt.getTime() + safeDurationMs);

  // Conflicts.
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
        { error: "That time conflicts with another booking." },
        { status: 409 },
      );
    }
  }

  // Availability coverage.
  const coverage = await prisma.availabilityBlock.findFirst({
    where: { userId: ownerId, startAt: { lte: startAt }, endAt: { gte: endAt } },
    select: { id: true },
  });

  if (!coverage) {
    if (parsed.data.forceAvailability) {
      await prisma.availabilityBlock.create({
        data: { userId: ownerId, startAt, endAt },
        select: { id: true },
      });
    } else {
      return NextResponse.json(
        { error: "No availability covers that time. Enable Force availability to schedule it anyway.", noAvailability: true },
        { status: 409 },
      );
    }
  }

  const updated = await (prisma as any).portalBooking.update({
    where: { id: booking.id },
    data: { startAt, endAt },
  });

  const rescheduleToken = signBookingRescheduleToken({
    bookingId: String(updated.id),
    contactEmail: String(updated.contactEmail || ""),
  });
  const rescheduleUrl = rescheduleToken
    ? new URL(`/book/${encodeURIComponent(site.slug)}/reschedule/${encodeURIComponent(String(updated.id))}?t=${encodeURIComponent(rescheduleToken)}`, origin).toString()
    : null;

  // Best-effort customer notifications.
  try {
    const profile = await prisma.businessProfile.findUnique({
      where: { ownerId },
      select: { businessName: true },
    });
    const fromName = profile?.businessName?.trim() || "Purely Automation";
    const when = `${formatInTimeZone(startAt, site.timeZone)} (${site.timeZone})`;

    if (updated.contactEmail) {
      await sendEmail({
        to: updated.contactEmail,
        subject: `Booking rescheduled: ${site.title}`,
        body: [
          `Your booking was rescheduled: ${site.title}`,
          "",
          `New time: ${when}`,
          rescheduleUrl ? "" : null,
          rescheduleUrl ? `Reschedule link: ${rescheduleUrl}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        fromName,
      });
    }

    if (updated.contactPhone) {
      await sendSms(updated.contactPhone, `Rescheduled: ${site.title} — ${when}`);
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, booking: updated, rescheduleUrl });
}
