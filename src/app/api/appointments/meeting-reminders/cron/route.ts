import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensureAppointmentMeetingFieldsReady } from "@/lib/appointmentMeetingSchema";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";
import { normalizePhoneStrict } from "@/lib/phone";
import { hasPublicColumn } from "@/lib/dbSchema";

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

function normalizeMeetingPlatform(value: unknown): "Zoom" | "Google Meet" | "Purely Connect" | "Meeting" {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "ZOOM") return "Zoom";
  if (v === "GOOGLE_MEET") return "Google Meet";
  if (v === "PURELY_CONNECT") return "Purely Connect";
  return "Meeting";
}

function pickRecipientEmail(lead: {
  contactEmail: string | null;
  marketingDemoRequest?: { email: string; phone?: string | null; optedIn?: boolean | null } | null;
}): string | null {
  const primary = (lead.contactEmail ?? "").trim();
  if (primary) return primary;
  const fallback = (lead.marketingDemoRequest?.email ?? "").trim();
  if (fallback) return fallback;
  return null;
}

function pickRecipientPhone(lead: {
  phone: string;
  contactPhone?: string | null;
  marketingDemoRequest?: { phone?: string | null; optedIn?: boolean | null } | null;
}): string | null {
  // If the lead came from a marketing form and explicitly opted out of SMS, don't text.
  if (lead.marketingDemoRequest && lead.marketingDemoRequest.optedIn === false) return null;

  const candidates = [lead.contactPhone ?? "", lead.marketingDemoRequest?.phone ?? "", lead.phone ?? ""]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const parsed = normalizePhoneStrict(raw);
    if (parsed.ok && parsed.e164) return parsed.e164;
  }

  return null;
}

async function sendJoinLinkEmail(opts: {
  to: string;
  name: string | null;
  businessName: string | null;
  startAt: Date;
  timeZone: string;
  meetingPlatform: unknown;
  meetingJoinUrl: string;
  label: "24h" | "1h" | "15m";
}) {
  const platformLabel = normalizeMeetingPlatform(opts.meetingPlatform);
  const whenLocal = formatInTimeZone(opts.startAt, opts.timeZone);

  const subject =
    opts.label === "24h"
      ? `Your ${platformLabel} link for your Purely Automation call` 
      : opts.label === "1h"
        ? `Your ${platformLabel} link for your Purely Automation call (starting soon)`
        : `Your ${platformLabel} link for your Purely Automation call (starting in ~15 minutes)`;

  const greetingName = (opts.name ?? "").trim() || "there";
  const lines = [
    `Hi ${greetingName},`,
    "",
    "Here’s the link to join your Purely Automation call:",
    opts.meetingJoinUrl,
    "",
    `When: ${whenLocal} (${opts.timeZone})`,
    opts.businessName ? `Company: ${opts.businessName}` : null,
    "",
    "If you have any trouble joining, just reply to this email.",
  ].filter(Boolean);

  const r = await trySendTransactionalEmail({
    to: opts.to,
    subject,
    text: lines.join("\n"),
    fromName: "Purely Automation",
  }).catch((e) => ({
    ok: false as const,
    skipped: false as const,
    reason: e instanceof Error ? e.message : "Unknown error",
  }));

  if (!r.ok) {
    const why = ("reason" in r && r.reason) ? r.reason : "Unknown error";
    throw new Error(why);
  }
}

async function sendJoinLinkSms(opts: {
  toE164: string;
  startAt: Date;
  timeZone: string;
  meetingJoinUrl: string;
}) {
  const whenLocal = formatInTimeZone(opts.startAt, opts.timeZone);
  const body = `Purely Automation: your call starts soon (${whenLocal} ${opts.timeZone}). Join: ${opts.meetingJoinUrl} Reply STOP to opt out.`;

  const r = await sendTwilioEnvSms({
    to: opts.toE164,
    body,
    fromNumberEnvKeys: ["TWILIO_MARKETING_FROM_NUMBER", "TWILIO_FROM_NUMBER"],
  });

  if (!r.ok) {
    const why = r.reason || "Unknown SMS error";
    throw new Error(why);
  }
}

export async function GET(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const isVercelCron = isVercelCronRequest(req);

  const secret =
    process.env.MEETING_REMINDERS_CRON_SECRET ??
    process.env.BOOKING_REMINDERS_CRON_SECRET ??
    process.env.MARKETING_CRON_SECRET;

  if (isProd && !secret && !isVercelCron) {
    return NextResponse.json({ error: "Missing MEETING_REMINDERS_CRON_SECRET" }, { status: 503 });
  }

  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-meeting-reminders-cron-secret", "x-booking-reminders-cron-secret", "x-marketing-cron-secret"],
    });
    if (!provided || provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await ensureAppointmentMeetingFieldsReady().catch(() => null);

  const now = new Date();
  const windowMinutes = Number(process.env.MEETING_REMINDERS_WINDOW_MINUTES ?? "7") || 7;

  const dayMs = 24 * 60 * 60_000;
  const hourMs = 60 * 60_000;
  const fifteenMs = 15 * 60_000;
  const windowMs = windowMinutes * 60_000;

  const due24Start = new Date(now.getTime() + dayMs - windowMs);
  const due24End = new Date(now.getTime() + dayMs + windowMs);

  const due1End = new Date(now.getTime() + hourMs + windowMs);

  const due15Start = new Date(now.getTime() + fifteenMs - windowMs);
  const due15End = new Date(now.getTime() + fifteenMs + windowMs);

  const hasContactPhone = await hasPublicColumn("Lead", "contactPhone");
  const leadSelect = {
    businessName: true,
    contactName: true,
    contactEmail: true,
    phone: true,
    ...(hasContactPhone ? { contactPhone: true } : {}),
    marketingDemoRequest: { select: { email: true, phone: true, optedIn: true } },
  } as const;

  const [due24, due1, due15] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: "SCHEDULED",
        startAt: { gte: due24Start, lte: due24End },
        meetingReminder24hSentAt: null,
        meetingJoinUrl: { not: null },
      } as any,
      select: {
        id: true,
        startAt: true,
        meetingPlatform: true,
        meetingJoinUrl: true,
        lead: {
          select: leadSelect as any,
        },
      } as any,
      take: 50,
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        status: "SCHEDULED",
        startAt: { gt: now, lte: due1End },
        meetingReminder1hSentAt: null,
        meetingJoinUrl: { not: null },
      } as any,
      select: {
        id: true,
        startAt: true,
        meetingPlatform: true,
        meetingJoinUrl: true,
        lead: {
          select: leadSelect as any,
        },
      } as any,
      take: 50,
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        status: "SCHEDULED",
        startAt: { gte: due15Start, lte: due15End },
        meetingJoinUrl: { not: null },
        OR: [{ meetingReminder15mEmailSentAt: null }, { meetingReminder15mSmsSentAt: null }],
      } as any,
      select: {
        id: true,
        startAt: true,
        meetingPlatform: true,
        meetingJoinUrl: true,
        meetingReminder15mEmailSentAt: true,
        meetingReminder15mSmsSentAt: true,
        lead: { select: leadSelect as any },
      } as any,
      take: 50,
      orderBy: { startAt: "asc" },
    }),
  ]);

  const timeZone = process.env.MEETING_REMINDERS_TIME_ZONE || "America/New_York";

  const result = {
    ok: true as const,
    nowIso: now.toISOString(),
    windowMinutes,
    due24Found: due24.length,
    due1Found: due1.length,
    due15Found: due15.length,
    sent24: 0,
    sent1: 0,
    sent15Email: 0,
    sent15Sms: 0,
    skippedNoEmail: 0,
    skippedNoSms: 0,
    skippedBlankLink: 0,
    errors: [] as string[],
  };

  for (const appt of due24) {
    try {
      const joinUrl = String((appt as any).meetingJoinUrl ?? "").trim();
      if (!joinUrl) {
        result.skippedBlankLink++;
        continue;
      }

      const to = pickRecipientEmail((appt as any).lead);
      if (!to) {
        result.skippedNoEmail++;
        continue;
      }

      await sendJoinLinkEmail({
        to,
        name: (appt as any).lead?.contactName ?? null,
        businessName: (appt as any).lead?.businessName ?? null,
        startAt: appt.startAt,
        timeZone,
        meetingPlatform: (appt as any).meetingPlatform,
        meetingJoinUrl: joinUrl,
        label: "24h",
      });

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { meetingReminder24hSentAt: new Date() } as any,
        select: { id: true },
      });

      result.sent24++;
    } catch (e) {
      result.errors.push(`24h ${appt.id}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  for (const appt of due1) {
    try {
      const joinUrl = String((appt as any).meetingJoinUrl ?? "").trim();
      if (!joinUrl) {
        result.skippedBlankLink++;
        continue;
      }

      const to = pickRecipientEmail((appt as any).lead);
      if (!to) {
        result.skippedNoEmail++;
        continue;
      }

      await sendJoinLinkEmail({
        to,
        name: (appt as any).lead?.contactName ?? null,
        businessName: (appt as any).lead?.businessName ?? null,
        startAt: appt.startAt,
        timeZone,
        meetingPlatform: (appt as any).meetingPlatform,
        meetingJoinUrl: joinUrl,
        label: "1h",
      });

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { meetingReminder1hSentAt: new Date() } as any,
        select: { id: true },
      });

      result.sent1++;
    } catch (e) {
      result.errors.push(`1h ${appt.id}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  for (const appt of due15) {
    const joinUrl = String((appt as any).meetingJoinUrl ?? "").trim();
    if (!joinUrl) {
      result.skippedBlankLink++;
      continue;
    }

    // Email (15m)
    if (!(appt as any).meetingReminder15mEmailSentAt) {
      try {
        const to = pickRecipientEmail((appt as any).lead);
        if (!to) {
          result.skippedNoEmail++;
        } else {
          await sendJoinLinkEmail({
            to,
            name: (appt as any).lead?.contactName ?? null,
            businessName: (appt as any).lead?.businessName ?? null,
            startAt: appt.startAt,
            timeZone,
            meetingPlatform: (appt as any).meetingPlatform,
            meetingJoinUrl: joinUrl,
            label: "15m",
          });

          await prisma.appointment.update({
            where: { id: appt.id },
            data: { meetingReminder15mEmailSentAt: new Date() } as any,
            select: { id: true },
          });

          result.sent15Email++;
        }
      } catch (e) {
        result.errors.push(`15m-email ${appt.id}: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    }

    // SMS (15m)
    if (!(appt as any).meetingReminder15mSmsSentAt) {
      try {
        const toE164 = pickRecipientPhone((appt as any).lead);
        if (!toE164) {
          result.skippedNoSms++;
        } else {
          await sendJoinLinkSms({
            toE164,
            startAt: appt.startAt,
            timeZone,
            meetingJoinUrl: joinUrl,
          });

          await prisma.appointment.update({
            where: { id: appt.id },
            data: { meetingReminder15mSmsSentAt: new Date() } as any,
            select: { id: true },
          });

          result.sent15Sms++;
        }
      } catch (e) {
        result.errors.push(`15m-sms ${appt.id}: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    }
  }

  return NextResponse.json(result);
}
