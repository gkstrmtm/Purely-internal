import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { buildPrepPackBase } from "@/lib/prepPack";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";

async function sendInternalEmail(subject: string, body: string) {
  await trySendTransactionalEmail({
    to: "purestayservice@gmail.com",
    subject,
    text: body,
    fromName: "Purely Automation",
  }).catch(() => null);
}

function formatInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatIcsUtc(d: Date) {
  // YYYYMMDDTHHMMSSZ
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function buildGoogleCalendarUrl(opts: {
  title: string;
  details: string;
  startAt: Date;
  endAt: Date;
  timeZone?: string;
}) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", opts.title);
  url.searchParams.set("details", opts.details);
  url.searchParams.set("dates", `${formatIcsUtc(opts.startAt)}/${formatIcsUtc(opts.endAt)}`);
  if (opts.timeZone) url.searchParams.set("ctz", opts.timeZone);
  return url.toString();
}

function buildIcsFile(opts: {
  uid: string;
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Purely Automation//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@purelyautomation.com`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(opts.startAt)}`,
    `DTEND:${formatIcsUtc(opts.endAt)}`,
    `SUMMARY:${opts.title}`,
    `DESCRIPTION:${opts.description.replace(/\r?\n/g, "\\n")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8");
}

const bodySchema = z.object({
  requestId: z.string().min(1),
  startAt: z.string().min(1),
  durationMinutes: z.number().int().min(10).max(180).default(30),
  timeZone: z.string().trim().min(1).max(80).optional(),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

async function getMarketingSetterId() {
  const email = process.env.MARKETING_SETTER_EMAIL;
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }

  const fallback = await prisma.user.findFirst({
    where: { active: true, role: { in: ["MANAGER", "ADMIN", "DIALER"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return fallback?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      const field = first?.path?.[0];

      let message = "Please check your details and try again.";
      if (field === "requestId") message = "We could not find your request. Please try again.";
      if (field === "startAt") message = "Please choose a time and try again.";
      if (field === "durationMinutes") message = "Please choose a time and try again.";

      return NextResponse.json({ error: message }, { status: 400 });
    }

    const userTimeZone = parsed.data.timeZone || "America/New_York";

    const request = await prisma.marketingDemoRequest.findUnique({
      where: { id: parsed.data.requestId },
      select: { id: true, leadId: true },
    });
    if (!request) {
      return NextResponse.json(
        { error: "We could not find your request. Please try again." },
        { status: 404 },
      );
    }

    const setterId = await getMarketingSetterId();
    if (!setterId) {
      return NextResponse.json(
        { error: "Booking is temporarily unavailable. Please try again soon." },
        { status: 500 },
      );
    }

    const startAt = new Date(parsed.data.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Please choose a valid time." }, { status: 400 });
    }

    const endAt = new Date(startAt.getTime() + parsed.data.durationMinutes * 60_000);

    // Find available closers:
    const closers = await prisma.user.findMany({
      where: { role: "CLOSER", active: true },
      select: { id: true, name: true },
    });

    // Preload their availability blocks that could contain the slot.
    const blocks = await prisma.availabilityBlock.findMany({
      where: {
        userId: { in: closers.map((c) => c.id) },
        startAt: { lte: startAt },
        endAt: { gte: endAt },
      },
      select: { userId: true },
    });

    const eligibleCloserIds = new Set(blocks.map((b) => b.userId));
    const eligible = closers.filter((c) => eligibleCloserIds.has(c.id));

    if (eligible.length === 0) {
      return NextResponse.json(
        { error: "That time just became unavailable. Please choose a different time." },
        { status: 409 },
      );
    }

    // Remove closers with conflicting scheduled appointments.
    const conflicts = await prisma.appointment.findMany({
      where: {
        closerId: { in: eligible.map((c) => c.id) },
        status: "SCHEDULED",
        OR: [{ startAt: { lt: endAt }, endAt: { gt: startAt } }],
      },
      select: { closerId: true, startAt: true, endAt: true },
    });

    const conflictSet = new Set<string>();
    for (const c of conflicts) {
      if (overlaps(startAt, endAt, c.startAt, c.endAt)) conflictSet.add(c.closerId);
    }

    const noConflict = eligible.filter((c) => !conflictSet.has(c.id));
    if (noConflict.length === 0) {
      return NextResponse.json(
        { error: "That time just became unavailable. Please choose a different time." },
        { status: 409 },
      );
    }

    // Fairness: choose closer with lowest scheduled count.
    const counts = await prisma.appointment.groupBy({
      by: ["closerId"],
      where: {
        closerId: { in: noConflict.map((c) => c.id) },
        status: "SCHEDULED",
        startAt: { gte: new Date(Date.now() - 1 * 24 * 60 * 60_000) },
      },
      _count: { _all: true },
    });

    const countMap = new Map(counts.map((c) => [c.closerId, c._count._all] as const));

    let chosen = noConflict[0];
    for (const c of noConflict) {
      const curr = countMap.get(c.id) ?? 0;
      const best = countMap.get(chosen.id) ?? 0;
      if (curr < best) chosen = c;
    }

    const appointment = await prisma.appointment.create({
      data: {
        leadId: request.leadId,
        setterId,
        closerId: chosen.id,
        startAt,
        endAt,
      },
      // Avoid selecting Lead columns here; older DBs may be missing some Lead fields.
      select: {
        id: true,
        leadId: true,
        startAt: true,
        endAt: true,
        closer: { select: { name: true, email: true } },
        setter: { select: { name: true, email: true } },
      },
    });

    // Ensure the closer has an appointment prep pack doc to work from.
    try {
      const [hasWebsite, hasLocation, hasNiche, hasContactPhone, hasInterestedService, hasNotes] =
        await Promise.all([
          hasPublicColumn("Lead", "website"),
          hasPublicColumn("Lead", "location"),
          hasPublicColumn("Lead", "niche"),
          hasPublicColumn("Lead", "contactPhone"),
          hasPublicColumn("Lead", "interestedService"),
          hasPublicColumn("Lead", "notes"),
        ]);

      const lead = await prisma.lead.findUnique({
        where: { id: appointment.leadId },
        select: {
          id: true,
          businessName: true,
          phone: true,
          contactName: true,
          contactEmail: true,
          ...(hasWebsite ? { website: true } : {}),
          ...(hasLocation ? { location: true } : {}),
          ...(hasNiche ? { niche: true } : {}),
          ...(hasContactPhone ? { contactPhone: true } : {}),
          ...(hasInterestedService ? { interestedService: true } : {}),
          ...(hasNotes ? { notes: true } : {}),
        } as const,
      });

      if (lead) {
        const leadRec = lead as unknown as Record<string, unknown>;
        const interestedServiceRaw = leadRec.interestedService;
        const interestedService =
          typeof interestedServiceRaw === "string" && interestedServiceRaw.trim()
            ? interestedServiceRaw
            : deriveInterestedServiceFromNotes(leadRec.notes);

        const base = buildPrepPackBase({
          businessName: lead.businessName,
          phone: lead.phone,
          website: (leadRec.website as string | null | undefined) ?? null,
          location: (leadRec.location as string | null | undefined) ?? null,
          niche: (leadRec.niche as string | null | undefined) ?? null,
          contactName: lead.contactName ?? null,
          contactEmail: lead.contactEmail ?? null,
          contactPhone: (leadRec.contactPhone as string | null | undefined) ?? null,
          interestedService: interestedService ?? null,
          notes: (leadRec.notes as string | null | undefined) ?? null,
        });

        const dialerPrep = await prisma.doc.findFirst({
          where: { leadId: lead.id, kind: "LEAD_PREP_PACK" },
          orderBy: { updatedAt: "desc" },
          select: { content: true },
        });

        const content = dialerPrep?.content?.trim() ? dialerPrep.content : base;

        const existingPrep = await prisma.doc.findFirst({
          where: { ownerId: chosen.id, leadId: lead.id, kind: "APPOINTMENT_PREP" },
          select: { id: true },
        });

        const prepDocId =
          existingPrep?.id ??
          (
            await prisma.doc.create({
              data: {
                ownerId: chosen.id,
                leadId: lead.id,
                title: `Prep pack – ${lead.businessName}`,
                kind: "APPOINTMENT_PREP",
                content,
              },
              select: { id: true },
            })
          ).id;

        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { prepDocId },
        });
      }
    } catch {
      // Best-effort; booking should succeed even if prep pack creation fails.
    }

    // If this lead was previously routed to a dialer (demo form but not booked),
    // release it now that it is booked with a closer.
    try {
      await prisma.leadAssignment.updateMany({
        where: { leadId: appointment.leadId, releasedAt: null },
        data: { releasedAt: new Date() },
      });
    } catch {
      // Best-effort; booking should succeed even if cleanup fails.
    }

    // Best-effort internal notification.
    try {
      const marketing = await prisma.marketingDemoRequest.findUnique({
        where: { id: parsed.data.requestId },
        select: { name: true, company: true, email: true, phone: true, optedIn: true },
      });

      // Stop queued nurture messages once the call is booked.
      try {
        await prisma.marketingMessage.updateMany({
          where: {
            requestId: parsed.data.requestId,
            status: "PENDING",
            sendAt: { gt: new Date() },
          },
          data: {
            status: "SKIPPED",
            sentAt: new Date(),
            error: "Booked call",
          },
        });
      } catch {
        // Best-effort.
      }

      // Confirmation to the person who booked (best-effort).
      const confirmResults: Array<{ channel: "EMAIL" | "SMS"; ok: boolean; status: string; reason?: string }> = [];
      if (marketing?.email) {
        const subject = "Your call is booked with Purely Automation";
        const whenLocal = formatInTimeZone(startAt, userTimeZone);
        const title = "Purely Automation demo call";
        const details = [
          "Thanks again for booking a call with Purely Automation.",
          "",
          "We will send the call details and link in advance.",
          "",
          `Company: ${marketing.company}`,
          `Name: ${marketing.name}`,
        ].join("\n");

        const googleCalUrl = buildGoogleCalendarUrl({
          title,
          details: `${details}\n\nBooked time: ${whenLocal} (${userTimeZone})`,
          startAt,
          endAt,
          timeZone: userTimeZone,
        });

        const text = [
          `Hi ${marketing.name || "there"},`,
          "",
          "Your call is booked.",
          "",
          `When: ${whenLocal} (${userTimeZone})`,
          `Duration: ${parsed.data.durationMinutes} minutes`,
          "",
          "We will send the call link in advance.",
          "",
          "Add to Google Calendar:",
          googleCalUrl,
        ].join("\n");

        const icsBytes = buildIcsFile({
          uid: appointment.id,
          title,
          description: `${details}\n\nAdd to Google Calendar: ${googleCalUrl}`,
          startAt,
          endAt,
        });

        const r = await trySendTransactionalEmail({
          to: marketing.email,
          subject,
          text,
          fromName: "Purely Automation",
          attachments: [
            {
              fileName: "purely-automation-call.ics",
              mimeType: "text/calendar; charset=utf-8",
              bytes: icsBytes,
            },
          ],
        }).catch((e) => ({
          ok: false as const,
          skipped: false as const,
          reason: e instanceof Error ? e.message : "Unknown error",
        }));

        if (r.ok) {
          confirmResults.push({ channel: "EMAIL", ok: true, status: "SENT" });
        } else {
          confirmResults.push({
            channel: "EMAIL",
            ok: false,
            status: ("skipped" in r && r.skipped) ? "SKIPPED" : "FAILED",
            reason: r.reason,
          });
        }

        if (marketing.optedIn && marketing.phone) {
          const smsBody = `Purely Automation: your call is booked for ${whenLocal} (${userTimeZone}). Add to calendar: ${googleCalUrl} Reply STOP to opt out.`;
          const sms = await sendTwilioEnvSms({
            to: marketing.phone,
            body: smsBody,
            fromNumberEnvKeys: ["TWILIO_MARKETING_FROM_NUMBER", "TWILIO_FROM_NUMBER"],
          }).catch((e) => ({ ok: false as const, reason: e instanceof Error ? e.message : "Unknown error" }));

          if (sms.ok) confirmResults.push({ channel: "SMS", ok: true, status: "SENT" });
          else confirmResults.push({ channel: "SMS", ok: false, status: (sms as any).skipped ? "SKIPPED" : "FAILED", reason: (sms as any).reason });
        }
      }

      const subject = `New booking: ${formatInTimeZone(startAt, "America/New_York")} ET`;
      const body = [
        "A call was just booked.",
        "",
        `When (ET): ${formatInTimeZone(startAt, "America/New_York")}`,
        `When (ISO): ${startAt.toISOString()}`,
        `Duration: ${parsed.data.durationMinutes} minutes`,
        "",
        marketing
          ? `Name: ${marketing.name}\nCompany: ${marketing.company}\nEmail: ${marketing.email}\nPhone: ${marketing.phone ?? ""}`
          : "Marketing request: (not found)",
        "",
        `Closer: ${appointment.closer?.name ?? ""} (${appointment.closer?.email ?? ""})`,
        `Setter: ${appointment.setter?.name ?? ""} (${appointment.setter?.email ?? ""})`,
        "",
        `LeadId: ${appointment.leadId}`,
        `RequestId: ${parsed.data.requestId}`,
        `AppointmentId: ${appointment.id}`,
        confirmResults.length
          ? [
              "",
              "Confirmation sends:",
              ...confirmResults.map((r) => `- ${r.channel}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`),
            ].join("\n")
          : null,
      ].join("\n");

      await sendInternalEmail(subject, body);
    } catch {
      // Swallow internal-email failures.
    }

    return NextResponse.json({ appointment });
  } catch (err) {
    console.error("/api/public/appointments/book failed", err);
    return NextResponse.json(
      { error: "We could not book that time. Please try again." },
      { status: 500 },
    );
  }
}
