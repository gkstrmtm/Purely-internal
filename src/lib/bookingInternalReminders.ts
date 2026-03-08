import { prisma } from "@/lib/db";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { sendEmail as sendOutboundEmail } from "@/lib/leadOutbound";
import { getAppBaseUrl, listPortalAccountRecipientContacts } from "@/lib/portalNotifications";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";

const SERVICE_SLUG = "bookingInternalReminders";

const DEFAULT_LEAD_TIME_MINUTES = [24 * 60, 60, 15];

const MAX_SENT_KEYS = 5000;
const MAX_EVENTS = 200;

function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.max(min, Math.min(max, x));
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

function parseEmails(raw: unknown, limit = 20): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    if (typeof x !== "string") continue;
    const email = x.trim();
    if (!email || !email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
    if (out.length >= limit) break;
  }
  return out;
}

type ServiceData = {
  version: 1;
  sentKeys: string[];
  events: Array<{ at: string; bookingId: string; leadTimeMinutes: number; toCount: number; status: "sent" | "skipped" | "failed" }>;
};

function parseServiceData(raw: unknown): ServiceData {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const sentKeys = Array.isArray(rec?.sentKeys) ? rec!.sentKeys : [];
  const events = Array.isArray(rec?.events) ? rec!.events : [];

  return {
    version: 1,
    sentKeys: sentKeys.map((x) => String(x || "").trim()).filter(Boolean).slice(0, MAX_SENT_KEYS),
    events: events
      .map((e) => {
        const r = e && typeof e === "object" && !Array.isArray(e) ? (e as Record<string, unknown>) : null;
        return {
          at: typeof r?.at === "string" ? r.at : new Date().toISOString(),
          bookingId: typeof r?.bookingId === "string" ? r.bookingId : "",
          leadTimeMinutes: typeof r?.leadTimeMinutes === "number" ? r.leadTimeMinutes : 0,
          toCount: typeof r?.toCount === "number" ? r.toCount : 0,
          status: r?.status === "sent" || r?.status === "skipped" || r?.status === "failed" ? (r.status as any) : "sent",
        };
      })
      .filter((e) => Boolean(e.bookingId))
      .slice(0, MAX_EVENTS),
  };
}

async function sendEmail(opts: { to: string[]; subject: string; body: string; fromName?: string; ownerId: string }) {
  const to = Array.isArray(opts.to) ? opts.to : [];
  for (const addr of to) {
    const email = String(addr || "").trim();
    if (!email) continue;
    await sendOutboundEmail({ to: email, subject: opts.subject, text: opts.body, fromName: opts.fromName, ownerId: opts.ownerId }).catch(
      () => null,
    );
  }
}

function leadTimeLabel(minutes: number) {
  if (minutes >= 24 * 60) return "24h";
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
}

export async function processDueBookingInternalReminders(opts?: {
  ownersLimit?: number;
  perOwnerLimit?: number;
  windowMinutes?: number;
  leadTimeMinutesList?: number[];
}) {
  const ownersLimit = clampInt(opts?.ownersLimit ?? 1000, 1, 5000);
  const perOwnerLimit = clampInt(opts?.perOwnerLimit ?? 25, 1, 100);
  const windowMinutes = clampInt(opts?.windowMinutes ?? 5, 1, 60);
  const leadTimeMinutesList = (Array.isArray(opts?.leadTimeMinutesList) ? opts!.leadTimeMinutesList : DEFAULT_LEAD_TIME_MINUTES)
    .map((x) => clampInt(Number(x), 1, 7 * 24 * 60))
    .filter((x, idx, arr) => arr.indexOf(x) === idx)
    .sort((a, b) => a - b);

  let scannedOwners = 0;
  let remindersSent = 0;
  let remindersFailed = 0;
  let remindersSkipped = 0;

  let cursorId: string | undefined;

  while (scannedOwners < ownersLimit) {
    const sites = await prisma.portalBookingSite.findMany({
      orderBy: { id: "asc" },
      take: Math.min(200, ownersLimit - scannedOwners),
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true, ownerId: true, timeZone: true, title: true, notificationEmails: true },
    });

    if (sites.length === 0) break;
    cursorId = sites[sites.length - 1].id;

    for (const site of sites) {
      scannedOwners += 1;
      const ownerId = String(site.ownerId);

      const [existing, owner, profile, calendarsConfig, accountContacts] = await Promise.all([
        prisma.portalServiceSetup.findUnique({
          where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
          select: { dataJson: true },
        }),
        prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true, active: true } }),
        prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }).catch(() => null),
        getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1, calendars: [] })),
        listPortalAccountRecipientContacts(ownerId).catch(() => []),
      ]);

      const fromName = profile?.businessName?.trim() || owner?.name?.trim() || "Purely Automation";
      const fallbackOwnerEmail = owner?.active && owner?.email ? [owner.email] : [];

      const siteEmails = parseEmails(site.notificationEmails, 20);

      const calEmailMap = new Map<string, string[]>();
      for (const cal of calendarsConfig.calendars ?? []) {
        if (!cal || typeof cal !== "object") continue;
        const id = typeof (cal as any).id === "string" ? (cal as any).id : "";
        if (!id) continue;
        const emails = parseEmails((cal as any).notificationEmails, 20);
        if (emails.length) calEmailMap.set(id, emails);
      }

      const phoneByEmailLower = new Map<string, string>();
      for (const c of accountContacts) {
        const email = String(c.email || "").trim();
        if (!email || !email.includes("@")) continue;
        if (!c.phoneE164) continue;
        phoneByEmailLower.set(email.toLowerCase(), c.phoneE164);
      }

      let mutated = false;
      const serviceData = parseServiceData(existing?.dataJson);
      let sentKeys = serviceData.sentKeys.slice();
      const sentSet = new Set(sentKeys);
      let events = serviceData.events.slice();

      const upsertServiceData = async () => {
        if (!mutated) return;
        const payload: ServiceData = {
          version: 1,
          sentKeys: sentKeys.slice(0, MAX_SENT_KEYS),
          events: events.slice(0, MAX_EVENTS),
        };
        await prisma.portalServiceSetup.upsert({
          where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
          create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload as any },
          update: { status: "COMPLETE", dataJson: payload as any },
          select: { id: true },
        });
        mutated = false;
      };

      for (const leadTimeMinutes of leadTimeMinutesList) {
        const leadMs = leadTimeMinutes * 60_000;
        const now = Date.now();
        const windowStart = new Date(now + leadMs);
        const windowEnd = new Date(now + leadMs + windowMinutes * 60_000);

        const bookings = await prisma.portalBooking.findMany({
          where: {
            siteId: site.id,
            status: "SCHEDULED",
            startAt: { gte: windowStart, lt: windowEnd },
          },
          orderBy: { startAt: "asc" },
          take: perOwnerLimit,
          select: {
            id: true,
            startAt: true,
            endAt: true,
            calendarId: true,
            contactName: true,
            contactEmail: true,
            contactPhone: true,
          },
        });

        if (bookings.length === 0) continue;

        for (const booking of bookings) {
          const key = `booking:${booking.id}:lead:${leadTimeMinutes}`;
          if (sentSet.has(key)) {
            remindersSkipped += 1;
            continue;
          }

          const calEmails = booking.calendarId ? calEmailMap.get(String(booking.calendarId)) ?? [] : [];
          const to = (calEmails.length ? calEmails : siteEmails).length ? (calEmails.length ? calEmails : siteEmails) : fallbackOwnerEmail;

          if (!to.length) {
            events.unshift({
              at: new Date().toISOString(),
              bookingId: String(booking.id),
              leadTimeMinutes,
              toCount: 0,
              status: "skipped",
            });
            mutated = true;
            remindersSkipped += 1;
            continue;
          }

          const when = `${formatInTimeZone(booking.startAt, site.timeZone)} (${site.timeZone})`;
          const link = `${getAppBaseUrl()}/portal/app/services/booking/appointments`;
          const label = leadTimeLabel(leadTimeMinutes);

          const subject = `Upcoming appointment (${label}): ${site.title} - ${booking.contactName}`;
          const body = [
            `Upcoming appointment: ${site.title}`,
            "",
            `Starts in: ${label}`,
            `When: ${when}`,
            "",
            `Client: ${booking.contactName}`,
            `Email: ${booking.contactEmail}`,
            booking.contactPhone ? `Phone: ${booking.contactPhone}` : null,
            "",
            `Manage: ${link}`,
          ]
            .filter(Boolean)
            .join("\n");

          try {
            await sendEmail({ to, subject, body, fromName, ownerId });

            const smsBody = `Upcoming appointment (${label}): ${site.title} - ${booking.contactName} at ${when}. ${link}`;
            const smsTo = to
              .map((e) => phoneByEmailLower.get(String(e).toLowerCase()) || "")
              .filter(Boolean);

            await Promise.all(
              Array.from(new Set(smsTo)).map((phone) =>
                sendTwilioEnvSms({ to: phone, body: smsBody, fromNumberEnvKeys: ["TWILIO_FROM_NUMBER"] }).catch(() => null),
              ),
            );

            sentSet.add(key);
            sentKeys.push(key);
            events.unshift({
              at: new Date().toISOString(),
              bookingId: String(booking.id),
              leadTimeMinutes,
              toCount: to.length,
              status: "sent",
            });
            mutated = true;
            remindersSent += 1;
          } catch {
            events.unshift({
              at: new Date().toISOString(),
              bookingId: String(booking.id),
              leadTimeMinutes,
              toCount: to.length,
              status: "failed",
            });
            mutated = true;
            remindersFailed += 1;
          }

          // Periodically persist progress so we don't resend on long runs.
          if (mutated && (sentKeys.length % 25 === 0 || events.length % 25 === 0)) {
            await upsertServiceData();
          }
        }
      }

      await upsertServiceData();
    }
  }

  return {
    ok: true as const,
    scannedOwners,
    remindersSent,
    remindersFailed,
    remindersSkipped,
    leadTimeMinutesList,
    windowMinutes,
  };
}
