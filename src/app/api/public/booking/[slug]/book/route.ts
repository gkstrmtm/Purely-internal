import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getBookingFormConfig } from "@/lib/bookingForm";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getRequestOrigin, signBookingRescheduleToken } from "@/lib/bookingReschedule";
import { scheduleFollowUpsForBooking } from "@/lib/followUpAutomation";
import { findOrCreatePortalContact } from "@/lib/portalContacts";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";
import { normalizePhoneStrict } from "@/lib/phone";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { createConnectRoom } from "@/lib/connectRoomCreate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  startAt: z.string().min(1),
  contactName: z.string().min(1).max(80),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(40).optional().nullable(),
  notes: z.string().max(1200).optional().nullable(),
  answers: z
    .record(
      z.string().max(64),
      z.union([
        z.string().max(2000),
        z.array(z.string().max(200)).max(20),
      ]),
    )
    .optional()
    .nullable(),
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
  if (!to.length) return;
  await trySendTransactionalEmail({ to, subject, text: body, fromName }).catch(() => null);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const origin = getRequestOrigin(req);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }

  // Drift-hardening: only select columns that exist in this environment.
  const [hasMeetingLocation, hasMeetingDetails, hasNotificationEmails] = await Promise.all([
    hasPublicColumn("PortalBookingSite", "meetingLocation"),
    hasPublicColumn("PortalBookingSite", "meetingDetails"),
    hasPublicColumn("PortalBookingSite", "notificationEmails"),
  ]);

  const site = await (prisma as any).portalBookingSite.findUnique({
    where: { slug },
    select: {
      id: true,
      enabled: true,
      ownerId: true,
      title: true,
      durationMinutes: true,
      timeZone: true,
      ...(hasMeetingLocation ? { meetingLocation: true } : {}),
      ...(hasMeetingDetails ? { meetingDetails: true } : {}),
      ...(hasNotificationEmails ? { notificationEmails: true } : {}),
      owner: { select: { name: true, email: true } },
    } as any,
  });
  if (!site || !site.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const form = await getBookingFormConfig(String(site.ownerId));

  const rawAnswers = parsed.data.answers && typeof parsed.data.answers === "object" ? parsed.data.answers : null;
  const answers: Record<string, string | string[]> = {};
  if (rawAnswers) {
    for (const [k, v] of Object.entries(rawAnswers)) {
      if (typeof k !== "string") continue;
      if (typeof v === "string") {
        answers[k] = v.trim().slice(0, 2000);
      } else if (Array.isArray(v)) {
        const list = v
          .filter((x) => typeof x === "string")
          .map((x) => x.trim().slice(0, 200))
          .filter(Boolean);
        // De-dupe while preserving order.
        const unique: string[] = [];
        const seen = new Set<string>();
        for (const item of list) {
          const key = item.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(item);
          if (unique.length >= 20) break;
        }
        answers[k] = unique;
      }
    }
  }

  const phone = form.phone.enabled ? (parsed.data.contactPhone?.trim() ? parsed.data.contactPhone.trim() : "") : "";
  const notes = form.notes.enabled ? (parsed.data.notes?.trim() ? parsed.data.notes.trim() : "") : "";

  if (form.phone.enabled && form.phone.required && !phone) {
    return NextResponse.json({ error: "Phone is required." }, { status: 400 });
  }
  if (form.notes.enabled && form.notes.required && !notes) {
    return NextResponse.json({ error: "Notes are required." }, { status: 400 });
  }

  for (const q of form.questions) {
    const a = answers[q.id];
    if (!q.required && (a === undefined || a === null)) continue;

    if (q.kind === "multiple_choice") {
      const list = Array.isArray(a) ? a : [];
      const allowed = new Set((q.options ?? []).map((x) => String(x)));
      const filtered = list.filter((x) => allowed.has(x));
      if (q.required && filtered.length === 0) {
        return NextResponse.json({ error: `Please answer: ${q.label}` }, { status: 400 });
      }
      // Normalize to allowed options only.
      answers[q.id] = filtered;
      continue;
    }

    if (q.kind === "single_choice") {
      const v = typeof a === "string" ? a.trim() : "";
      const allowed = new Set((q.options ?? []).map((x) => String(x)));
      if (q.required && !v) {
        return NextResponse.json({ error: `Please answer: ${q.label}` }, { status: 400 });
      }
      if (v && !allowed.has(v)) {
        return NextResponse.json({ error: `Please answer: ${q.label}` }, { status: 400 });
      }
      answers[q.id] = v;
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
    notes || null,
    customAnswerLines.length ? ["---", "Form answers:", ...customAnswerLines].join("\n") : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

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

  const phoneRes = normalizePhoneStrict(phone);
  const phoneE164 = phoneRes.ok ? phoneRes.e164 : null;

  // Purely Connect Meeting Logic
  let purelyConnectJoinUrl: string | null = null;
  let effectiveLocation = (site as any).meetingLocation ?? null;

  try {
    const setup = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId: site.ownerId, serviceSlug: "booking" } },
      select: { dataJson: true },
    });
    const setupData = (setup?.dataJson as any) || {};

    if (setupData.meetingPlatform === "PURELY_CONNECT") {
      const room = await createConnectRoom({
        title: `Booking: ${site.title} - ${parsed.data.contactName}`,
        createdByUserId: null,
        idLength: 10,
        maxAttempts: 12,
      });
      purelyConnectJoinUrl = `${getAppBaseUrl()}/connect/${encodeURIComponent(room.roomId)}`;
      
      // Override the location with generating a unique meeting link
      effectiveLocation = purelyConnectJoinUrl;
    }
  } catch (err) {
    console.error("Failed to setup Purely Connect meeting for booking", err);
  }

  // Prepend meeting link to notes so it's visible in the portal UI for the booking record
  let finalNotes = combinedNotes;
  if (purelyConnectJoinUrl) {
    const prefix = `[Purely Connect Meeting]\n${purelyConnectJoinUrl}\n\n`;
    finalNotes = finalNotes ? prefix + finalNotes : prefix.trim();
  }

  const contactId =
    canUseContactsTable && canUseBookingContactId
      ? await findOrCreatePortalContact({
          ownerId: String(site.ownerId),
          name: parsed.data.contactName,
          email: parsed.data.contactEmail,
          phone: phoneE164 || null,
        })
      : null;

  const booking = await (prisma as any).portalBooking.create({
    data: {
      siteId: site.id,
      startAt,
      endAt,
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
      contactPhone: phone ? phone : null,
      notes: finalNotes ? finalNotes : null,
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

  // Best-effort: notify portal users (never block a successful booking).
  try {
    const baseUrl = getAppBaseUrl();
    const when = `${formatInTimeZone(startAt, site.timeZone)} (${site.timeZone})`;
    void tryNotifyPortalAccountUsers({
      ownerId: String(site.ownerId),
      kind: "booking_created",
      subject: `New booking: ${site.title} — ${booking.contactName}`,
      text: [
        "A new booking was created.",
        "",
        `When: ${when}`,
        "",
        `Name: ${booking.contactName}`,
        `Email: ${booking.contactEmail}`,
        booking.contactPhone ? `Phone: ${booking.contactPhone}` : null,
        booking.notes ? `Notes: ${String(booking.notes).slice(0, 1200)}` : null,
        "",
        `Open bookings: ${baseUrl}/portal/app/booking`,
      ]
        .filter(Boolean)
        .join("\n"),
    }).catch(() => null);
  } catch {
    // ignore
  }

  // Best-effort follow-up scheduling (never block a successful booking).
  try {
    await scheduleFollowUpsForBooking(String(site.ownerId), String(booking.id));
  } catch {
    // ignore
  }

  // Best-effort automations trigger (never block a successful booking).
  try {
    await runOwnerAutomationsForEvent({
      ownerId: String(site.ownerId),
      triggerKind: "appointment_booked",
      event: { bookingId: String(booking.id) },
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
    ? new URL(`/book/${encodeURIComponent(slug)}/reschedule/${encodeURIComponent(String(booking.id))}?t=${encodeURIComponent(rescheduleToken)}`, origin).toString()
    : null;

  // Best-effort email notifications (never block a successful booking).
  try {
    const profile = await prisma.businessProfile.findUnique({
      where: { ownerId: site.ownerId },
      select: { businessName: true },
    });
    const fromName = profile?.businessName?.trim() || site.owner?.name?.trim() || "Purely Automation";
    const when = `${formatInTimeZone(startAt, site.timeZone)} (${site.timeZone})`;

    const internalRecipients = Array.isArray((site as any).notificationEmails)
      ? (((site as any).notificationEmails as unknown) as string[]).filter((x) => typeof x === "string" && x.includes("@"))
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
      effectiveLocation ? `Location: ${effectiveLocation}` : (site as any).meetingLocation ? `Location: ${(site as any).meetingLocation}` : null,
      (site as any).meetingDetails ? `Details: ${(site as any).meetingDetails}` : null,
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
      effectiveLocation ? `Location: ${effectiveLocation}` : (site as any).meetingLocation ? `Location: ${(site as any).meetingLocation}` : null,
      (site as any).meetingDetails ? `Details: ${(site as any).meetingDetails}` : null,
      rescheduleUrl ? "" : null,
      rescheduleUrl ? `Need to reschedule? ${rescheduleUrl}` : null,
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

  return NextResponse.json({ ok: true, booking, rescheduleUrl });
}
