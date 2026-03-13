import { prisma } from "@/lib/db";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { normalizePhoneForStorage } from "@/lib/phone";
import { getOwnerTwilioSmsConfig, sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";
import { addContactTagAssignment } from "@/lib/portalContactTags";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";
import { getOutboundEmailFrom, isOutboundEmailConfigured, sendTransactionalEmail } from "@/lib/emailSender";

export type FollowUpChannel = "EMAIL" | "SMS" | "TAG";

export type FollowUpStepKind = FollowUpChannel;

export type FollowUpAudience = "CONTACT" | "INTERNAL";

export type FollowUpInternalRecipients =
  | {
      mode: "BOOKING_NOTIFICATION_EMAILS";
    }
  | {
      mode: "CUSTOM";
      emails?: string[];
      phones?: string[];
    };

export type FollowUpEmailAttachmentRef = {
  mediaItemId: string;
  fileName: string;
  mimeType: string;
};

export type FollowUpTemplate = {
  id: string;
  name: string;
  enabled: boolean;
  delayMinutes: number;
  audience?: FollowUpAudience;
  internalRecipients?: FollowUpInternalRecipients;
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

export type FollowUpStep = {
  id: string;
  name: string;
  enabled: boolean;
  delayMinutes: number;
  kind: FollowUpStepKind;
  audience?: FollowUpAudience;
  internalRecipients?: FollowUpInternalRecipients;
  email?: {
    subjectTemplate: string;
    bodyTemplate: string;
    attachments?: FollowUpEmailAttachmentRef[];
  };
  sms?: {
    bodyTemplate: string;
  };
  tagId?: string;
  /** Optional metadata for UI: indicates the preset this step was created from. */
  presetId?: string;
};

export type FollowUpChainTemplate = {
  id: string;
  name: string;
  steps: FollowUpStep[];
};

export type FollowUpSettings = {
  version: 4;
  enabled: boolean;
  /** Optional preset library. Steps copy from presets; presets do not run by themselves. */
  templates: FollowUpTemplate[];
  /** Saved multi-step chains that can be loaded into the chain editor. */
  chainTemplates: FollowUpChainTemplate[];
  assignments: {
    defaultSteps: FollowUpStep[];
    calendarSteps: Record<string, FollowUpStep[]>;
  };
  customVariables: Record<string, string>;
};

export type FollowUpQueueItem = {
  id: string;
  bookingId: string;
  ownerId: string;
  stepId: string;
  stepName: string;
  calendarId?: string;
  channel: FollowUpChannel;
  to?: string;
  contactId?: string;
  tagId?: string;
  subject?: string;
  body?: string;
  attachments?: FollowUpEmailAttachmentRef[];
  sendAtIso: string;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELED";
  attempts: number;
  lastError?: string;
  createdAtIso: string;
  sentAtIso?: string;
};

type ServiceData = {
  version: 4;
  settings: FollowUpSettings;
  queue: FollowUpQueueItem[];
  bookingMeta?: Record<string, { calendarId?: string; updatedAtIso?: string }>;
};

const SERVICE_SLUG = "follow-up";
const MAX_QUEUE_ITEMS = 400;
const MAX_DELAY_MINUTES = 60 * 24 * 365 * 10; // 10 years

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

function normalizeEmailList(v: unknown, max: number) {
  const list = Array.isArray(v) ? v : [];
  const out: string[] = [];
  const seen = new Set<string>();
  const emailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  for (const item of list) {
    if (typeof item !== "string") continue;
    const s = item.trim().toLowerCase();
    if (!s) continue;
    if (!emailLike.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function normalizePhoneList(v: unknown, max: number) {
  const list = Array.isArray(v) ? v : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const normalized = normalizePhoneForStorage(item);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeId(v: unknown, fallback: string) {
  const raw = typeof v === "string" ? v.trim() : "";
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function normalizeEmailAttachmentRefs(v: unknown, max = 10): FollowUpEmailAttachmentRef[] {
  const list = Array.isArray(v) ? v : [];
  const out: FollowUpEmailAttachmentRef[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const mediaItemId = normalizeId(r.mediaItemId, "").slice(0, 80);
    if (!mediaItemId) continue;
    if (seen.has(mediaItemId)) continue;
    seen.add(mediaItemId);
    out.push({
      mediaItemId,
      fileName: normalizeString(r.fileName, "attachment", 200) || "attachment",
      mimeType: normalizeString(r.mimeType, "application/octet-stream", 200) || "application/octet-stream",
    });
    if (out.length >= max) break;
  }
  return out;
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
    "calendarTitle",
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
  const templates: FollowUpTemplate[] = [
    {
      id: "thanks",
      name: "Quick thank you",
      enabled: true,
      delayMinutes: 60,
      audience: "CONTACT",
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
          "- {businessName}",
        ].join("\n"),
      },
      sms: {
        bodyTemplate: "Thanks again for your time. Reply here if you have any questions. - {businessName}",
      },
    },
    {
      id: "feedback",
      name: "Feedback request",
      enabled: false,
      delayMinutes: 60 * 24,
      audience: "CONTACT",
      channels: { email: true, sms: false },
      email: {
        subjectTemplate: "Quick question about our call",
        bodyTemplate: [
          "Hi {contactName},",
          "",
          "Do you have any feedback on our conversation?",
          "",
          "One sentence is totally fine. It helps {businessName} a lot.",
          "",
          "- {businessName}",
        ].join("\n"),
      },
      sms: {
        bodyTemplate: "Any quick feedback on our call? One sentence helps a lot. - {businessName}",
      },
    },
    {
      id: "next_steps",
      name: "Next steps",
      enabled: false,
      delayMinutes: 60 * 3,
      audience: "CONTACT",
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
          "- {businessName}",
        ].join("\n"),
      },
      sms: {
        bodyTemplate: "Next steps from our call. Reply here if you want me to send them over. - {businessName}",
      },
    },
    {
      id: "review",
      name: "Review / testimonial",
      enabled: false,
      delayMinutes: 60 * 24 * 3,
      audience: "CONTACT",
      channels: { email: true, sms: false },
      email: {
        subjectTemplate: "Would you be open to a quick review?",
        bodyTemplate: [
          "Hi {contactName},",
          "",
          "If you found our call helpful, would you be open to leaving a quick review for {businessName}?",
          "",
          "No worries either way. Thanks again.",
          "",
          "- {businessName}",
        ].join("\n"),
      },
      sms: {
        bodyTemplate: "If our call helped, would you be open to leaving a quick review for {businessName}? - {businessName}",
      },
    },
    {
      id: "internal_summary",
      name: "Internal summary",
      enabled: false,
      delayMinutes: 0,
      audience: "INTERNAL",
      internalRecipients: { mode: "BOOKING_NOTIFICATION_EMAILS" },
      channels: { email: true, sms: false },
      email: {
        subjectTemplate: "Appointment finished: {contactName}",
        bodyTemplate: [
          "Internal notification for {businessName}",
          "",
          "Contact: {contactName}",
          "Email: {contactEmail}",
          "Phone: {contactPhone}",
          "",
          "Calendar: {calendarTitle}",
          "When: {when}",
        ].join("\n"),
      },
      sms: {
        bodyTemplate: "Appointment finished: {contactName} • {calendarTitle} • {when}",
      },
    },
  ];

  const first = templates.find((t) => t.id === "thanks") ?? templates[0]!;
  const defaultStep: FollowUpStep = {
    id: "step_thanks_1",
    name: first.name,
    enabled: true,
    delayMinutes: first.delayMinutes,
    kind: "EMAIL",
    audience: first.audience,
    internalRecipients: first.internalRecipients,
    email: { ...first.email },
    presetId: first.id,
  };

  return {
    version: 4,
    enabled: false,
    templates,
    chainTemplates: [],
    assignments: {
      defaultSteps: [defaultStep],
      calendarSteps: {},
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
  const version =
    settingsRaw.version === 4 ? 4 : settingsRaw.version === 3 ? 3 : settingsRaw.version === 2 ? 2 : settingsRaw.version === 1 ? 1 : undefined;

  type V3Step = {
    id: string;
    name: string;
    enabled: boolean;
    delayMinutes: number;
    audience?: FollowUpAudience;
    internalRecipients?: FollowUpInternalRecipients;
    channels: { email: boolean; sms: boolean };
    email: { subjectTemplate: string; bodyTemplate: string };
    sms: { bodyTemplate: string };
    presetId?: string;
  };

  type V3Settings = {
    enabled: boolean;
    templates: FollowUpTemplate[];
    chainTemplates: Array<{ id: string; name: string; steps: V3Step[] }>;
    assignments: { defaultSteps: V3Step[]; calendarSteps: Record<string, V3Step[]> };
    customVariables: Record<string, string>;
  };

  function normalizeInternalRecipients(audience: FollowUpAudience, raw: unknown): FollowUpInternalRecipients | undefined {
    if (audience !== "INTERNAL") return undefined;
    const internalRecipientsRaw = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const mode = internalRecipientsRaw.mode === "CUSTOM" ? "CUSTOM" : "BOOKING_NOTIFICATION_EMAILS";
    if (mode === "CUSTOM") {
      const emails = normalizeEmailList(internalRecipientsRaw.emails, 20);
      const phones = normalizePhoneList(internalRecipientsRaw.phones, 20);
      return {
        mode: "CUSTOM",
        emails: emails.length ? emails : undefined,
        phones: phones.length ? phones : undefined,
      };
    }
    return { mode: "BOOKING_NOTIFICATION_EMAILS" };
  }

  function normalizeStepV3(raw: unknown, fallbackId: string): V3Step | null {
    const item = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
    if (!item) return null;

    const id = normalizeId(item.id, fallbackId).slice(0, 60);
    const name = normalizeString(item.name, "Step", 80).trim();
    if (!name) return null;

    const channelsRaw =
      item.channels && typeof item.channels === "object" && !Array.isArray(item.channels)
        ? (item.channels as Record<string, unknown>)
        : {};
    const emailRaw =
      item.email && typeof item.email === "object" && !Array.isArray(item.email)
        ? (item.email as Record<string, unknown>)
        : {};
    const smsRaw =
      item.sms && typeof item.sms === "object" && !Array.isArray(item.sms)
        ? (item.sms as Record<string, unknown>)
        : {};

    const audience: FollowUpAudience = item.audience === "INTERNAL" ? "INTERNAL" : "CONTACT";
    const internalRecipients = normalizeInternalRecipients(audience, item.internalRecipients);

    return {
      id,
      name,
      enabled: normalizeBool(item.enabled, true),
      delayMinutes: clampInt(item.delayMinutes, 60, 0, MAX_DELAY_MINUTES),
      audience,
      internalRecipients,
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
      presetId: typeof item.presetId === "string" ? normalizeId(item.presetId, "").slice(0, 40) || undefined : undefined,
    };
  }

  function v3StepToV4Steps(step: V3Step): FollowUpStep[] {
    const both = Boolean(step.channels.email) && Boolean(step.channels.sms);
    const base = {
      enabled: Boolean(step.enabled),
      delayMinutes: clampInt(step.delayMinutes, 60, 0, MAX_DELAY_MINUTES),
      audience: step.audience === "INTERNAL" ? "INTERNAL" : "CONTACT",
      internalRecipients: step.audience === "INTERNAL" ? step.internalRecipients : undefined,
      presetId: step.presetId,
    } satisfies Omit<FollowUpStep, "id" | "name" | "kind">;

    const out: FollowUpStep[] = [];
    if (step.channels.email) {
      out.push({
        id: (both ? `${step.id}_email` : step.id).slice(0, 60),
        name: both ? `${step.name} (Email)` : step.name,
        kind: "EMAIL",
        ...base,
        email: { ...step.email },
      });
    }
    if (step.channels.sms) {
      out.push({
        id: (both ? `${step.id}_sms` : step.id).slice(0, 60),
        name: both ? `${step.name} (SMS)` : step.name,
        kind: "SMS",
        ...base,
        sms: { ...step.sms },
      });
    }
    return out;
  }

  function normalizeStepV4(raw: unknown, fallbackId: string): FollowUpStep | null {
    const item = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
    if (!item) return null;

    const id = normalizeId(item.id, fallbackId).slice(0, 60);
    const name = normalizeString(item.name, "Step", 80).trim();
    if (!name) return null;

    const kind: FollowUpStepKind = item.kind === "SMS" || item.kind === "EMAIL" || item.kind === "TAG" ? (item.kind as FollowUpStepKind) : "EMAIL";
    const audience: FollowUpAudience = item.audience === "INTERNAL" ? "INTERNAL" : "CONTACT";
    const internalRecipients = normalizeInternalRecipients(audience, item.internalRecipients);

    const presetId = typeof item.presetId === "string" ? normalizeId(item.presetId, "").slice(0, 40) || undefined : undefined;

    const emailRaw =
      item.email && typeof item.email === "object" && !Array.isArray(item.email) ? (item.email as Record<string, unknown>) : {};
    const smsRaw =
      item.sms && typeof item.sms === "object" && !Array.isArray(item.sms) ? (item.sms as Record<string, unknown>) : {};

    const base: FollowUpStep = {
      id,
      name,
      enabled: normalizeBool(item.enabled, true),
      delayMinutes: clampInt(item.delayMinutes, 60, 0, MAX_DELAY_MINUTES),
      kind,
      audience,
      internalRecipients,
      presetId,
    };

    if (kind === "EMAIL") {
      return {
        ...base,
        email: {
          subjectTemplate: normalizeString(emailRaw.subjectTemplate, defaults.templates[0]!.email.subjectTemplate, 200),
          bodyTemplate: normalizeString(emailRaw.bodyTemplate, defaults.templates[0]!.email.bodyTemplate, 5000),
          attachments: normalizeEmailAttachmentRefs((emailRaw as any).attachments),
        },
      };
    }

    if (kind === "SMS") {
      return {
        ...base,
        sms: {
          bodyTemplate: normalizeString(smsRaw.bodyTemplate, defaults.templates[0]!.sms.bodyTemplate, 900),
        },
      };
    }

    const tagId = typeof item.tagId === "string" ? String(item.tagId).trim().slice(0, 80) : "";
    return {
      ...base,
      tagId: tagId || undefined,
    };
  }

  function convertV3ToV4(v3: V3Settings): FollowUpSettings {
    const convertSteps = (steps: V3Step[]) => {
      const out: FollowUpStep[] = [];
      const seenStep = new Set<string>();
      for (const s of steps) {
        for (const v4 of v3StepToV4Steps(s)) {
          if (!v4) continue;
          if (seenStep.has(v4.id)) continue;
          seenStep.add(v4.id);
          out.push(v4);
          if (out.length >= 30) break;
        }
        if (out.length >= 30) break;
      }
      return out;
    };

    const chainTemplates: FollowUpChainTemplate[] = [];
    for (const t of v3.chainTemplates) {
      const steps = convertSteps(t.steps);
      if (!steps.length) continue;
      chainTemplates.push({ id: t.id, name: t.name, steps });
      if (chainTemplates.length >= 50) break;
    }

    const calendarSteps: Record<string, FollowUpStep[]> = {};
    for (const [calId, steps] of Object.entries(v3.assignments.calendarSteps || {})) {
      const next = convertSteps(steps);
      if (next.length) calendarSteps[calId] = next;
    }

    const defaultSteps = convertSteps(v3.assignments.defaultSteps || []);

    return {
      version: 4,
      enabled: Boolean(v3.enabled),
      templates: Array.isArray(v3.templates) && v3.templates.length ? v3.templates : defaults.templates,
      chainTemplates,
      assignments: {
        defaultSteps: defaultSteps.length ? defaultSteps : defaults.assignments.defaultSteps,
        calendarSteps,
      },
      customVariables: v3.customVariables,
    };
  }

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
      delayMinutes: clampInt(settingsRaw.delayMinutes, 60, 0, MAX_DELAY_MINUTES),
      audience: "CONTACT",
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

    const templates = [primary, ...extraDefaults].slice(0, 20);

    const stepV3: V3Step = {
      id: "step_default_1",
      name: primary.name,
      enabled: true,
      delayMinutes: primary.delayMinutes,
      audience: primary.audience,
      internalRecipients: primary.audience === "INTERNAL" ? primary.internalRecipients : undefined,
      channels: { ...primary.channels },
      email: { ...primary.email },
      sms: { ...primary.sms },
      presetId: primary.id,
    };

    return convertV3ToV4({
      enabled: normalizeBool(settingsRaw.enabled, defaults.enabled),
      templates,
      chainTemplates: [],
      assignments: { defaultSteps: [stepV3], calendarSteps: {} },
      customVariables: {},
    });
  }

  // Back-compat: v2 (template assignments) -> v3 (step chains).
  if (version === 2) {
    const v2 = settingsRaw;
    const templatesRaw = Array.isArray(v2.templates) ? v2.templates : [];

    // Reuse v2 template normalization logic by parsing as-if v2 templates (below).
    // We'll normalize templates first, then map IDs to steps.
    const templatesNormalized = (() => {
      const out: FollowUpTemplate[] = [];
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

        const audience: FollowUpAudience = item.audience === "INTERNAL" ? "INTERNAL" : "CONTACT";
        const internalRecipientsRaw =
          item.internalRecipients && typeof item.internalRecipients === "object" && !Array.isArray(item.internalRecipients)
            ? (item.internalRecipients as Record<string, unknown>)
            : {};
        const internalRecipients: FollowUpInternalRecipients | undefined = (() => {
          if (audience !== "INTERNAL") return undefined;
          const mode = internalRecipientsRaw.mode === "CUSTOM" ? "CUSTOM" : "BOOKING_NOTIFICATION_EMAILS";
          if (mode === "CUSTOM") {
            const emails = normalizeEmailList(internalRecipientsRaw.emails, 20);
            const phones = normalizePhoneList(internalRecipientsRaw.phones, 20);
            return {
              mode: "CUSTOM",
              emails: emails.length ? emails : undefined,
              phones: phones.length ? phones : undefined,
            };
          }
          return { mode: "BOOKING_NOTIFICATION_EMAILS" };
        })();

        out.push({
          id,
          name,
          enabled: normalizeBool(item.enabled, true),
          delayMinutes: clampInt(item.delayMinutes, 60, 0, MAX_DELAY_MINUTES),
          audience,
          internalRecipients,
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
        });

        if (out.length >= 20) break;
      }
      return out.length ? out : defaults.templates;
    })();

    const templateById = new Map(templatesNormalized.map((t) => [t.id, t] as const));

    const assignmentsRaw =
      v2.assignments && typeof v2.assignments === "object" && !Array.isArray(v2.assignments)
        ? (v2.assignments as Record<string, unknown>)
        : {};
    const defaultTemplateIdsRaw = Array.isArray(assignmentsRaw.defaultTemplateIds) ? assignmentsRaw.defaultTemplateIds : [];
    const defaultTemplateIds = defaultTemplateIdsRaw
      .filter((x) => typeof x === "string")
      .map((x) => normalizeId(x, "").slice(0, 40))
      .filter(Boolean)
      .slice(0, 20);

    const defaultStepsV3: V3Step[] = [];
    for (let i = 0; i < defaultTemplateIds.length; i += 1) {
      const tid = defaultTemplateIds[i]!;
      const t = templateById.get(tid);
      if (!t) continue;
      defaultStepsV3.push({
        id: `step_default_${tid}_${i + 1}`.slice(0, 60),
        name: t.name,
        enabled: true,
        delayMinutes: clampInt(t.delayMinutes, 60, 0, MAX_DELAY_MINUTES),
        audience: t.audience === "INTERNAL" ? "INTERNAL" : "CONTACT",
        internalRecipients: t.audience === "INTERNAL" ? t.internalRecipients : undefined,
        channels: { ...t.channels },
        email: { ...t.email },
        sms: { ...t.sms },
        presetId: t.id,
      });
      if (defaultStepsV3.length >= 20) break;
    }

    const calendarTemplateIdsRaw =
      assignmentsRaw.calendarTemplateIds && typeof assignmentsRaw.calendarTemplateIds === "object" && !Array.isArray(assignmentsRaw.calendarTemplateIds)
        ? (assignmentsRaw.calendarTemplateIds as Record<string, unknown>)
        : {};
    const calendarStepsV3: Record<string, V3Step[]> = {};
    for (const [calId0, list0] of Object.entries(calendarTemplateIdsRaw)) {
      const calId = normalizeId(calId0, "").slice(0, 40);
      if (!calId) continue;
      const list = Array.isArray(list0) ? list0 : [];
      const ids = list
        .filter((x) => typeof x === "string")
        .map((x) => normalizeId(x, "").slice(0, 40))
        .filter(Boolean)
        .slice(0, 20);
      const steps: V3Step[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        const tid = ids[i]!;
        const t = templateById.get(tid);
        if (!t) continue;
        steps.push({
          id: `step_cal_${calId}_${tid}_${i + 1}`.slice(0, 60),
          name: t.name,
          enabled: true,
          delayMinutes: clampInt(t.delayMinutes, 60, 0, MAX_DELAY_MINUTES),
          audience: t.audience === "INTERNAL" ? "INTERNAL" : "CONTACT",
          internalRecipients: t.audience === "INTERNAL" ? t.internalRecipients : undefined,
          channels: { ...t.channels },
          email: { ...t.email },
          sms: { ...t.sms },
          presetId: t.id,
        });
        if (steps.length >= 20) break;
      }
      if (steps.length) calendarStepsV3[calId] = steps;
    }

    const customVariables = normalizeStringRecord(v2.customVariables, 30, 32, 800);

    return convertV3ToV4({
      enabled: normalizeBool(v2.enabled, defaults.enabled),
      templates: templatesNormalized,
      chainTemplates: [],
      assignments: {
        defaultSteps: defaultStepsV3,
        calendarSteps: calendarStepsV3,
      },
      customVariables,
    });
  }

  // v3/v4 normalization (template library is still stored v3-style)
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

    const audience: FollowUpAudience = item.audience === "INTERNAL" ? "INTERNAL" : "CONTACT";
    const internalRecipientsRaw =
      item.internalRecipients && typeof item.internalRecipients === "object" && !Array.isArray(item.internalRecipients)
        ? (item.internalRecipients as Record<string, unknown>)
        : {};
    const internalRecipients: FollowUpInternalRecipients | undefined = (() => {
      if (audience !== "INTERNAL") return undefined;
      const mode = internalRecipientsRaw.mode === "CUSTOM" ? "CUSTOM" : "BOOKING_NOTIFICATION_EMAILS";
      if (mode === "CUSTOM") {
        const emails = normalizeEmailList(internalRecipientsRaw.emails, 20);
        const phones = normalizePhoneList(internalRecipientsRaw.phones, 20);
        return {
          mode: "CUSTOM",
          emails: emails.length ? emails : undefined,
          phones: phones.length ? phones : undefined,
        };
      }
      return { mode: "BOOKING_NOTIFICATION_EMAILS" };
    })();

    templates.push({
      id,
      name,
      enabled: normalizeBool(item.enabled, true),
      delayMinutes: clampInt(item.delayMinutes, 60, 0, MAX_DELAY_MINUTES),
      audience,
      internalRecipients,
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
    });
    if (templates.length >= 20) break;
  }

  const chainTemplatesRaw = Array.isArray((settingsRaw as any).chainTemplates)
    ? (((settingsRaw as any).chainTemplates as unknown[]) ?? [])
    : [];
  const chainTemplatesV4: FollowUpChainTemplate[] = [];
  const chainTemplatesV3: V3Settings["chainTemplates"] = [];
  {
    const seenTpl = new Set<string>();
    for (let i = 0; i < chainTemplatesRaw.length; i += 1) {
      const item =
        chainTemplatesRaw[i] && typeof chainTemplatesRaw[i] === "object" && !Array.isArray(chainTemplatesRaw[i])
          ? (chainTemplatesRaw[i] as Record<string, unknown>)
          : null;
      if (!item) continue;

      const id = normalizeId(item.id, `chain${i + 1}`).slice(0, 50);
      if (seenTpl.has(id)) continue;
      seenTpl.add(id);

      const name = normalizeString(item.name, "Template", 80).trim();
      if (!name) continue;

      const stepsRaw = Array.isArray(item.steps) ? item.steps : [];

      if (version === 4) {
        const steps: FollowUpStep[] = [];
        const seenStep = new Set<string>();
        for (let j = 0; j < stepsRaw.length; j += 1) {
          const step = normalizeStepV4(stepsRaw[j], `step${j + 1}`);
          if (!step) continue;
          if (seenStep.has(step.id)) continue;
          seenStep.add(step.id);
          steps.push(step);
          if (steps.length >= 30) break;
        }
        if (!steps.length) continue;
        chainTemplatesV4.push({ id, name, steps });
        if (chainTemplatesV4.length >= 50) break;
      } else {
        const steps: V3Step[] = [];
        const seenStep = new Set<string>();
        for (let j = 0; j < stepsRaw.length; j += 1) {
          const step = normalizeStepV3(stepsRaw[j], `step${j + 1}`);
          if (!step) continue;
          if (seenStep.has(step.id)) continue;
          seenStep.add(step.id);
          steps.push(step);
          if (steps.length >= 30) break;
        }
        if (!steps.length) continue;
        chainTemplatesV3.push({ id, name, steps });
        if (chainTemplatesV3.length >= 50) break;
      }
    }
  }

  const assignmentsRaw =
    settingsRaw.assignments && typeof settingsRaw.assignments === "object" && !Array.isArray(settingsRaw.assignments)
      ? (settingsRaw.assignments as Record<string, unknown>)
      : {};

  const defaultStepsRaw = Array.isArray(assignmentsRaw.defaultSteps) ? assignmentsRaw.defaultSteps : [];
  const defaultStepsV4: FollowUpStep[] = [];
  const defaultStepsV3: V3Step[] = [];
  {
    const seenStep = new Set<string>();
    for (let i = 0; i < defaultStepsRaw.length; i += 1) {
      if (version === 4) {
        const step = normalizeStepV4(defaultStepsRaw[i], `step${i + 1}`);
        if (!step) continue;
        if (seenStep.has(step.id)) continue;
        seenStep.add(step.id);
        defaultStepsV4.push(step);
        if (defaultStepsV4.length >= 30) break;
      } else {
        const step = normalizeStepV3(defaultStepsRaw[i], `step${i + 1}`);
        if (!step) continue;
        if (seenStep.has(step.id)) continue;
        seenStep.add(step.id);
        defaultStepsV3.push(step);
        if (defaultStepsV3.length >= 30) break;
      }
    }
  }

  const calendarStepsRaw =
    assignmentsRaw.calendarSteps && typeof assignmentsRaw.calendarSteps === "object" && !Array.isArray(assignmentsRaw.calendarSteps)
      ? (assignmentsRaw.calendarSteps as Record<string, unknown>)
      : {};
  const calendarStepsV4: Record<string, FollowUpStep[]> = {};
  const calendarStepsV3: Record<string, V3Step[]> = {};
  for (const [calId0, list0] of Object.entries(calendarStepsRaw)) {
    const calId = normalizeId(calId0, "").slice(0, 40);
    if (!calId) continue;
    const list = Array.isArray(list0) ? list0 : [];
    const stepsV4: FollowUpStep[] = [];
    const stepsV3: V3Step[] = [];
    const seenStep = new Set<string>();
    for (let i = 0; i < list.length; i += 1) {
      if (version === 4) {
        const step = normalizeStepV4(list[i], `step${i + 1}`);
        if (!step) continue;
        if (seenStep.has(step.id)) continue;
        seenStep.add(step.id);
        stepsV4.push(step);
        if (stepsV4.length >= 30) break;
      } else {
        const step = normalizeStepV3(list[i], `step${i + 1}`);
        if (!step) continue;
        if (seenStep.has(step.id)) continue;
        seenStep.add(step.id);
        stepsV3.push(step);
        if (stepsV3.length >= 30) break;
      }
    }
    if (version === 4) {
      if (stepsV4.length) calendarStepsV4[calId] = stepsV4;
    } else {
      if (stepsV3.length) calendarStepsV3[calId] = stepsV3;
    }
  }

  const customVariables = normalizeStringRecord(settingsRaw.customVariables, 30, 32, 800);

  if (version === 4) {
    return {
      version: 4,
      enabled: normalizeBool(settingsRaw.enabled, defaults.enabled),
      templates: templates.length ? templates : defaults.templates,
      chainTemplates: chainTemplatesV4,
      assignments: {
        defaultSteps: defaultStepsV4.length ? defaultStepsV4 : defaults.assignments.defaultSteps,
        calendarSteps: calendarStepsV4,
      },
      customVariables,
    };
  }

  return convertV3ToV4({
    enabled: normalizeBool(settingsRaw.enabled, defaults.enabled),
    templates: templates.length ? templates : defaults.templates,
    chainTemplates: chainTemplatesV3,
    assignments: {
      defaultSteps: defaultStepsV3,
      calendarSteps: calendarStepsV3,
    },
    customVariables,
  });
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
    const stepId =
      typeof r.stepId === "string"
        ? r.stepId
        : typeof r.templateId === "string"
          ? r.templateId
          : "step";
    const stepName =
      typeof r.stepName === "string"
        ? r.stepName
        : typeof r.templateName === "string"
          ? r.templateName
          : "Step";
    const calendarId = typeof r.calendarId === "string" ? r.calendarId : undefined;
    const channel =
      r.channel === "EMAIL" || r.channel === "SMS" || r.channel === "TAG" ? (r.channel as FollowUpChannel) : null;
    const to = typeof r.to === "string" ? r.to : undefined;
    const body = typeof r.body === "string" ? r.body : undefined;
    const contactId = typeof r.contactId === "string" ? r.contactId : undefined;
    const tagId = typeof r.tagId === "string" ? r.tagId : undefined;
    const sendAtIso = typeof r.sendAtIso === "string" ? r.sendAtIso : null;
    const status =
      r.status === "PENDING" || r.status === "SENT" || r.status === "FAILED" || r.status === "CANCELED"
        ? (r.status as FollowUpQueueItem["status"])
        : "PENDING";
    const attempts = clampInt(r.attempts, 0, 0, 20);
    const createdAtIso = typeof r.createdAtIso === "string" ? r.createdAtIso : nowIso();
    const subject = typeof r.subject === "string" ? r.subject : undefined;
    const attachments = normalizeEmailAttachmentRefs(r.attachments);
    const lastError = typeof r.lastError === "string" ? r.lastError : undefined;
    const sentAtIso = typeof r.sentAtIso === "string" ? r.sentAtIso : undefined;

    if (!id || !bookingId || !ownerId || !channel || !sendAtIso) continue;
    if ((channel === "EMAIL" || channel === "SMS") && (!to || !body)) continue;
    if (channel === "TAG" && (!contactId || !tagId)) continue;
    queue.push({
      id,
      bookingId,
      ownerId,
      stepId,
      stepName,
      calendarId,
      channel,
      to,
      contactId,
      tagId,
      subject,
      body,
      attachments: channel === "EMAIL" && attachments.length ? attachments : undefined,
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

  return { version: 4, settings, queue, bookingMeta };
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
    version: 4,
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
  return renderTextTemplate(template, vars);
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
  const site = await prisma.portalBookingSite.findUnique({
    where: { ownerId },
    select: { id: true, title: true, timeZone: true, notificationEmails: true, meetingLocation: true, meetingDetails: true },
  });
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
  const calendar = calendarId ? calendars?.calendars?.find((c) => c.id === calendarId) : null;
  const calendarTitle = calendar?.title ?? null;
  const bookingTitle = calendarTitle?.trim() || site.title;
  const when = `${formatInTimeZone(new Date(bookingRow.startAt), site.timeZone)} (${site.timeZone})`;

  // Derive meeting link & location for templates.
  let meetingLink: string | null = null;
  let location: string | null = null;

  const rawNotes = typeof (bookingRow as any).notes === "string" ? ((bookingRow as any).notes as string) : "";
  if (rawNotes.startsWith("[Purely Connect Meeting]")) {
    const lines = rawNotes.split(/\r?\n/);
    if (lines.length >= 2) {
      const urlLine = lines[1].trim();
      if (urlLine) meetingLink = urlLine;
    }
  }

  if (meetingLink) {
    location = meetingLink;
  } else {
    const calendarLocation = calendar?.meetingLocation?.trim();
    const siteLocation = (site as any).meetingLocation ? String((site as any).meetingLocation).trim() : "";
    location = calendarLocation || siteLocation || "";
  }

  const siteNotificationEmails = Array.isArray((site as any).notificationEmails)
    ? (((site as any).notificationEmails as unknown) as unknown[])
        .filter((x) => typeof x === "string")
        .map((x) => String(x).trim().toLowerCase())
        .filter((x) => x.includes("@"))
        .slice(0, 20)
    : [];

  const vars: Record<string, string> = {
    ...buildPortalTemplateVars({
      contact: {
        id: bookingRow.contactId ?? null,
        name: bookingRow.contactName ?? null,
        email: bookingRow.contactEmail ?? null,
        phone: bookingRow.contactPhone ?? null,
      },
      business: { name: businessName },
    }),
    bookingTitle,
    calendarTitle: calendarTitle?.trim() || bookingTitle,
    timeZone: site.timeZone,
    startAt: new Date(bookingRow.startAt).toISOString(),
    endAt: new Date(bookingRow.endAt).toISOString(),
    when,
    location: location ?? "",
    meetingLink: meetingLink ?? "",
    ...settings.customVariables,
  };

  const nextQueue = [...service.queue];
  const before = nextQueue.length;

  const selectedSteps = (() => {
    const list = calendarId ? settings.assignments.calendarSteps?.[calendarId] : null;
    const steps = Array.isArray(list) && list.length ? list : settings.assignments.defaultSteps;
    return (steps || []).filter(Boolean).slice(0, 30);
  })();

  const desiredKeys = new Set<string>();

  function desiredKeyForQueueItem(q: Pick<FollowUpQueueItem, "bookingId" | "stepId" | "channel" | "to" | "contactId" | "tagId">) {
    if (q.channel === "TAG") return `${q.bookingId}:${q.stepId}:TAG:${q.contactId || ""}:${q.tagId || ""}`;
    return `${q.bookingId}:${q.stepId}:${q.channel}:${String(q.to || "").trim().toLowerCase()}`;
  }

  function upsertMessage(
    step: FollowUpStep,
    channel: "EMAIL" | "SMS",
    to: string,
    subject: string | undefined,
    body: string,
    sendAt: Date,
    attachments?: FollowUpEmailAttachmentRef[],
  ) {
    const toKey = String(to || "").trim().toLowerCase();
    const desiredKey = `${bookingRow.id}:${step.id}:${channel}:${toKey}`;
    desiredKeys.add(desiredKey);

    const existingIndex = nextQueue.findIndex(
      (x) =>
        x.bookingId === bookingRow.id &&
        x.stepId === step.id &&
        x.channel === channel &&
        String(x.to || "").trim().toLowerCase() === toKey &&
        x.status === "PENDING",
    );

    const base: FollowUpQueueItem = {
      id: existingIndex >= 0 ? nextQueue[existingIndex]!.id : randomId("fu"),
      bookingId: bookingRow.id,
      ownerId,
      stepId: step.id,
      stepName: step.name,
      calendarId: calendarId || undefined,
      channel,
      to,
      subject,
      body,
      attachments: channel === "EMAIL" && attachments && attachments.length ? attachments.slice(0, 10) : undefined,
      sendAtIso: sendAt.toISOString(),
      status: "PENDING",
      attempts: existingIndex >= 0 ? nextQueue[existingIndex]!.attempts : 0,
      createdAtIso: existingIndex >= 0 ? nextQueue[existingIndex]!.createdAtIso : nowIso(),
    };
    if (existingIndex >= 0) nextQueue[existingIndex] = base;
    else nextQueue.push(base);
  }

  function upsertTag(step: FollowUpStep, contactId: string, tagId: string, sendAt: Date) {
    const desiredKey = `${bookingRow.id}:${step.id}:TAG:${contactId}:${tagId}`;
    desiredKeys.add(desiredKey);

    const existingIndex = nextQueue.findIndex(
      (x) =>
        x.bookingId === bookingRow.id &&
        x.stepId === step.id &&
        x.channel === "TAG" &&
        x.contactId === contactId &&
        x.tagId === tagId &&
        x.status === "PENDING",
    );

    const base: FollowUpQueueItem = {
      id: existingIndex >= 0 ? nextQueue[existingIndex]!.id : randomId("fu"),
      bookingId: bookingRow.id,
      ownerId,
      stepId: step.id,
      stepName: step.name,
      calendarId: calendarId || undefined,
      channel: "TAG",
      contactId,
      tagId,
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
    // We'll keep it for now; after scheduling we cancel anything not in desiredKeys.
    // (No-op here.)
  }

  for (const step of selectedSteps) {
    if (!step) continue;
    if (!step.enabled) continue;

    const sendAt = new Date(new Date(bookingRow.endAt).getTime() + clampInt(step.delayMinutes, 0, 0, MAX_DELAY_MINUTES) * 60_000);

    const audience: FollowUpAudience = step.audience === "INTERNAL" ? "INTERNAL" : "CONTACT";

    const internal = (() => {
      if (audience !== "INTERNAL") return { emails: [] as string[], phones: [] as string[] };

      const cfg = step.internalRecipients;
      if (cfg?.mode === "CUSTOM") {
        const emails = Array.isArray(cfg.emails) ? normalizeEmailList(cfg.emails, 20) : [];
        const phones = Array.isArray(cfg.phones) ? normalizePhoneList(cfg.phones, 20) : [];
        return { emails, phones };
      }

      const calendarEmails = Array.isArray((calendar as any)?.notificationEmails)
        ? (((calendar as any).notificationEmails as unknown) as string[])
        : [];
      const emails = calendarEmails.length ? calendarEmails : siteNotificationEmails;
      return { emails, phones: [] as string[] };
    })();

    if (step.kind === "EMAIL") {
      const subject = renderTemplate(step.email?.subjectTemplate || "Follow-up", vars).slice(0, 120);
      const body = renderTemplate(step.email?.bodyTemplate || "", vars).slice(0, 5000);
      const attachments = normalizeEmailAttachmentRefs(step.email?.attachments);
      if (audience === "CONTACT") {
        if (bookingRow.contactEmail) upsertMessage(step, "EMAIL", bookingRow.contactEmail, subject, body, sendAt, attachments);
      } else {
        for (const email of internal.emails) {
          upsertMessage(step, "EMAIL", email, subject, body, sendAt, attachments);
        }
      }
    } else if (step.kind === "SMS") {
      const body = renderTemplate(step.sms?.bodyTemplate || "", vars).slice(0, 900);
      if (audience === "CONTACT") {
        if (bookingRow.contactPhone) upsertMessage(step, "SMS", bookingRow.contactPhone, undefined, body, sendAt);
      } else {
        for (const phone of internal.phones) {
          upsertMessage(step, "SMS", phone, undefined, body, sendAt);
        }
      }
    } else if (step.kind === "TAG") {
      if (audience !== "CONTACT") continue;
      const contactId = bookingRow.contactId;
      const tagId = step.tagId;
      if (!contactId || !tagId) continue;
      upsertTag(step, contactId, tagId, sendAt);
    }
  }

  // Now cancel pending items that are no longer selected.
  for (let i = 0; i < nextQueue.length; i += 1) {
    const q = nextQueue[i]!;
    if (q.bookingId !== bookingRow.id) continue;
    if (q.status !== "PENDING") continue;
    const key = desiredKeyForQueueItem(q);
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

  const payload: any = { version: 4, settings, queue: trimmed, bookingMeta: trimmedMeta };
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
  const payload: any = { version: 4, settings: service.settings, queue: nextQueue, bookingMeta: service.bookingMeta ?? {} };
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

    const emailConfigured = isOutboundEmailConfigured();
    const fromEmail = getOutboundEmailFrom().fromEmail;
    const twilio = await getOwnerTwilioSmsConfig(row.ownerId);

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
          const to = msg.to || "";
          const body = msg.body || "";
          if (!emailConfigured || !fromEmail) {
            skipped++;
            nextQueue[idx] = { ...nextQueue[idx]!, status: "FAILED", attempts: msg.attempts + 1, lastError: "Email not configured" };
            changed = true;
            continue;
          }

          if (!to || !body) {
            failed++;
            nextQueue[idx] = { ...nextQueue[idx]!, status: "FAILED", attempts: msg.attempts + 1, lastError: "Missing email payload" };
            changed = true;
            continue;
          }

          const subject = (msg.subject || "Follow-up").slice(0, 120);
          const attachmentRefs = normalizeEmailAttachmentRefs(msg.attachments);
          if (attachmentRefs.length) {
            const ids = attachmentRefs.map((a) => a.mediaItemId).filter(Boolean).slice(0, 10);
            const media = await prisma.portalMediaItem.findMany({
              where: { ownerId: row.ownerId, id: { in: ids } },
              select: { id: true, fileName: true, mimeType: true, bytes: true, storageUrl: true },
            });
            const byId = new Map(media.map((m) => [m.id, m] as const));
            const missing = ids.filter((id) => !byId.has(id));
            if (missing.length) {
              failed++;
              nextQueue[idx] = {
                ...nextQueue[idx]!,
                status: "FAILED",
                attempts: msg.attempts + 1,
                lastError: `Missing attachment(s): ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`,
              };
              changed = true;
              continue;
            }

            const blobOnlyAll = ids.map((id) => byId.get(id)!).filter((m) => !m.bytes);
            const blobOnly = blobOnlyAll.slice(0, 3);
            if (blobOnly.length) {
              failed++;
              nextQueue[idx] = {
                ...nextQueue[idx]!,
                status: "FAILED",
                attempts: msg.attempts + 1,
                lastError: `Attachment(s) stored externally can't be attached yet: ${blobOnly
                  .map((m) => m.fileName || m.id)
                  .join(", ")}${blobOnlyAll.length > 3 ? "…" : ""}`,
              };
              changed = true;
              continue;
            }

            const attachments = attachmentRefs
              .map((ref) => byId.get(ref.mediaItemId)!)
              .map((m) => ({
                fileName: m.fileName,
                mimeType: m.mimeType,
                bytes: Buffer.from(m.bytes!),
              }));

            try {
              await sendTransactionalEmail({
                to,
                subject,
                text: body,
                fromName,
                attachments,
              });
            } catch (err: any) {
              failed++;
              nextQueue[idx] = {
                ...nextQueue[idx]!,
                status: "FAILED",
                attempts: msg.attempts + 1,
                lastError: err?.message ? String(err.message).slice(0, 400) : "Email send failed",
              };
              changed = true;
              continue;
            }
          } else {
          try {
            await sendTransactionalEmail({
              to,
              subject,
              text: body,
              fromName,
            });
          } catch (err: any) {
            failed++;
            nextQueue[idx] = {
              ...nextQueue[idx]!,
              status: "FAILED",
              attempts: msg.attempts + 1,
              lastError: err?.message ? String(err.message).slice(0, 400) : "Email send failed",
            };
            changed = true;
            continue;
          }
          }

          sent++;
          nextQueue[idx] = { ...nextQueue[idx]!, status: "SENT", sentAtIso: nowIso(), lastError: undefined };
          changed = true;

          // Best-effort: trigger portal automations.
          try {
            await runOwnerAutomationsForEvent({
              ownerId: row.ownerId,
              triggerKind: "follow_up_sent",
              message: { from: fromEmail || "", to, body },
              contact: { name: to, email: to },
            });
          } catch {
            // ignore
          }
        } else if (msg.channel === "SMS") {
          const to = msg.to || "";
          const body = msg.body || "";
          if (!twilio) {
            skipped++;
            nextQueue[idx] = { ...nextQueue[idx]!, status: "FAILED", attempts: msg.attempts + 1, lastError: "Texting not configured" };
            changed = true;
            continue;
          }

          if (!to || !body) {
            failed++;
            nextQueue[idx] = { ...nextQueue[idx]!, status: "FAILED", attempts: msg.attempts + 1, lastError: "Missing SMS payload" };
            changed = true;
            continue;
          }

          const res = await sendOwnerTwilioSms({ ownerId: row.ownerId, to, body: body.slice(0, 900) });
          if (!res.ok) {
            failed++;
            nextQueue[idx] = {
              ...nextQueue[idx]!,
              status: "FAILED",
              attempts: msg.attempts + 1,
              lastError: String(res.error || "SMS send failed").slice(0, 400),
            };
            changed = true;
            continue;
          }

          sent++;
          nextQueue[idx] = { ...nextQueue[idx]!, status: "SENT", sentAtIso: nowIso(), lastError: undefined };
          changed = true;

          // Best-effort: trigger portal automations.
          try {
            await runOwnerAutomationsForEvent({
              ownerId: row.ownerId,
              triggerKind: "follow_up_sent",
              message: { from: twilio?.fromNumberE164 || "", to, body },
              contact: { name: to, phone: to },
            });
          } catch {
            // ignore
          }
        } else {
          const contactId = msg.contactId || "";
          const tagId = msg.tagId || "";
          if (!contactId || !tagId) {
            failed++;
            nextQueue[idx] = { ...nextQueue[idx]!, status: "FAILED", attempts: msg.attempts + 1, lastError: "Missing tag payload" };
            changed = true;
            continue;
          }

          const ok = await addContactTagAssignment({ ownerId: row.ownerId, contactId, tagId });
          if (!ok) {
            failed++;
            nextQueue[idx] = { ...nextQueue[idx]!, status: "FAILED", attempts: msg.attempts + 1, lastError: "Failed to apply tag" };
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
      const payload: any = { version: 4, settings: service.settings, queue: nextQueue, bookingMeta: service.bookingMeta ?? {} };
      await prisma.portalServiceSetup.updateMany({
        where: { ownerId: row.ownerId, serviceSlug: SERVICE_SLUG },
        data: { dataJson: payload, status: "COMPLETE" },
      });
    }
  }

  return { processed, sent, skipped, failed };
}
