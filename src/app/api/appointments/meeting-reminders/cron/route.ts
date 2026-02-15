import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensureAppointmentMeetingFieldsReady } from "@/lib/appointmentMeetingSchema";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";
import { trySendTransactionalEmail } from "@/lib/emailSender";

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

function normalizeMeetingPlatform(value: unknown): "Zoom" | "Google Meet" | "Meeting" {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "ZOOM") return "Zoom";
  if (v === "GOOGLE_MEET") return "Google Meet";
  return "Meeting";
}

function pickRecipientEmail(lead: {
  contactEmail: string | null;
  marketingDemoRequest?: { email: string } | null;
}): string | null {
  const primary = (lead.contactEmail ?? "").trim();
  if (primary) return primary;
  const fallback = (lead.marketingDemoRequest?.email ?? "").trim();
  if (fallback) return fallback;
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
  label: "24h" | "1h";
}) {
  const platformLabel = normalizeMeetingPlatform(opts.meetingPlatform);
  const whenLocal = formatInTimeZone(opts.startAt, opts.timeZone);

  const subject =
    opts.label === "24h"
      ? `Your ${platformLabel} link for your Purely Automation call` 
      : `Your ${platformLabel} link for your Purely Automation call (starting soon)`;

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
  const windowMs = windowMinutes * 60_000;

  const due24Start = new Date(now.getTime() + dayMs - windowMs);
  const due24End = new Date(now.getTime() + dayMs + windowMs);

  const due1End = new Date(now.getTime() + hourMs + windowMs);

  const [due24, due1] = await Promise.all([
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
          select: {
            businessName: true,
            contactName: true,
            contactEmail: true,
            marketingDemoRequest: { select: { email: true } },
          },
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
          select: {
            businessName: true,
            contactName: true,
            contactEmail: true,
            marketingDemoRequest: { select: { email: true } },
          },
        },
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
    sent24: 0,
    sent1: 0,
    skippedNoEmail: 0,
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

  return NextResponse.json(result);
}
