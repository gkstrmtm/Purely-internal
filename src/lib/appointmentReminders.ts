import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";
import { sendOwnerTwilioSms, getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

const SERVICE_SLUG = "appointment-reminders";

const MAX_EVENTS = 200;
const MAX_SENT_KEYS = 4000;
const MAX_BODY_LEN = 900;

export type AppointmentReminderSettings = {
  version: 2;
  enabled: boolean;
  steps: AppointmentReminderStep[];
};

export type AppointmentReminderStep = {
  id: string;
  enabled: boolean;
  leadTimeMinutes: number;
  messageBody: string;
};

export type AppointmentReminderEvent = {
  id: string;
  bookingId: string;
  bookingStartAtIso: string;
  scheduledForIso: string;

  stepId: string;
  stepLeadTimeMinutes: number;

  contactName: string;
  contactPhoneRaw: string | null;
  smsTo: string | null;
  smsBody: string | null;

  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
  smsMessageSid?: string;
  error?: string;

  createdAtIso: string;
};

type AppointmentRemindersServiceData = {
  version: 1;
  settings: AppointmentReminderSettings;
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

export function parseAppointmentReminderSettings(raw: unknown): AppointmentReminderSettings {
  const baseStep: AppointmentReminderStep = {
    id: "step_1",
    enabled: true,
    leadTimeMinutes: 60,
    messageBody: "Reminder: your appointment is scheduled for {when}.",
  };

  const base: AppointmentReminderSettings = {
    version: 2,
    enabled: false,
    steps: [baseStep],
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  // Back-compat: v1 shape { enabled, leadTimeMinutes, messageBody }
  const isV1 = rec.version === 1 || ("leadTimeMinutes" in rec && "messageBody" in rec && !Array.isArray((rec as any).steps));
  if (isV1) {
    const enabled = typeof rec.enabled === "boolean" ? rec.enabled : base.enabled;
    const leadTimeMinutes = clampInt(
      typeof rec.leadTimeMinutes === "number" ? rec.leadTimeMinutes : baseStep.leadTimeMinutes,
      5,
      60 * 24 * 14,
    );
    const messageBody =
      typeof rec.messageBody === "string" ? rec.messageBody.slice(0, MAX_BODY_LEN).trim() : baseStep.messageBody;

    return {
      version: 2,
      enabled,
      steps: [
        {
          id: "step_1",
          enabled: true,
          leadTimeMinutes,
          messageBody: messageBody || baseStep.messageBody,
        },
      ],
    };
  }

  const enabled = typeof rec.enabled === "boolean" ? rec.enabled : base.enabled;

  const steps = Array.isArray(rec.steps)
    ? (rec.steps as unknown[])
        .flatMap((s) => {
          if (!s || typeof s !== "object" || Array.isArray(s)) return [] as AppointmentReminderStep[];
          const r = s as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id.trim() : "";
          const stepEnabled = typeof r.enabled === "boolean" ? r.enabled : true;
          const leadTimeMinutes = clampInt(
            typeof r.leadTimeMinutes === "number" ? r.leadTimeMinutes : baseStep.leadTimeMinutes,
            5,
            60 * 24 * 14,
          );
          const messageBody =
            typeof r.messageBody === "string" ? r.messageBody.slice(0, MAX_BODY_LEN).trim() : baseStep.messageBody;
          if (!id) return [] as AppointmentReminderStep[];
          if (!messageBody.trim()) return [] as AppointmentReminderStep[];
          return [
            {
              id: id.slice(0, 40),
              enabled: stepEnabled,
              leadTimeMinutes,
              messageBody: messageBody.trim(),
            },
          ];
        })
        .slice(0, 8)
    : [];

  return {
    version: 2,
    enabled,
    steps: steps.length ? steps : [baseStep],
  };
}

function parseServiceData(raw: unknown): AppointmentRemindersServiceData {
  const base: AppointmentRemindersServiceData = {
    version: 1,
    settings: parseAppointmentReminderSettings(null),
    sentKeys: [],
    events: [],
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;

  const settings = parseAppointmentReminderSettings(rec.settings);

  const sentKeys = Array.isArray(rec.sentKeys)
    ? (rec.sentKeys as unknown[]).flatMap((x) => (typeof x === "string" && x.trim() ? [x] : [])).slice(0, MAX_SENT_KEYS)
    : [];

  const events = Array.isArray(rec.events)
    ? (rec.events as unknown[])
        .flatMap((e) => {
          if (!e || typeof e !== "object" || Array.isArray(e)) return [] as AppointmentReminderEvent[];
          const r = e as Record<string, unknown>;
          const bookingId = typeof r.bookingId === "string" ? r.bookingId : "";
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

  return { version: 1, settings, sentKeys, events };
}

export async function getAppointmentRemindersServiceData(ownerId: string): Promise<AppointmentRemindersServiceData> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseServiceData(row?.dataJson ?? null);
}

export async function setAppointmentReminderSettings(ownerId: string, settings: AppointmentReminderSettings): Promise<AppointmentReminderSettings> {
  const current = await getAppointmentRemindersServiceData(ownerId);

  const payload: AppointmentRemindersServiceData = {
    version: 1,
    settings,
    sentKeys: current.sentKeys.slice(0, MAX_SENT_KEYS),
    events: current.events.slice(0, MAX_EVENTS),
  };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload as any },
    update: { status: "COMPLETE", dataJson: payload as any },
    select: { dataJson: true },
  });

  return parseServiceData(row.dataJson).settings;
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

export function renderAppointmentReminderBody(template: string, vars: { name: string; when: string }) {
  const safe = (template || "").slice(0, MAX_BODY_LEN);
  return safe.replaceAll("{name}", vars.name).replaceAll("{when}", vars.when).trim();
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
      if (!serviceData.settings.enabled) continue;
      const steps = (serviceData.settings.steps ?? []).filter((s) => s && s.enabled && s.messageBody?.trim());
      if (steps.length === 0) continue;

      const ownerId = row.ownerId;

      const site = await prisma.portalBookingSite.findUnique({
        where: { ownerId },
        select: { id: true, timeZone: true },
      });
      if (!site) continue;

      const twilio = await getOwnerTwilioSmsConfig(ownerId);

      let mutated = false;
      let sentKeys = serviceData.sentKeys.slice();
      let events = serviceData.events.slice();

      const upsertServiceData = async () => {
        if (!mutated) return;
        const payload: AppointmentRemindersServiceData = {
          version: 1,
          settings: serviceData.settings,
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

      for (const step of steps) {
        const leadMs = step.leadTimeMinutes * 60_000;
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
          select: { id: true, startAt: true, contactName: true, contactPhone: true },
        });

        if (bookings.length === 0) continue;

        for (const booking of bookings) {
          const key = `${booking.id}:${step.id}`;
          if (sentKeys.includes(key)) continue;

          const bookingStartAtIso = booking.startAt.toISOString();
          const scheduledForIso = new Date(booking.startAt.getTime() - leadMs).toISOString();

          if (!twilio) {
            remindersSkipped += 1;
            const evt: AppointmentReminderEvent = {
              id: `evt_${booking.id}_${step.id}`,
              bookingId: booking.id,
              bookingStartAtIso,
              scheduledForIso,

              stepId: step.id,
              stepLeadTimeMinutes: step.leadTimeMinutes,

              contactName: booking.contactName,
              contactPhoneRaw: booking.contactPhone ?? null,
              smsTo: null,
              smsBody: null,
              status: "SKIPPED",
              reason: "Twilio not configured",
              createdAtIso: nowIso(),
            };
            events.unshift(evt);
            sentKeys.unshift(key);
            mutated = true;
            continue;
          }

          const rawPhone = booking.contactPhone ?? "";
          const parsed = rawPhone ? normalizePhoneStrict(rawPhone) : { ok: false as const, error: "Missing phone" };
          if (!parsed.ok || !parsed.e164) {
            remindersSkipped += 1;
            const evt: AppointmentReminderEvent = {
              id: `evt_${booking.id}_${step.id}`,
              bookingId: booking.id,
              bookingStartAtIso,
              scheduledForIso,

              stepId: step.id,
              stepLeadTimeMinutes: step.leadTimeMinutes,

              contactName: booking.contactName,
              contactPhoneRaw: booking.contactPhone ?? null,
              smsTo: null,
              smsBody: null,
              status: "SKIPPED",
              reason: "Missing/invalid phone",
              createdAtIso: nowIso(),
            };
            events.unshift(evt);
            sentKeys.unshift(key);
            mutated = true;
            continue;
          }

          const when = formatWhen(booking.startAt, site.timeZone);
          const body = renderAppointmentReminderBody(step.messageBody, { name: booking.contactName, when });

          try {
            const result = await sendOwnerTwilioSms({ ownerId, to: parsed.e164, body });

            if (!result.ok) {
              remindersFailed += 1;
              const evt: AppointmentReminderEvent = {
                id: `evt_${booking.id}_${step.id}`,
                bookingId: booking.id,
                bookingStartAtIso,
                scheduledForIso,

                stepId: step.id,
                stepLeadTimeMinutes: step.leadTimeMinutes,

                contactName: booking.contactName,
                contactPhoneRaw: booking.contactPhone ?? null,
                smsTo: parsed.e164,
                smsBody: body,
                status: "FAILED",
                error: result.error,
                createdAtIso: nowIso(),
              };
              events.unshift(evt);
              sentKeys.unshift(key);
              mutated = true;
              continue;
            }

            remindersSent += 1;
            const evt: AppointmentReminderEvent = {
              id: `evt_${booking.id}_${step.id}`,
              bookingId: booking.id,
              bookingStartAtIso,
              scheduledForIso,

              stepId: step.id,
              stepLeadTimeMinutes: step.leadTimeMinutes,

              contactName: booking.contactName,
              contactPhoneRaw: booking.contactPhone ?? null,
              smsTo: parsed.e164,
              smsBody: body,
              status: "SENT",
              ...(result.messageSid ? { smsMessageSid: result.messageSid } : {}),
              createdAtIso: nowIso(),
            };
            events.unshift(evt);
            sentKeys.unshift(key);
            mutated = true;
          } catch (err) {
            remindersFailed += 1;
            const evt: AppointmentReminderEvent = {
              id: `evt_${booking.id}_${step.id}`,
              bookingId: booking.id,
              bookingStartAtIso,
              scheduledForIso,

              stepId: step.id,
              stepLeadTimeMinutes: step.leadTimeMinutes,

              contactName: booking.contactName,
              contactPhoneRaw: booking.contactPhone ?? null,
              smsTo: parsed.e164,
              smsBody: body,
              status: "FAILED",
              error: err instanceof Error ? err.message : String(err),
              createdAtIso: nowIso(),
            };

            events.unshift(evt);
            // Still mark key as sent so we don't spam on repeated failures.
            sentKeys.unshift(key);
            mutated = true;
          }

          if (events.length > MAX_EVENTS || sentKeys.length > MAX_SENT_KEYS) {
            events = events.slice(0, MAX_EVENTS);
            sentKeys = sentKeys.slice(0, MAX_SENT_KEYS);
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
