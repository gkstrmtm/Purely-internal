import { prisma } from "@/lib/db";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";

export type FollowUpChannel = "EMAIL" | "SMS";

export type FollowUpTemplate = {
  id: string;
  name: string;
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

export type FollowUpSettings = {
  version: 2;
  enabled: boolean;
  templates: FollowUpTemplate[];
  assignments: {
    defaultTemplateIds: string[];
    calendarTemplateIds: Record<string, string[]>;
  };
  customVariables: Record<string, string>;
};

export type FollowUpQueueItem = {
  id: string;
  bookingId: string;
  ownerId: string;
  templateId: string;
  templateName: string;
  calendarId?: string;
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
  version: 2;
  settings: FollowUpSettings;
  queue: FollowUpQueueItem[];
  bookingMeta?: Record<string, { calendarId?: string; updatedAtIso?: string }>;
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

function normalizeId(v: unknown, fallback: string) {
  const raw = typeof v === "string" ? v.trim() : "";
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function normalizeStringRecord(v: unknown, maxEntries: number, maxKeyLen: number, maxValLen: number) {
  const rec = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  const keyOk = /^[a-zA-Z][a-zA-Z0-9_]*$/;
  const reserved = new Set([
    "contactName",
    "contactEmail",
    "contactPhone",
    "businessName",
    "bookingTitle",
    "startAt",
    "endAt",
    "when",
    "timeZone",
  ]);

  for (const [k0, v0] of Object.entries(rec)) {
    if (Object.keys(out).length >= maxEntries) break;
    const k = String(k0).trim().slice(0, maxKeyLen);
    if (!k || !keyOk.test(k)) continue;
    if (reserved.has(k)) continue;
    const value = typeof v0 === "string" ? v0 : String(v0 ?? "");
    out[k] = value.trim().slice(0, maxValLen);
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function defaultFollowUpSettings(): FollowUpSettings {
  return {
    version: 2,
    enabled: false,
    templates: [
      {
        id: "thanks",
        name: "Quick thank you",
        enabled: true,
        delayMinutes: 60,
        channels: { email: true, sms: false },
        email: {
          subjectTemplate: "Thanks for meeting, {contactName}",
          bodyTemplate: [
            "Hi {contactName},",
            "",
            "Thanks again for booking time with {businessName}.",
            "",
            "If you have any questions, just reply to this email.",
            "",
            "— {businessName}",
          ].join("\n"),
        },
        sms: {
          bodyTemplate: "Thanks again for your time — reply here if you have any questions. — {businessName}",
        },
      },
      {
        id: "feedback",
        name: "Feedback request",
        enabled: false,
        delayMinutes: 60 * 24,
        channels: { email: true, sms: false },
        email: {
          subjectTemplate: "Quick question about our call",
          bodyTemplate: [
            "Hi {contactName},",
            "",
            "Do you have any feedback on our conversation?",
            "",
            "One sentence is totally fine — it helps {businessName} a lot.",
            "",
            "— {businessName}",
          ].join("\n"),
        },
        sms: {
          bodyTemplate: "Any quick feedback on our call? One sentence helps a lot. — {businessName}",
        },
      },
      {
        id: "next_steps",
        name: "Next steps",
        enabled: false,
        delayMinutes: 60 * 3,
        channels: { email: true, sms: false },
        email: {
          subjectTemplate: "Next steps",
          bodyTemplate: [
            "Hi {contactName},",
            "",
            "Here are the next steps from our call with {businessName}:",
            "- ",
            "",
            "If you'd like, just reply with any questions.",
            "",
            "— {businessName}",
          ].join("\n"),
        },
        sms: {
          bodyTemplate: "Next steps from our call — reply here if you want me to send them over. — {businessName}",
        },
      },
      {
        id: "review",
        name: "Review / testimonial",
        enabled: false,
        delayMinutes: 60 * 24 * 3,
        channels: { email: true, sms: false },
        email: {
          subjectTemplate: "Would you be open to a quick review?",
          bodyTemplate: [
            "Hi {contactName},",
            "",
            "If you found our call helpful, would you be open to leaving a quick review for {businessName}?",
            "",
            "No worries either way — thanks again.",
            "",
            "— {businessName}",
          ].join("\n"),
        },
        sms: {
          bodyTemplate: "If our call helped, would you be open to leaving a quick review for {businessName}? — {businessName}",
        },
      },
    ],
    assignments: {
      defaultTemplateIds: ["thanks"],
      calendarTemplateIds: {},
    },
    customVariables: {},
  };
}

export function parseFollowUpSettings(value: unknown): FollowUpSettings {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const settingsRaw =
    rec.settings && typeof rec.settings === "object" && !Array.isArray(rec.settings)
      ? (rec.settings as Record<string, unknown>)
      : rec;

  const defaults = defaultFollowUpSettings();
  const version = settingsRaw.version === 2 ? 2 : settingsRaw.version === 1 ? 1 : undefined;

  // Back-compat: v1 settings become a single template + additional defaults (disabled) for convenience.
  if (version === 1) {
    const channelsRaw =
      settingsRaw.channels && typeof settingsRaw.channels === "object" && !Array.isArray(settingsRaw.channels)
        ? (settingsRaw.channels as Record<string, unknown>)
        : {};
    const emailRaw =
      settingsRaw.email && typeof settingsRaw.email === "object" && !Array.isArray(settingsRaw.email)
        ? (settingsRaw.email as Record<string, unknown>)
        : {};
    const smsRaw =
      settingsRaw.sms && typeof settingsRaw.sms === "object" && !Array.isArray(settingsRaw.sms)
        ? (settingsRaw.sms as Record<string, unknown>)
        : {};

    const primary: FollowUpTemplate = {
      id: "default",
      name: "Default follow-up",
      enabled: true,
      delayMinutes: clampInt(settingsRaw.delayMinutes, 60, 0, 60 * 24 * 30),
      channels: {
        email: normalizeBool(channelsRaw.email, true),
        sms: normalizeBool(channelsRaw.sms, false),
      },
      email: {
        subjectTemplate: normalizeString(emailRaw.subjectTemplate, defaults.templates[0]!.email.subjectTemplate, 200),
        bodyTemplate: normalizeString(emailRaw.bodyTemplate, defaults.templates[0]!.email.bodyTemplate, 5000),
      },
      sms: {
        bodyTemplate: normalizeString(smsRaw.bodyTemplate, defaults.templates[0]!.sms.bodyTemplate, 900),
      },
    };

    const extraDefaults = defaults.templates
      .filter((t) => t.id !== "thanks")
      .map((t) => ({ ...t, enabled: false }));

    return {
      version: 2,
      enabled: normalizeBool(settingsRaw.enabled, defaults.enabled),
      templates: [primary, ...extraDefaults].slice(0, 20),
      assignments: {
        defaultTemplateIds: ["default"],
        calendarTemplateIds: {},
      },
      customVariables: {},
    };
  }

  const templatesRaw = Array.isArray(settingsRaw.templates) ? settingsRaw.templates : [];
  const templates: FollowUpTemplate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < templatesRaw.length; i += 1) {
    const item = templatesRaw[i] && typeof templatesRaw[i] === "object" && !Array.isArray(templatesRaw[i])
      ? (templatesRaw[i] as Record<string, unknown>)
      : null;
    if (!item) continue;

    const id = normalizeId(item.id, `tpl${i + 1}`).slice(0, 40);
    if (seen.has(id)) continue;
    seen.add(id);

    const name = normalizeString(item.name, "Template", 80).trim();
    if (!name) continue;

    const channelsRaw = item.channels && typeof item.channels === "object" && !Array.isArray(item.channels)
      ? (item.channels as Record<string, unknown>)
      : {};

    const emailRaw = item.email && typeof item.email === "object" && !Array.isArray(item.email)
      ? (item.email as Record<string, unknown>)
      : {};
    const smsRaw = item.sms && typeof item.sms === "object" && !Array.isArray(item.sms)
      ? (item.sms as Record<string, unknown>)
      : {};

    const t: FollowUpTemplate = {
      id,
      name,
      enabled: normalizeBool(item.enabled, true),
      delayMinutes: clampInt(item.delayMinutes, 60, 0, 60 * 24 * 30),
      channels: {
        email: normalizeBool(channelsRaw.email, true),
        sms: normalizeBool(channelsRaw.sms, false),
      },
      email: {
        subjectTemplate: normalizeString(emailRaw.subjectTemplate, defaults.templates[0]!.email.subjectTemplate, 200),
        bodyTemplate: normalizeString(emailRaw.bodyTemplate, defaults.templates[0]!.email.bodyTemplate, 5000),
      },
      sms: {
        bodyTemplate: normalizeString(smsRaw.bodyTemplate, defaults.templates[0]!.sms.bodyTemplate, 900),
      },
    };

    templates.push(t);
    if (templates.length >= 20) break;
  }

  const assignmentsRaw =
    settingsRaw.assignments && typeof settingsRaw.assignments === "object" && !Array.isArray(settingsRaw.assignments)
      ? (settingsRaw.assignments as Record<string, unknown>)
      : {};

  const defaultTemplateIdsRaw = Array.isArray(assignmentsRaw.defaultTemplateIds) ? assignmentsRaw.defaultTemplateIds : [];
  const defaultTemplateIds = defaultTemplateIdsRaw
    .filter((x) => typeof x === "string")
    .map((x) => normalizeId(x, "").slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);

  const calendarTemplateIdsRaw =
    assignmentsRaw.calendarTemplateIds && typeof assignmentsRaw.calendarTemplateIds === "object" && !Array.isArray(assignmentsRaw.calendarTemplateIds)
      ? (assignmentsRaw.calendarTemplateIds as Record<string, unknown>)
      : {};
  const calendarTemplateIds: Record<string, string[]> = {};
  for (const [calId0, list0] of Object.entries(calendarTemplateIdsRaw)) {
    const calId = normalizeId(calId0, "").slice(0, 40);
    if (!calId) continue;
    const list = Array.isArray(list0) ? list0 : [];
    const ids = list
      .filter((x) => typeof x === "string")
      .map((x) => normalizeId(x, "").slice(0, 40))
      .filter(Boolean)
      .slice(0, 10);
    calendarTemplateIds[calId] = ids;
  }

  const customVariables = normalizeStringRecord(settingsRaw.customVariables, 30, 32, 800);

  return {
    version: 2,
    enabled: normalizeBool(settingsRaw.enabled, defaults.enabled),
    templates: templates.length ? templates : defaults.templates,
    assignments: {
      defaultTemplateIds: defaultTemplateIds.length ? defaultTemplateIds : defaults.assignments.defaultTemplateIds,
      calendarTemplateIds,
    },
    customVariables,
  };
}

function parseServiceData(value: unknown): ServiceData {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const settings = parseFollowUpSettings(rec.settings ?? rec);
  const queueRaw = Array.isArray(rec.queue) ? rec.queue : [];
  const bookingMetaRaw = rec.bookingMeta;

  const queue: FollowUpQueueItem[] = [];
  for (const item of queueRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : null;
    const bookingId = typeof r.bookingId === "string" ? r.bookingId : null;
    const ownerId = typeof r.ownerId === "string" ? r.ownerId : null;
    const templateId = typeof r.templateId === "string" ? r.templateId : "default";
    const templateName = typeof r.templateName === "string" ? r.templateName : "Template";
    const calendarId = typeof r.calendarId === "string" ? r.calendarId : undefined;
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
      templateId,
      templateName,
      calendarId,
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

  const bookingMeta: ServiceData["bookingMeta"] =
    bookingMetaRaw && typeof bookingMetaRaw === "object" && !Array.isArray(bookingMetaRaw)
      ? (bookingMetaRaw as Record<string, { calendarId?: string; updatedAtIso?: string }>)
      : undefined;

  return { version: 2, settings, queue, bookingMeta };
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
    version: 2,
    settings: merged,
    queue: current.queue,
    bookingMeta: current.bookingMeta ?? {},
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

export async function scheduleFollowUpsForBooking(
  ownerId: string,
  bookingId: string,
  ctx?: { calendarId?: string },
): Promise<{ ok: true; scheduled: number } | { ok: false; reason: string }> {
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

  const nextBookingMeta: Record<string, { calendarId?: string; updatedAtIso?: string }> = {
    ...(service.bookingMeta ?? {}),
  };

  const previousCalendarId = nextBookingMeta[bookingId]?.calendarId;
  const calendarId = ctx?.calendarId ?? previousCalendarId;

  // Persist booking -> calendar linkage (no DB migrations required).
  if (calendarId) {
    nextBookingMeta[bookingId] = { calendarId, updatedAtIso: nowIso() };
  }

  const calendars = calendarId ? await getBookingCalendarsConfig(ownerId).catch(() => null) : null;
  const calendarTitle = calendarId ? calendars?.calendars?.find((c) => c.id === calendarId)?.title : null;
  const bookingTitle = calendarTitle?.trim() || site.title;
  const when = `${formatInTimeZone(new Date(bookingRow.startAt), site.timeZone)} (${site.timeZone})`;

  const vars: Record<string, string> = {
    contactName: String(bookingRow.contactName || "").trim(),
    contactEmail: String(bookingRow.contactEmail || "").trim(),
    contactPhone: String(bookingRow.contactPhone || "").trim(),
    businessName,
    bookingTitle,
    timeZone: site.timeZone,
    startAt: new Date(bookingRow.startAt).toISOString(),
    endAt: new Date(bookingRow.endAt).toISOString(),
    when,
    ...settings.customVariables,
  };

  const nextQueue = [...service.queue];
  const before = nextQueue.length;

  const selectedTemplateIds = (() => {
    const list = calendarId ? settings.assignments.calendarTemplateIds[calendarId] : null;
    const ids = Array.isArray(list) && list.length ? list : settings.assignments.defaultTemplateIds;
    return ids.filter((x) => typeof x === "string" && x.trim()).slice(0, 10);
  })();

  const templateById = new Map(settings.templates.map((t) => [t.id, t] as const));
  const desiredKeys = new Set<string>();

  function upsert(template: FollowUpTemplate, channel: FollowUpChannel, to: string, subject: string | undefined, body: string, sendAt: Date) {
    const desiredKey = `${bookingRow.id}:${template.id}:${channel}`;
    desiredKeys.add(desiredKey);

    const existingIndex = nextQueue.findIndex(
      (x) => x.bookingId === bookingRow.id && x.templateId === template.id && x.channel === channel && x.status === "PENDING",
    );
    const base: FollowUpQueueItem = {
      id: existingIndex >= 0 ? nextQueue[existingIndex]!.id : randomId("fu"),
      bookingId: bookingRow.id,
      ownerId,
      templateId: template.id,
      templateName: template.name,
      calendarId: calendarId || undefined,
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

  // Cancel any pending messages for this booking that are no longer desired.
  for (let i = 0; i < nextQueue.length; i += 1) {
    const q = nextQueue[i]!;
    if (q.bookingId !== bookingRow.id) continue;
    if (q.status !== "PENDING") continue;
    const key = `${q.bookingId}:${q.templateId}:${q.channel}`;
    // We'll keep it for now; after scheduling we cancel anything not in desiredKeys.
    // (No-op here.)
  }

  for (const templateId of selectedTemplateIds) {
    const template = templateById.get(templateId);
    if (!template) continue;
    if (!template.enabled) continue;

    const sendAt = new Date(new Date(bookingRow.endAt).getTime() + template.delayMinutes * 60_000);

    if (template.channels.email && bookingRow.contactEmail) {
      const subject = renderTemplate(template.email.subjectTemplate, vars).slice(0, 120);
      const body = renderTemplate(template.email.bodyTemplate, vars).slice(0, 5000);
      upsert(template, "EMAIL", bookingRow.contactEmail, subject, body, sendAt);
    }
    if (template.channels.sms && bookingRow.contactPhone) {
      const body = renderTemplate(template.sms.bodyTemplate, vars).slice(0, 900);
      upsert(template, "SMS", bookingRow.contactPhone, undefined, body, sendAt);
    }
  }

  // Now cancel pending items that are no longer selected.
  for (let i = 0; i < nextQueue.length; i += 1) {
    const q = nextQueue[i]!;
    if (q.bookingId !== bookingRow.id) continue;
    if (q.status !== "PENDING") continue;
    const key = `${q.bookingId}:${q.templateId}:${q.channel}`;
    if (!desiredKeys.has(key)) {
      nextQueue[i] = { ...q, status: "CANCELED" };
    }
  }

  // Trim queue: keep most recent items, but preserve pending.
  const pending = nextQueue.filter((q) => q.status === "PENDING");
  const done = nextQueue
    .filter((q) => q.status !== "PENDING")
    .sort((a, b) => (b.createdAtIso || "").localeCompare(a.createdAtIso || ""))
    .slice(0, Math.max(0, MAX_QUEUE_ITEMS - pending.length));
  const trimmed = [...pending, ...done].slice(0, MAX_QUEUE_ITEMS);

  const metaEntries = Object.entries(nextBookingMeta)
    .sort((a, b) => (b[1].updatedAtIso || "").localeCompare(a[1].updatedAtIso || ""))
    .slice(0, 200);
  const trimmedMeta = Object.fromEntries(metaEntries);

  const payload: any = { version: 2, settings, queue: trimmed, bookingMeta: trimmedMeta };
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
  const payload: any = { version: 2, settings: service.settings, queue: nextQueue, bookingMeta: service.bookingMeta ?? {} };
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
              lastError: `Email send failed (${res.status}): ${text.slice(0, 400)}`,
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
              lastError: `SMS send failed (${res.status}): ${text.slice(0, 400)}`,
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
      const payload: any = { version: 2, settings: service.settings, queue: nextQueue, bookingMeta: service.bookingMeta ?? {} };
      await prisma.portalServiceSetup.updateMany({
        where: { ownerId: row.ownerId, serviceSlug: SERVICE_SLUG },
        data: { dataJson: payload, status: "COMPLETE" },
      });
    }
  }

  return { processed, sent, skipped, failed };
}
