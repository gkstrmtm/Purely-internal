import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getBookingFormConfig } from "@/lib/bookingForm";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getRequestOrigin, signBookingRescheduleToken } from "@/lib/bookingReschedule";
import { recordAppointmentReminderBookingMeta } from "@/lib/appointmentReminders";
import { scheduleFollowUpsForBooking } from "@/lib/followUpAutomation";
import { findOrCreatePortalContact } from "@/lib/portalContacts";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";
import { normalizePhoneStrict } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  startAt: z.string().min(1),
  contactName: z.string().trim().min(1).max(80),
  contactEmail: z.string().trim().email().max(200),
  contactPhone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(1200).optional().nullable(),
  answers: z.record(z.string(), z.any()).optional(),
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
  { params }: { params: Promise<{ ownerId: string; calendarId: string }> },
) {
  const { ownerId, calendarId } = await params;
  const origin = getRequestOrigin(req);

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const [site, calendars, flags] = await Promise.all([
    (prisma as any).portalBookingSite.findUnique({
      where: { ownerId },
      select: {
        id: true,
        ownerId: true,
        slug: true,
        enabled: true,
        title: true,
        durationMinutes: true,
        timeZone: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    }),
    getBookingCalendarsConfig(ownerId),
    Promise.all([
      hasPublicColumn("PortalBookingSite", "meetingLocation"),
      hasPublicColumn("PortalBookingSite", "meetingDetails"),
      hasPublicColumn("PortalBookingSite", "notificationEmails"),
    ]).then(([meetingLocation, meetingDetails, notificationEmails]) => ({ meetingLocation, meetingDetails, notificationEmails })),
  ]);

  const cal = calendars.calendars.find((c) => c.id === calendarId);
  if (!site || !site.enabled || !cal || !cal.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const form = await getBookingFormConfig(ownerId);

  // Validate answers against form.
  const rawAnswers = parsed.data.answers && typeof parsed.data.answers === "object" ? (parsed.data.answers as Record<string, unknown>) : {};
  const answers: Record<string, string | string[]> = {};

  for (const q of form.questions) {
    const a = rawAnswers[q.id];
    if (q.kind === "multiple_choice") {
      const list = Array.isArray(a) ? a : [];
      const xs = list.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 12);
      if (q.required && xs.length === 0) {
        return NextResponse.json({ error: `Please answer: ${q.label}` }, { status: 400 });
      }
      answers[q.id] = xs;
      continue;
    }

    const v = typeof a === "string" ? a.trim() : "";
    if (q.required && !v) {
      return NextResponse.json({ error: `Please answer: ${q.label}` }, { status: 400 });
    }
    answers[q.id] = v;
  }

  const customAnswerLines: string[] = [];
  for (const q of form.questions) {
    const a = answers[q.id];
    if (q.kind === "multiple_choice") {
      const list = Array.isArray(a) ? a : [];
      if (!list.length) continue;
      customAnswerLines.push(`${q.label}: ${list.join(", ")}`);
      continue;
    }
    const v = typeof a === "string" ? a.trim() : "";
    if (!v) continue;
    customAnswerLines.push(`${q.label}: ${v}`);
  }

  const combinedNotes = [
    parsed.data.notes || null,
    customAnswerLines.length ? ["---", "Form answers:", ...customAnswerLines].join("\n") : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid time." }, { status: 400 });
  }

  const durationMinutes = cal.durationMinutes ?? site.durationMinutes;
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

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

  // Best-effort schema ensures (keeps booking→contact linking working even if migrations drift).
  await ensurePortalContactTagsReady().catch(() => null);

  const [canUseContactsTable, canUseBookingContactId] = await Promise.all([
    hasPublicColumn("PortalContact", "id"),
    hasPublicColumn("PortalBooking", "contactId"),
  ]);

  const phoneRes = normalizePhoneStrict(parsed.data.contactPhone || "");
  const phoneE164 = phoneRes.ok ? phoneRes.e164 : null;

  const contactId =
    canUseContactsTable && canUseBookingContactId
      ? await findOrCreatePortalContact({
          ownerId: String(ownerId),
          name: parsed.data.contactName,
          email: parsed.data.contactEmail,
          phone: phoneE164 || null,
        })
      : null;

  const meeting = flags.meetingLocation || flags.meetingDetails || flags.notificationEmails
    ? await (prisma as any).portalBookingSite.findUnique({
        where: { ownerId },
        select: {
          ...(flags.meetingLocation ? { meetingLocation: true } : {}),
          ...(flags.meetingDetails ? { meetingDetails: true } : {}),
          ...(flags.notificationEmails ? { notificationEmails: true } : {}),
        },
      })
    : null;

  const booking = await (prisma as any).portalBooking.create({
    data: {
      siteId: site.id,
      startAt,
      endAt,
      calendarId: String(calendarId),
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone ? parsed.data.contactPhone : null,
      notes: combinedNotes ? combinedNotes : null,
      ...(contactId ? { contactId } : {}),
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

  // Best-effort follow-up scheduling (never block a successful booking).
  try {
    await scheduleFollowUpsForBooking(String(ownerId), String(booking.id), { calendarId: String(calendarId) });
  } catch {
    // ignore
  }

  // Best-effort: remember which calendar this booking came from for reminders.
  try {
    await recordAppointmentReminderBookingMeta(String(ownerId), String(booking.id), { calendarId: String(calendarId) });
  } catch {
    // ignore
  }

  // Best-effort automations trigger (never block a successful booking).
  try {
    await runOwnerAutomationsForEvent({
      ownerId: String(ownerId),
      triggerKind: "appointment_booked",
      message: { from: phoneE164 || parsed.data.contactEmail || "", to: "", body: "" },
      contact: {
        id: contactId,
        name: parsed.data.contactName,
        email: parsed.data.contactEmail,
        phone: phoneE164 || null,
      },
    });
  } catch {
    // ignore
  }

  const rescheduleToken = signBookingRescheduleToken({
    bookingId: String(booking.id),
    contactEmail: String(booking.contactEmail || ""),
  });
  const rescheduleUrl = rescheduleToken
    ? new URL(
        `/book/${encodeURIComponent(String(site.slug))}/reschedule/${encodeURIComponent(String(booking.id))}?t=${encodeURIComponent(rescheduleToken)}`,
        origin,
      ).toString()
    : null;

  try {
    const profile = await prisma.businessProfile.findUnique({
      where: { ownerId: site.ownerId },
      select: { businessName: true },
    });
    const fromName = profile?.businessName?.trim() || site.owner?.name?.trim() || "Purely Automation";
    const when = `${formatInTimeZone(startAt, site.timeZone)} (${site.timeZone})`;
    const title = cal.title;

    const internalRecipients = Array.isArray(cal.notificationEmails)
      ? cal.notificationEmails
      : Array.isArray((meeting as any)?.notificationEmails)
        ? (((meeting as any).notificationEmails as unknown) as string[]).filter((x) => typeof x === "string" && x.includes("@"))
        : [];
    const fallbackOwnerEmail = site.owner?.email ? [site.owner.email] : [];
    const notifyTo = internalRecipients.length ? internalRecipients : fallbackOwnerEmail;

    const internalBody = [
      `New booking: ${title}`,
      "",
      `When: ${when}`,
      "",
      `Name: ${booking.contactName}`,
      `Email: ${booking.contactEmail}`,
      booking.contactPhone ? `Phone: ${booking.contactPhone}` : null,
      booking.notes ? `Notes: ${booking.notes}` : null,
      "",
      (cal.meetingLocation ?? (meeting as any)?.meetingLocation)
        ? `Location: ${cal.meetingLocation ?? (meeting as any).meetingLocation}`
        : null,
      (cal.meetingDetails ?? (meeting as any)?.meetingDetails)
        ? `Details: ${cal.meetingDetails ?? (meeting as any).meetingDetails}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (notifyTo.length) {
      await sendEmail({
        to: notifyTo,
        subject: `New booking: ${title} — ${booking.contactName}`,
        body: internalBody,
        fromName,
      });
    }

    const customerBody = [
      `You're booked: ${title}`,
      "",
      `When: ${when}`,
      (cal.meetingLocation ?? (meeting as any)?.meetingLocation)
        ? `Location: ${cal.meetingLocation ?? (meeting as any).meetingLocation}`
        : null,
      (cal.meetingDetails ?? (meeting as any)?.meetingDetails)
        ? `Details: ${cal.meetingDetails ?? (meeting as any).meetingDetails}`
        : null,
      rescheduleUrl ? "" : null,
      rescheduleUrl ? `Need to reschedule? ${rescheduleUrl}` : null,
      "",
      `If you need to reschedule, reply to this email.`,
    ]
      .filter(Boolean)
      .join("\n");

    await sendEmail({
      to: [booking.contactEmail],
      subject: `Booking confirmed: ${title}`,
      body: customerBody,
      fromName,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, booking, rescheduleUrl });
}
