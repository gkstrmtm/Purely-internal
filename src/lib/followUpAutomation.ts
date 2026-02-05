import { prisma } from "@/lib/db";

export type FollowUpChannel = "EMAIL" | "SMS";

export type FollowUpSettings = {
  version: 1;
  enabled: boolean;
  delayMinutes: number;
  channels: {
    email: boolean;
    sms: boolean;
  };
  email: {
    subjectTemplate: string;
    bodyTemplate: string;
  };
  sms: {
    bodyTemplate: string;
  };
};

export type FollowUpQueueItem = {
  id: string;
  bookingId: string;
  ownerId: string;
  channel: FollowUpChannel;
  to: string;
  subject?: string;
  body: string;
  sendAtIso: string;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELED";
  attempts: number;
  lastError?: string;
  createdAtIso: string;
  sentAtIso?: string;
};

type ServiceData = {
  version: 1;
  settings: FollowUpSettings;
  queue: FollowUpQueueItem[];
};

const SERVICE_SLUG = "follow-up";
const MAX_QUEUE_ITEMS = 400;

function clampInt(n: unknown, fallback: number, min: number, max: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(min, Math.min(max, v));
}

function normalizeBool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function normalizeString(v: unknown, fallback: string, max = 5000) {
  return (typeof v === "string" ? v : fallback).slice(0, max);
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function defaultFollowUpSettings(): FollowUpSettings {
  return {
    version: 1,
    enabled: false,
    delayMinutes: 60,
    channels: { email: true, sms: false },
    email: {
      subjectTemplate: "Thanks for meeting, {contactName}",
      bodyTemplate: [
        "Hi {contactName},",
        "",
        "Thanks again for booking time with {businessName}.",
        "",
        "If you have any questions, just reply to this message.",
        "",
        "— {businessName}",
      ].join("\n"),
    },
    sms: {
      bodyTemplate: "Thanks again for your time — reply here if you have any questions. — {businessName}",
    },
  };
}

export function parseFollowUpSettings(value: unknown): FollowUpSettings {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const settings = rec.settings && typeof rec.settings === "object" && !Array.isArray(rec.settings)
    ? (rec.settings as Record<string, unknown>)
    : rec;

  const channelsRaw =
    settings.channels && typeof settings.channels === "object" && !Array.isArray(settings.channels)
      ? (settings.channels as Record<string, unknown>)
      : {};

  const emailRaw =
    settings.email && typeof settings.email === "object" && !Array.isArray(settings.email)
      ? (settings.email as Record<string, unknown>)
      : {};
  const smsRaw =
    settings.sms && typeof settings.sms === "object" && !Array.isArray(settings.sms)
      ? (settings.sms as Record<string, unknown>)
      : {};

  const defaults = defaultFollowUpSettings();

  return {
    version: 1,
    enabled: normalizeBool(settings.enabled, defaults.enabled),
    delayMinutes: clampInt(settings.delayMinutes, defaults.delayMinutes, 0, 60 * 24 * 30),
    channels: {
      email: normalizeBool(channelsRaw.email, defaults.channels.email),
      sms: normalizeBool(channelsRaw.sms, defaults.channels.sms),
    },
    email: {
      subjectTemplate: normalizeString(emailRaw.subjectTemplate, defaults.email.subjectTemplate, 200),
      bodyTemplate: normalizeString(emailRaw.bodyTemplate, defaults.email.bodyTemplate, 5000),
    },
    sms: {
      bodyTemplate: normalizeString(smsRaw.bodyTemplate, defaults.sms.bodyTemplate, 900),
    },
  };
}

function parseServiceData(value: unknown): ServiceData {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const settings = parseFollowUpSettings(rec.settings ?? rec);
  const queueRaw = Array.isArray(rec.queue) ? rec.queue : [];

  const queue: FollowUpQueueItem[] = [];
  for (const item of queueRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : null;
    const bookingId = typeof r.bookingId === "string" ? r.bookingId : null;
    const ownerId = typeof r.ownerId === "string" ? r.ownerId : null;
    const channel = r.channel === "EMAIL" || r.channel === "SMS" ? (r.channel as FollowUpChannel) : null;
    const to = typeof r.to === "string" ? r.to : null;
    const body = typeof r.body === "string" ? r.body : null;
    const sendAtIso = typeof r.sendAtIso === "string" ? r.sendAtIso : null;
    const status =
      r.status === "PENDING" || r.status === "SENT" || r.status === "FAILED" || r.status === "CANCELED"
        ? (r.status as FollowUpQueueItem["status"])
        : "PENDING";
    const attempts = clampInt(r.attempts, 0, 0, 20);
    const createdAtIso = typeof r.createdAtIso === "string" ? r.createdAtIso : nowIso();
    const subject = typeof r.subject === "string" ? r.subject : undefined;
    const lastError = typeof r.lastError === "string" ? r.lastError : undefined;
    const sentAtIso = typeof r.sentAtIso === "string" ? r.sentAtIso : undefined;

    if (!id || !bookingId || !ownerId || !channel || !to || !body || !sendAtIso) continue;
    queue.push({
      id,
      bookingId,
      ownerId,
      channel,
      to,
      subject,
      body,
      sendAtIso,
      status,
      attempts,
      lastError,
      createdAtIso,
      sentAtIso,
    });
    if (queue.length >= MAX_QUEUE_ITEMS) break;
  }

  return { version: 1, settings, queue };
}

async function getServiceRow(ownerId: string) {
  return prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { id: true, dataJson: true },
  });
}

export async function getFollowUpSettings(ownerId: string): Promise<FollowUpSettings> {
  const row = await getServiceRow(ownerId);
  return parseFollowUpSettings(row?.dataJson);
}

export async function getFollowUpServiceData(ownerId: string): Promise<ServiceData> {
  const row = await getServiceRow(ownerId);
  return parseServiceData(row?.dataJson);
}

export async function setFollowUpSettings(ownerId: string, next: Partial<FollowUpSettings>): Promise<FollowUpSettings> {
  const current = await getFollowUpServiceData(ownerId);
  const merged = parseFollowUpSettings({ ...current.settings, ...next });

  const payload: any = {
    version: 1,
    settings: merged,
    queue: current.queue,
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload },
    update: { status: "COMPLETE", dataJson: payload },
    select: { id: true },
  });

  return merged;
}

export function renderTemplate(template: string, vars: Record<string, string>) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

export async function scheduleFollowUpsForBooking(ownerId: string, bookingId: string): Promise<{ ok: true; scheduled: number } | { ok: false; reason: string }> {
  const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true, title: true, timeZone: true } });
  if (!site) return { ok: false, reason: "Booking site not found" };

  const booking = await prisma.portalBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.siteId !== site.id) return { ok: false, reason: "Booking not found" };

  const bookingRow = booking;

  if (bookingRow.status !== "SCHEDULED") return { ok: true, scheduled: 0 };

  const service = await getFollowUpServiceData(ownerId);
  const settings = service.settings;
  if (!settings.enabled) return { ok: true, scheduled: 0 };

  const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
  const businessName = profile?.businessName?.trim() || "Purely Automation";

  const sendAt = new Date(new Date(bookingRow.endAt).getTime() + settings.delayMinutes * 60_000);
  const vars = {
    contactName: bookingRow.contactName,
    businessName,
    bookingTitle: site.title,
  };

  const nextQueue = [...service.queue];
  const before = nextQueue.length;

  function upsert(channel: FollowUpChannel, to: string, subject: string | undefined, body: string) {
    const existingIndex = nextQueue.findIndex((x) => x.bookingId === bookingRow.id && x.channel === channel && x.status === "PENDING");
    const base: FollowUpQueueItem = {
      id: existingIndex >= 0 ? nextQueue[existingIndex]!.id : randomId("fu"),
      bookingId: bookingRow.id,
      ownerId,
      channel,
      to,
      subject,
      body,
      sendAtIso: sendAt.toISOString(),
      status: "PENDING",
      attempts: existingIndex >= 0 ? nextQueue[existingIndex]!.attempts : 0,
      createdAtIso: existingIndex >= 0 ? nextQueue[existingIndex]!.createdAtIso : nowIso(),
    };
    if (existingIndex >= 0) nextQueue[existingIndex] = base;
    else nextQueue.push(base);
  }

  if (settings.channels.email && bookingRow.contactEmail) {
    const subject = renderTemplate(settings.email.subjectTemplate, vars).slice(0, 120);
    const body = renderTemplate(settings.email.bodyTemplate, vars).slice(0, 2000);
    upsert("EMAIL", bookingRow.contactEmail, subject, body);
  }
  if (settings.channels.sms && bookingRow.contactPhone) {
    const body = renderTemplate(settings.sms.bodyTemplate, vars).slice(0, 900);
    upsert("SMS", bookingRow.contactPhone, undefined, body);
  }

  // Trim queue: keep most recent items, but preserve pending.
  const pending = nextQueue.filter((q) => q.status === "PENDING");
  const done = nextQueue
    .filter((q) => q.status !== "PENDING")
    .sort((a, b) => (b.createdAtIso || "").localeCompare(a.createdAtIso || ""))
    .slice(0, Math.max(0, MAX_QUEUE_ITEMS - pending.length));
  const trimmed = [...pending, ...done].slice(0, MAX_QUEUE_ITEMS);

  const payload: any = { version: 1, settings, queue: trimmed };
  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload },
    update: { status: "COMPLETE", dataJson: payload },
    select: { id: true },
  });

  return { ok: true, scheduled: Math.max(0, trimmed.length - before) };
}

export async function cancelFollowUpsForBooking(ownerId: string, bookingId: string): Promise<void> {
  const service = await getFollowUpServiceData(ownerId);
  const nextQueue = service.queue.map((q) =>
    q.bookingId === bookingId && q.status === "PENDING" ? { ...q, status: "CANCELED" as const } : q,
  );
  const payload: any = { version: 1, settings: service.settings, queue: nextQueue };
  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload },
    update: { status: "COMPLETE", dataJson: payload },
    select: { id: true },
  });
}

export async function listQueue(ownerId: string, limit = 60): Promise<FollowUpQueueItem[]> {
  const service = await getFollowUpServiceData(ownerId);
  return service.queue
    .slice()
    .sort((a, b) => a.sendAtIso.localeCompare(b.sendAtIso))
    .slice(0, Math.max(1, Math.min(200, limit)));
}

export async function processDueFollowUps(opts: { limit: number }): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const limit = Math.max(1, Math.min(100, Math.round(opts.limit)));
  const rows = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: SERVICE_SLUG },
    select: { ownerId: true, dataJson: true },
    take: 100,
  });

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const now = new Date();

  for (const row of rows) {
    if (processed >= limit) break;
    const service = parseServiceData(row.dataJson);
    const due = service.queue
      .filter((q) => q.status === "PENDING" && new Date(q.sendAtIso) <= now)
      .sort((a, b) => a.sendAtIso.localeCompare(b.sendAtIso));

    if (!due.length) continue;

    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    const profile = await prisma.businessProfile.findUnique({ where: { ownerId: row.ownerId }, select: { businessName: true } }).catch(() => null);
    const fromName = profile?.businessName?.trim() || "Purely Automation";

    const nextQueue = service.queue.slice();
    let changed = false;

    for (const msg of due) {
      if (processed >= limit) break;
      const idx = nextQueue.findIndex((x) => x.id === msg.id);
      if (idx < 0) continue;
      // Re-check pending
      if (nextQueue[idx]!.status !== "PENDING") continue;

      processed++;

      try {
        if (msg.channel === "EMAIL") {
          if (!apiKey || !fromEmail) {
            skipped++;
            nextQueue[idx] = { ...nextQueue[idx]!, status: "FAILED", attempts: msg.attempts + 1, lastError: "Email not configured" };
            changed = true;
            continue;
          }

          const subject = (msg.subject || "Follow-up").slice(0, 120);
          const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: msg.to }] }],
              from: { email: fromEmail, name: fromName },
              subject,
              content: [{ type: "text/plain", value: msg.body }],
            }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            failed++;
            nextQueue[idx] = {
              ...nextQueue[idx]!,
              status: "FAILED",
              attempts: msg.attempts + 1,
              lastError: `SendGrid failed (${res.status}): ${text.slice(0, 400)}`,
            };
            changed = true;
            continue;
          }

          sent++;
          nextQueue[idx] = { ...nextQueue[idx]!, status: "SENT", sentAtIso: nowIso(), lastError: undefined };
          changed = true;
        } else {
          if (!accountSid || !authToken || !fromNumber) {
            skipped++;
            nextQueue[idx] = { ...nextQueue[idx]!, status: "FAILED", attempts: msg.attempts + 1, lastError: "Texting not configured" };
            changed = true;
            continue;
          }

          const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
          const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
          const form = new URLSearchParams();
          form.set("To", msg.to);
          form.set("From", fromNumber);
          form.set("Body", msg.body.slice(0, 900));

          const res = await fetch(url, {
            method: "POST",
            headers: {
              authorization: `Basic ${basic}`,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: form.toString(),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            failed++;
            nextQueue[idx] = {
              ...nextQueue[idx]!,
              status: "FAILED",
              attempts: msg.attempts + 1,
              lastError: `Twilio failed (${res.status}): ${text.slice(0, 400)}`,
            };
            changed = true;
            continue;
          }

          sent++;
          nextQueue[idx] = { ...nextQueue[idx]!, status: "SENT", sentAtIso: nowIso(), lastError: undefined };
          changed = true;
        }
      } catch (e) {
        failed++;
        nextQueue[idx] = {
          ...nextQueue[idx]!,
          status: "FAILED",
          attempts: msg.attempts + 1,
          lastError: e instanceof Error ? e.message : "Unknown error",
        };
        changed = true;
      }
    }

    if (changed) {
      const payload: any = { version: 1, settings: service.settings, queue: nextQueue };
      await prisma.portalServiceSetup.updateMany({
        where: { ownerId: row.ownerId, serviceSlug: SERVICE_SLUG },
        data: { dataJson: payload, status: "COMPLETE" },
      });
    }
  }

  return { processed, sent, skipped, failed };
}
