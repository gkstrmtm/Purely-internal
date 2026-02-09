import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";
import { sendOwnerTwilioSms, getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";

const SERVICE_SLUG = "appointment-reminders";

const MAX_EVENTS = 200;
const MAX_SENT_KEYS = 4000;
const MAX_BODY_LEN = 900;

export type AppointmentReminderLeadTimeUnit = "minutes" | "hours" | "days" | "weeks";

export type AppointmentReminderChannel = "SMS" | "EMAIL";

export type AppointmentReminderLeadTime = {
  value: number;
  unit: AppointmentReminderLeadTimeUnit;
};

export type AppointmentReminderSettings = {
  version: 3;
  enabled: boolean;
  channel: AppointmentReminderChannel;
  steps: AppointmentReminderStep[];
};

export type AppointmentReminderStep = {
  id: string;
  enabled: boolean;
  leadTime: AppointmentReminderLeadTime;
  messageBody: string;
};

export type AppointmentReminderEvent = {
  id: string;
  bookingId: string;
  calendarId?: string;
  bookingStartAtIso: string;
  scheduledForIso: string;

  stepId: string;
  stepLeadTimeMinutes: number;

  contactName: string;
  contactPhoneRaw: string | null;
  contactEmailRaw?: string | null;

  channel?: AppointmentReminderChannel;
  to?: string | null;
  body?: string | null;

  smsTo: string | null;
  smsBody: string | null;

  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
  smsMessageSid?: string;
  error?: string;

  createdAtIso: string;
};

export type AppointmentReminderBookingMeta = {
  calendarId?: string;
  updatedAtIso: string;
};

type AppointmentRemindersServiceData = {
  version: 2;
  defaultSettings: AppointmentReminderSettings;
  calendarSettings?: Record<string, AppointmentReminderSettings>;
  bookingMeta?: Record<string, AppointmentReminderBookingMeta>;
  sentKeys: string[];
  events: AppointmentReminderEvent[];
};

function nowIso() {
  return new Date().toISOString();
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeUnit(raw: unknown): AppointmentReminderLeadTimeUnit {
  return raw === "minutes" || raw === "hours" || raw === "days" || raw === "weeks" ? raw : "minutes";
}

function toLeadTimeMinutes(leadTime: AppointmentReminderLeadTime): number {
  const value = clampInt(leadTime.value, 0, 10_000_000);
  const unit = normalizeUnit(leadTime.unit);
  const mul = unit === "weeks" ? 60 * 24 * 7 : unit === "days" ? 60 * 24 : unit === "hours" ? 60 : 1;
  return clampInt(value * mul, 5, 60 * 24 * 14);
}

function normalizeLeadTime(raw: unknown, fallbackMinutes: number): AppointmentReminderLeadTime {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    const unit = normalizeUnit(rec.unit);
    const valueRaw = rec.value;
    const maxByUnit = unit === "weeks" ? 2 : unit === "days" ? 14 : unit === "hours" ? 24 * 14 : 60 * 24 * 14;
    const minByUnit = unit === "minutes" ? 5 : 1;
    const rawValue = typeof valueRaw === "number" ? valueRaw : unit === "minutes" ? fallbackMinutes : 1;
    const value = clampInt(rawValue, minByUnit, maxByUnit);
    if (unit === "minutes") return { value, unit };
    return { value, unit };
  }

  const minutes = clampInt(fallbackMinutes, 5, 60 * 24 * 14);
  return { value: minutes, unit: "minutes" };
}

function normalizeCalendarId(raw: unknown): string | undefined {
  const v = typeof raw === "string" ? raw.trim() : "";
  const cleaned = v.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned ? cleaned.slice(0, 50) : undefined;
}

export function parseAppointmentReminderSettings(raw: unknown): AppointmentReminderSettings {
  const baseStep: AppointmentReminderStep = {
    id: "step_1",
    enabled: true,
    leadTime: { value: 1, unit: "hours" },
    messageBody: "Reminder: your appointment is scheduled for {when}.",
  };

  const base: AppointmentReminderSettings = {
    version: 3,
    enabled: false,
    channel: "SMS",
    steps: [baseStep],
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  // Back-compat: v1 shape { enabled, leadTimeMinutes, messageBody }
  const isV1 =
    rec.version === 1 || ("leadTimeMinutes" in rec && "messageBody" in rec && !Array.isArray((rec as any).steps));
  if (isV1) {
    const enabled = typeof rec.enabled === "boolean" ? rec.enabled : base.enabled;
    const leadTimeMinutes = clampInt(
      typeof rec.leadTimeMinutes === "number" ? rec.leadTimeMinutes : 60,
      5,
      60 * 24 * 14,
    );
    const messageBody =
      typeof rec.messageBody === "string" ? rec.messageBody.slice(0, MAX_BODY_LEN).trim() : baseStep.messageBody;

    return {
      version: 3,
      enabled,
      channel: "SMS",
      steps: [
        {
          id: "step_1",
          enabled: true,
          leadTime: normalizeLeadTime(null, leadTimeMinutes),
          messageBody: messageBody || baseStep.messageBody,
        },
      ],
    };
  }

  // Back-compat: v2 steps with leadTimeMinutes.
  if (rec.version === 2) {
    const enabled = typeof rec.enabled === "boolean" ? rec.enabled : base.enabled;
    const steps = Array.isArray(rec.steps)
      ? (rec.steps as unknown[])
          .flatMap((s) => {
            if (!s || typeof s !== "object" || Array.isArray(s)) return [] as AppointmentReminderStep[];
            const r = s as Record<string, unknown>;
            const id = typeof r.id === "string" ? r.id.trim() : "";
            const stepEnabled = typeof r.enabled === "boolean" ? r.enabled : true;
            const leadTimeMinutes = clampInt(typeof r.leadTimeMinutes === "number" ? r.leadTimeMinutes : 60, 5, 60 * 24 * 14);
            const messageBody =
              typeof r.messageBody === "string" ? r.messageBody.slice(0, MAX_BODY_LEN).trim() : baseStep.messageBody;
            if (!id) return [] as AppointmentReminderStep[];
            if (!messageBody.trim()) return [] as AppointmentReminderStep[];
            return [
              {
                id: id.slice(0, 40),
                enabled: stepEnabled,
                leadTime: normalizeLeadTime(null, leadTimeMinutes),
                messageBody: messageBody.trim(),
              },
            ];
          })
          .slice(0, 8)
      : [];

    return { version: 3, enabled, channel: "SMS", steps: steps.length ? steps : [baseStep] };
  }

  const enabled = typeof rec.enabled === "boolean" ? rec.enabled : base.enabled;

  const channelRaw = typeof rec.channel === "string" ? rec.channel.trim().toUpperCase() : "";
  const channel: AppointmentReminderChannel = channelRaw === "EMAIL" ? "EMAIL" : "SMS";

  const steps = Array.isArray(rec.steps)
    ? (rec.steps as unknown[])
        .flatMap((s) => {
          if (!s || typeof s !== "object" || Array.isArray(s)) return [] as AppointmentReminderStep[];
          const r = s as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id.trim() : "";
          const stepEnabled = typeof r.enabled === "boolean" ? r.enabled : true;
          const leadTime = normalizeLeadTime(r.leadTime, 60);
          const messageBody =
            typeof r.messageBody === "string" ? r.messageBody.slice(0, MAX_BODY_LEN).trim() : baseStep.messageBody;
          if (!id) return [] as AppointmentReminderStep[];
          if (!messageBody.trim()) return [] as AppointmentReminderStep[];
          return [
            {
              id: id.slice(0, 40),
              enabled: stepEnabled,
              leadTime,
              messageBody: messageBody.trim(),
            },
          ];
        })
        .slice(0, 8)
    : [];

  return {
    version: 3,
    enabled,
    channel,
    steps: steps.length ? steps : [baseStep],
  };
}

function isEmailLike(raw: string) {
  const s = (raw || "").trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

async function sendAppointmentReminderEmail(opts: { to: string; subject: string; text: string; fromName?: string }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) throw new Error("Email is not configured yet.");

  const to = opts.to.trim();
  if (!isEmailLike(to)) throw new Error("Invalid email address");

  const subject = (opts.subject || "Appointment reminder").trim().slice(0, 120) || "Appointment reminder";
  const text = (opts.text || "").trim() || " ";

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: opts.fromName ?? "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: text.slice(0, 20000) }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SendGrid failed (${res.status}): ${t.slice(0, 400)}`);
  }
}

function parseServiceData(raw: unknown): AppointmentRemindersServiceData {
  const base: AppointmentRemindersServiceData = {
    version: 2,
    defaultSettings: parseAppointmentReminderSettings(null),
    calendarSettings: {},
    bookingMeta: {},
    sentKeys: [],
    events: [],
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const defaultSettings = "defaultSettings" in rec
    ? parseAppointmentReminderSettings(rec.defaultSettings)
    : parseAppointmentReminderSettings((rec as any).settings);

  const calendarSettingsRaw = rec.calendarSettings && typeof rec.calendarSettings === "object" && !Array.isArray(rec.calendarSettings)
    ? (rec.calendarSettings as Record<string, unknown>)
    : null;
  const calendarSettings: Record<string, AppointmentReminderSettings> = {};
  if (calendarSettingsRaw) {
    for (const [k, v] of Object.entries(calendarSettingsRaw)) {
      const calendarId = normalizeCalendarId(k);
      if (!calendarId) continue;
      calendarSettings[calendarId] = parseAppointmentReminderSettings(v);
    }
  }

  const bookingMetaRaw = rec.bookingMeta && typeof rec.bookingMeta === "object" && !Array.isArray(rec.bookingMeta)
    ? (rec.bookingMeta as Record<string, unknown>)
    : null;
  const bookingMeta: Record<string, AppointmentReminderBookingMeta> = {};
  if (bookingMetaRaw) {
    const keys = Object.keys(bookingMetaRaw);
    for (const bookingId of keys.slice(0, 6000)) {
      const item = bookingMetaRaw[bookingId];
      if (!bookingId || typeof bookingId !== "string") continue;
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const r = item as Record<string, unknown>;
      const calendarId = normalizeCalendarId(r.calendarId);
      const updatedAtIso = typeof r.updatedAtIso === "string" ? r.updatedAtIso : nowIso();
      bookingMeta[bookingId] = { ...(calendarId ? { calendarId } : {}), updatedAtIso };
    }
  }

  const sentKeys = Array.isArray(rec.sentKeys)
    ? (rec.sentKeys as unknown[]).flatMap((x) => (typeof x === "string" && x.trim() ? [x] : [])).slice(0, MAX_SENT_KEYS)
    : [];

  const events = Array.isArray(rec.events)
    ? (rec.events as unknown[])
        .flatMap((e) => {
          if (!e || typeof e !== "object" || Array.isArray(e)) return [] as AppointmentReminderEvent[];
          const r = e as Record<string, unknown>;
          const bookingId = typeof r.bookingId === "string" ? r.bookingId : "";
          const calendarId = normalizeCalendarId(r.calendarId);
          const bookingStartAtIso = typeof r.bookingStartAtIso === "string" ? r.bookingStartAtIso : "";
          const scheduledForIso = typeof r.scheduledForIso === "string" ? r.scheduledForIso : "";
          const stepId = typeof r.stepId === "string" ? r.stepId : "step_1";
          const stepLeadTimeMinutes =
            typeof r.stepLeadTimeMinutes === "number" && Number.isFinite(r.stepLeadTimeMinutes)
              ? Math.round(r.stepLeadTimeMinutes)
              : 60;
          const contactName = typeof r.contactName === "string" ? r.contactName : "";
          const createdAtIso = typeof r.createdAtIso === "string" ? r.createdAtIso : nowIso();

          const status = r.status === "SENT" || r.status === "SKIPPED" || r.status === "FAILED" ? r.status : "SKIPPED";

          if (!bookingId || !bookingStartAtIso || !scheduledForIso) return [] as AppointmentReminderEvent[];

          const evt: AppointmentReminderEvent = {
            id: typeof r.id === "string" ? r.id : `evt_${bookingId}`,
            bookingId,
            ...(calendarId ? { calendarId } : {}),
            bookingStartAtIso,
            scheduledForIso,

            stepId,
            stepLeadTimeMinutes,

            contactName,
            contactPhoneRaw: typeof r.contactPhoneRaw === "string" ? r.contactPhoneRaw : null,
            smsTo: typeof r.smsTo === "string" ? r.smsTo : null,
            smsBody: typeof r.smsBody === "string" ? r.smsBody : null,
            status,
            ...(typeof r.reason === "string" ? { reason: r.reason } : {}),
            ...(typeof r.smsMessageSid === "string" ? { smsMessageSid: r.smsMessageSid } : {}),
            ...(typeof r.error === "string" ? { error: r.error } : {}),
            createdAtIso,
          };

          return [evt];
        })
        .slice(0, MAX_EVENTS)
    : [];

  return { version: 2, defaultSettings, calendarSettings, bookingMeta, sentKeys, events };
}

export async function getAppointmentRemindersServiceData(ownerId: string): Promise<AppointmentRemindersServiceData> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseServiceData(row?.dataJson ?? null);
}

export async function getAppointmentReminderSettingsForCalendar(
  ownerId: string,
  calendarId?: string | null,
): Promise<{ settings: AppointmentReminderSettings; calendarId?: string; isOverride: boolean }> {
  const data = await getAppointmentRemindersServiceData(ownerId);
  const cal = normalizeCalendarId(calendarId);
  if (cal) {
    const override = data.calendarSettings?.[cal] ?? null;
    if (override) return { settings: override, calendarId: cal, isOverride: true };
    return { settings: data.defaultSettings, calendarId: cal, isOverride: false };
  }
  return { settings: data.defaultSettings, isOverride: true };
}

export async function setAppointmentReminderSettingsForCalendar(
  ownerId: string,
  calendarId: string | null | undefined,
  settings: AppointmentReminderSettings,
): Promise<AppointmentReminderSettings> {
  const current = await getAppointmentRemindersServiceData(ownerId);
  const cal = normalizeCalendarId(calendarId);

  const nextCalendarSettings = { ...(current.calendarSettings ?? {}) };
  if (cal) nextCalendarSettings[cal] = settings;

  const payload: AppointmentRemindersServiceData = {
    version: 2,
    defaultSettings: cal ? current.defaultSettings : settings,
    calendarSettings: cal ? nextCalendarSettings : nextCalendarSettings,
    bookingMeta: current.bookingMeta ?? {},
    sentKeys: current.sentKeys.slice(0, MAX_SENT_KEYS),
    events: current.events.slice(0, MAX_EVENTS),
  };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload as any },
    update: { status: "COMPLETE", dataJson: payload as any },
    select: { dataJson: true },
  });

  const parsed = parseServiceData(row.dataJson);
  if (cal) return parsed.calendarSettings?.[cal] ?? parsed.defaultSettings;
  return parsed.defaultSettings;
}

export async function recordAppointmentReminderBookingMeta(
  ownerId: string,
  bookingId: string,
  meta: { calendarId?: string | null },
) {
  const bookingKey = typeof bookingId === "string" ? bookingId.trim() : "";
  const calendarId = normalizeCalendarId(meta.calendarId);
  if (!bookingKey) return;

  const current = await getAppointmentRemindersServiceData(ownerId);
  const nextBookingMeta: Record<string, AppointmentReminderBookingMeta> = {
    ...(current.bookingMeta ?? {}),
    [bookingKey]: { ...(calendarId ? { calendarId } : {}), updatedAtIso: nowIso() },
  };

  const bookingIds = Object.keys(nextBookingMeta);
  if (bookingIds.length > 6000) {
    bookingIds
      .sort((a, b) => (nextBookingMeta[b]?.updatedAtIso ?? "").localeCompare(nextBookingMeta[a]?.updatedAtIso ?? ""))
      .slice(6000)
      .forEach((id) => {
        delete nextBookingMeta[id];
      });
  }

  const payload: AppointmentRemindersServiceData = {
    version: 2,
    defaultSettings: current.defaultSettings,
    calendarSettings: current.calendarSettings ?? {},
    bookingMeta: nextBookingMeta,
    sentKeys: current.sentKeys.slice(0, MAX_SENT_KEYS),
    events: current.events.slice(0, MAX_EVENTS),
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload as any },
    update: { status: "COMPLETE", dataJson: payload as any },
    select: { id: true },
  });
}

export async function listAppointmentReminderEvents(ownerId: string, limit = 50): Promise<AppointmentReminderEvent[]> {
  const data = await getAppointmentRemindersServiceData(ownerId);
  const n = clampInt(limit, 1, 200);
  return data.events
    .slice()
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
    .slice(0, n);
}

function formatWhen(startAt: Date, timeZone: string) {
  try {
    return startAt.toLocaleString(undefined, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return startAt.toLocaleString();
  }
}

export function renderAppointmentReminderBody(template: string, vars: Record<string, string>) {
  const safe = String(template || "").slice(0, MAX_BODY_LEN);
  return renderTextTemplate(safe, vars).trim();
}

export async function processDueAppointmentReminders(opts?: { ownersLimit?: number; perOwnerLimit?: number; windowMinutes?: number }) {
  const ownersLimit = clampInt(opts?.ownersLimit ?? 1000, 1, 5000);
  const perOwnerLimit = clampInt(opts?.perOwnerLimit ?? 25, 1, 100);
  const windowMinutes = clampInt(opts?.windowMinutes ?? 5, 1, 60);

  let scannedOwners = 0;
  let remindersSent = 0;
  let remindersFailed = 0;
  let remindersSkipped = 0;

  let cursorId: string | undefined;

  while (scannedOwners < ownersLimit) {
    const rows = await prisma.portalServiceSetup.findMany({
      where: { serviceSlug: SERVICE_SLUG },
      orderBy: { id: "asc" },
      take: Math.min(200, ownersLimit - scannedOwners),
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true, ownerId: true, dataJson: true },
    });

    if (rows.length === 0) break;
    cursorId = rows[rows.length - 1].id;

    for (const row of rows) {
      scannedOwners += 1;

      const serviceData = parseServiceData(row.dataJson);
      const enabledSettings: AppointmentReminderSettings[] = [];
      if (serviceData.defaultSettings?.enabled) enabledSettings.push(serviceData.defaultSettings);
      const calendarEntries = Object.entries(serviceData.calendarSettings ?? {});
      for (const [, s] of calendarEntries) {
        if (s?.enabled) enabledSettings.push(s);
      }

      if (enabledSettings.length === 0) continue;

      const allLeadTimes = new Set<number>();
      for (const s of enabledSettings) {
        for (const step of (s.steps ?? []).filter((x) => x && x.enabled && x.messageBody?.trim())) {
          allLeadTimes.add(toLeadTimeMinutes(step.leadTime));
        }
      }
      const leadTimeMinutesList = Array.from(allLeadTimes).sort((a, b) => a - b);
      if (leadTimeMinutesList.length === 0) continue;

      const ownerId = row.ownerId;

      const site = await prisma.portalBookingSite.findUnique({
        where: { ownerId },
        select: { id: true, timeZone: true, title: true },
      });
      if (!site) continue;

      const twilio = await getOwnerTwilioSmsConfig(ownerId);

      let mutated = false;
      let sentKeys = serviceData.sentKeys.slice();
      let sentSet = new Set<string>(sentKeys);
      let events = serviceData.events.slice();

      const upsertServiceData = async () => {
        if (!mutated) return;
        const payload: AppointmentRemindersServiceData = {
          version: 2,
          defaultSettings: serviceData.defaultSettings,
          calendarSettings: serviceData.calendarSettings ?? {},
          bookingMeta: serviceData.bookingMeta ?? {},
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

      const bookingMeta = serviceData.bookingMeta ?? {};
      const calendarSettings = serviceData.calendarSettings ?? {};

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
          select: { id: true, startAt: true, endAt: true, contactName: true, contactPhone: true, contactEmail: true },
        });

        if (bookings.length === 0) continue;

        for (const booking of bookings) {
          const calendarId = bookingMeta[booking.id]?.calendarId;
          const effective = calendarId && calendarSettings[calendarId] ? calendarSettings[calendarId] : serviceData.defaultSettings;
          if (!effective?.enabled) continue;

          const dueSteps = (effective.steps ?? []).filter(
            (s) => s && s.enabled && s.messageBody?.trim() && toLeadTimeMinutes(s.leadTime) === leadTimeMinutes,
          );
          if (!dueSteps.length) continue;

          const bookingStartAtIso = booking.startAt.toISOString();
          const scheduledForIso = new Date(booking.startAt.getTime() - leadMs).toISOString();

          for (const step of dueSteps) {
            const scopeKey = calendarId ? calendarId : "default";
            const key = `${booking.id}:${scopeKey}:${step.id}`;
            if (sentSet.has(key)) continue;

            const channel: AppointmentReminderChannel = effective.channel === "EMAIL" ? "EMAIL" : "SMS";

            const when = formatWhen(booking.startAt, site.timeZone);
            const vars = {
              ...buildPortalTemplateVars({
                contact: {
                  name: booking.contactName,
                  email: booking.contactEmail ?? null,
                  phone: booking.contactPhone ?? null,
                },
                business: { name: site.title ?? null },
              }),
              when,
              timeZone: site.timeZone,
              bookingTitle: site.title ?? "",
              calendarTitle: site.title ?? "",
              startAt: booking.startAt.toISOString(),
              endAt: booking.endAt.toISOString(),
            };

            const body = renderAppointmentReminderBody(step.messageBody, vars);

            if (channel === "EMAIL") {
              const to = String(booking.contactEmail || "").trim();
              if (!to || !isEmailLike(to)) {
                remindersSkipped += 1;
                const evt: AppointmentReminderEvent = {
                  id: `evt_${booking.id}_${scopeKey}_${step.id}`,
                  bookingId: booking.id,
                  ...(calendarId ? { calendarId } : {}),
                  bookingStartAtIso,
                  scheduledForIso,

                  stepId: step.id,
                  stepLeadTimeMinutes: leadTimeMinutes,

                  contactName: booking.contactName,
                  contactPhoneRaw: booking.contactPhone ?? null,
                  contactEmailRaw: booking.contactEmail ?? null,
                  channel: "EMAIL",
                  to: null,
                  body,
                  smsTo: null,
                  smsBody: null,
                  status: "SKIPPED",
                  reason: "Missing/invalid email",
                  createdAtIso: nowIso(),
                };
                events.unshift(evt);
                sentKeys.unshift(key);
                sentSet.add(key);
                mutated = true;
                continue;
              }

              try {
                await sendAppointmentReminderEmail({
                  to,
                  subject: `Appointment reminder: ${when}`,
                  text: body,
                  fromName: site.title?.trim() || "Purely Automation",
                });

                remindersSent += 1;
                const evt: AppointmentReminderEvent = {
                  id: `evt_${booking.id}_${scopeKey}_${step.id}`,
                  bookingId: booking.id,
                  ...(calendarId ? { calendarId } : {}),
                  bookingStartAtIso,
                  scheduledForIso,

                  stepId: step.id,
                  stepLeadTimeMinutes: leadTimeMinutes,

                  contactName: booking.contactName,
                  contactPhoneRaw: booking.contactPhone ?? null,
                  contactEmailRaw: booking.contactEmail ?? null,
                  channel: "EMAIL",
                  to,
                  body,
                  smsTo: null,
                  smsBody: null,
                  status: "SENT",
                  createdAtIso: nowIso(),
                };
                events.unshift(evt);
                sentKeys.unshift(key);
                sentSet.add(key);
                mutated = true;
              } catch (err) {
                remindersFailed += 1;
                const evt: AppointmentReminderEvent = {
                  id: `evt_${booking.id}_${scopeKey}_${step.id}`,
                  bookingId: booking.id,
                  ...(calendarId ? { calendarId } : {}),
                  bookingStartAtIso,
                  scheduledForIso,

                  stepId: step.id,
                  stepLeadTimeMinutes: leadTimeMinutes,

                  contactName: booking.contactName,
                  contactPhoneRaw: booking.contactPhone ?? null,
                  contactEmailRaw: booking.contactEmail ?? null,
                  channel: "EMAIL",
                  to,
                  body,
                  smsTo: null,
                  smsBody: null,
                  status: "FAILED",
                  error: err instanceof Error ? err.message : String(err),
                  createdAtIso: nowIso(),
                };
                events.unshift(evt);
                sentKeys.unshift(key);
                sentSet.add(key);
                mutated = true;
              }

              continue;
            }

            if (!twilio) {
              remindersSkipped += 1;
              const evt: AppointmentReminderEvent = {
                id: `evt_${booking.id}_${scopeKey}_${step.id}`,
                bookingId: booking.id,
                ...(calendarId ? { calendarId } : {}),
                bookingStartAtIso,
                scheduledForIso,

                stepId: step.id,
                stepLeadTimeMinutes: leadTimeMinutes,

                contactName: booking.contactName,
                contactPhoneRaw: booking.contactPhone ?? null,
                contactEmailRaw: booking.contactEmail ?? null,
                channel: "SMS",
                to: null,
                body,
                smsTo: null,
                smsBody: null,
                status: "SKIPPED",
                reason: "Twilio not configured",
                createdAtIso: nowIso(),
              };
              events.unshift(evt);
              sentKeys.unshift(key);
              sentSet.add(key);
              mutated = true;
              continue;
            }

            const rawPhone = booking.contactPhone ?? "";
            const parsed = rawPhone ? normalizePhoneStrict(rawPhone) : { ok: false as const, error: "Missing phone" };
            if (!parsed.ok || !parsed.e164) {
              remindersSkipped += 1;
              const evt: AppointmentReminderEvent = {
                id: `evt_${booking.id}_${scopeKey}_${step.id}`,
                bookingId: booking.id,
                ...(calendarId ? { calendarId } : {}),
                bookingStartAtIso,
                scheduledForIso,

                stepId: step.id,
                stepLeadTimeMinutes: leadTimeMinutes,

                contactName: booking.contactName,
                contactPhoneRaw: booking.contactPhone ?? null,
                contactEmailRaw: booking.contactEmail ?? null,
                channel: "SMS",
                to: null,
                body,
                smsTo: null,
                smsBody: null,
                status: "SKIPPED",
                reason: "Missing/invalid phone",
                createdAtIso: nowIso(),
              };
              events.unshift(evt);
              sentKeys.unshift(key);
              sentSet.add(key);
              mutated = true;
              continue;
            }

            try {
              const result = await sendOwnerTwilioSms({ ownerId, to: parsed.e164, body });

              if (!result.ok) {
                remindersFailed += 1;
                const evt: AppointmentReminderEvent = {
                  id: `evt_${booking.id}_${scopeKey}_${step.id}`,
                  bookingId: booking.id,
                  ...(calendarId ? { calendarId } : {}),
                  bookingStartAtIso,
                  scheduledForIso,

                  stepId: step.id,
                  stepLeadTimeMinutes: leadTimeMinutes,

                  contactName: booking.contactName,
                  contactPhoneRaw: booking.contactPhone ?? null,
                  contactEmailRaw: booking.contactEmail ?? null,
                  channel: "SMS",
                  to: parsed.e164,
                  body,
                  smsTo: parsed.e164,
                  smsBody: body,
                  status: "FAILED",
                  error: result.error,
                  createdAtIso: nowIso(),
                };
                events.unshift(evt);
                sentKeys.unshift(key);
                sentSet.add(key);
                mutated = true;
                continue;
              }

              remindersSent += 1;
              const evt: AppointmentReminderEvent = {
                id: `evt_${booking.id}_${scopeKey}_${step.id}`,
                bookingId: booking.id,
                ...(calendarId ? { calendarId } : {}),
                bookingStartAtIso,
                scheduledForIso,

                stepId: step.id,
                stepLeadTimeMinutes: leadTimeMinutes,

                contactName: booking.contactName,
                contactPhoneRaw: booking.contactPhone ?? null,
                contactEmailRaw: booking.contactEmail ?? null,
                channel: "SMS",
                to: parsed.e164,
                body,
                smsTo: parsed.e164,
                smsBody: body,
                status: "SENT",
                ...(result.messageSid ? { smsMessageSid: result.messageSid } : {}),
                createdAtIso: nowIso(),
              };
              events.unshift(evt);
              sentKeys.unshift(key);
              sentSet.add(key);
              mutated = true;
            } catch (err) {
              remindersFailed += 1;
              const evt: AppointmentReminderEvent = {
                id: `evt_${booking.id}_${scopeKey}_${step.id}`,
                bookingId: booking.id,
                ...(calendarId ? { calendarId } : {}),
                bookingStartAtIso,
                scheduledForIso,

                stepId: step.id,
                stepLeadTimeMinutes: leadTimeMinutes,

                contactName: booking.contactName,
                contactPhoneRaw: booking.contactPhone ?? null,
                contactEmailRaw: booking.contactEmail ?? null,
                channel: "SMS",
                to: parsed.e164,
                body,
                smsTo: parsed.e164,
                smsBody: body,
                status: "FAILED",
                error: err instanceof Error ? err.message : String(err),
                createdAtIso: nowIso(),
              };

              events.unshift(evt);
              // Still mark key as sent so we don't spam on repeated failures.
              sentKeys.unshift(key);
              sentSet.add(key);
              mutated = true;
            }

            if (events.length > MAX_EVENTS || sentKeys.length > MAX_SENT_KEYS) {
              events = events.slice(0, MAX_EVENTS);
              sentKeys = sentKeys.slice(0, MAX_SENT_KEYS);
              sentSet = new Set<string>(sentKeys);
            }
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
  };
}
