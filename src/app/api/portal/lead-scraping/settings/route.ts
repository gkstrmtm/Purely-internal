import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getCreditsState } from "@/lib/credits";
import { resolveEntitlements } from "@/lib/entitlements";
import { hasPlacesKey } from "@/lib/googlePlaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

const stringList = z.array(z.string()).max(500);

const settingsSchema = z.object({
  version: z.literal(3),
  b2b: z.object({
    niche: z.string().max(200),
    location: z.string().max(200),
    count: z.number().int().min(1).max(500),
    requireEmail: z.boolean(),
    requirePhone: z.boolean(),
    requireWebsite: z.boolean(),
    excludeNameContains: stringList,
    excludeDomains: stringList,
    excludePhones: stringList,
    scheduleEnabled: z.boolean(),
    frequencyDays: z.number().int().min(1).max(60),
    lastRunAtIso: z.string().nullable(),
  }),
  b2c: z.object({
    notes: z.string().max(5000),
    scheduleEnabled: z.boolean(),
    frequencyDays: z.number().int().min(1).max(60),
    lastRunAtIso: z.string().nullable(),
  }),
  outbound: z
    .object({
      enabled: z.boolean(),
      email: z.object({
        enabled: z.boolean(),
        trigger: z.enum(["MANUAL", "ON_SCRAPE", "ON_APPROVE"]),
        subject: z.string().max(120),
        text: z.string().max(20000),
      }),
      sms: z.object({
        enabled: z.boolean(),
        trigger: z.enum(["MANUAL", "ON_SCRAPE", "ON_APPROVE"]),
        text: z.string().max(900),
      }),
      resources: z
        .array(
          z.object({
            label: z.string().max(120),
            url: z.string().max(500),
          }),
        )
        .max(30),
    })
    .optional(),
  outboundState: z
    .object({
      approvedAtByLeadId: z.record(z.string().max(64), z.string().max(40)).optional(),
      sentAtByLeadId: z.record(z.string().max(64), z.string().max(40)).optional(),
    })
    .optional(),
});

type LeadScrapingSettings = z.infer<typeof settingsSchema>;

type LeadScrapingSettingsV1 = {
  version: 1;
  b2b: {
    niche: string;
    location: string;
    count: number;
    requirePhone: boolean;
    requireWebsite: boolean;
    excludeNameContains: string[];
    excludeDomains: string[];
    excludePhones: string[];
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  b2c: {
    notes: string;
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
};

type OutboundSettings = NonNullable<LeadScrapingSettings["outbound"]>;
type OutboundState = NonNullable<LeadScrapingSettings["outboundState"]>;

type NormalizedLeadScrapingSettings = Omit<LeadScrapingSettings, "outbound" | "outboundState"> & {
  outbound: OutboundSettings;
  outboundState: OutboundState;
};

function normalizeStringList(xs: unknown, { lower }: { lower?: boolean } = {}) {
  const arr = Array.isArray(xs) ? xs : [];
  return arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .map((x) => (lower ? x.toLowerCase() : x))
    .slice(0, 200);
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeUrl(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) return s.slice(0, 500);
  return "";
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOutbound(value: unknown): OutboundSettings {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  // v2 -> v3 migration.
  const isV2 =
    typeof (rec as any).sendEmail === "boolean" ||
    typeof (rec as any).sendSms === "boolean" ||
    typeof (rec as any).emailHtml === "string" ||
    typeof (rec as any).emailText === "string";

  const resourcesRaw = Array.isArray((rec as any).resources) ? ((rec as any).resources as unknown[]) : [];
  const resources = resourcesRaw
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
    .map((r) => ({
      label: (typeof r.label === "string" ? r.label.trim() : "").slice(0, 120) || "Resource",
      url: normalizeUrl(r.url),
    }))
    .filter((r) => Boolean(r.url))
    .slice(0, 30);

  const parseTrigger = (t: unknown) => {
    const raw = typeof t === "string" ? t.trim() : "MANUAL";
    return raw === "ON_SCRAPE" || raw === "ON_APPROVE" ? raw : "MANUAL";
  };

  if (isV2) {
    const enabled = Boolean((rec as any).enabled);
    const trigger = parseTrigger((rec as any).trigger);
    const sendEmail = (rec as any).sendEmail === undefined ? true : Boolean((rec as any).sendEmail);
    const sendSms = Boolean((rec as any).sendSms);

    const emailHtml = typeof (rec as any).emailHtml === "string" ? ((rec as any).emailHtml as string) : "";
    const emailTextRaw = typeof (rec as any).emailText === "string" ? ((rec as any).emailText as string) : "";
    const emailText = (emailTextRaw || stripHtml(emailHtml)).slice(0, 20000);

    return {
      enabled,
      email: {
        enabled: enabled && sendEmail,
        trigger,
        subject: (typeof (rec as any).emailSubject === "string" ? ((rec as any).emailSubject as string) : "").slice(0, 120),
        text: emailText,
      },
      sms: {
        enabled: enabled && sendSms,
        trigger,
        text: (typeof (rec as any).smsText === "string" ? ((rec as any).smsText as string) : "").slice(0, 900),
      },
      resources,
    };
  }

  const emailRec = (rec as any).email && typeof (rec as any).email === "object" ? ((rec as any).email as Record<string, unknown>) : {};
  const smsRec = (rec as any).sms && typeof (rec as any).sms === "object" ? ((rec as any).sms as Record<string, unknown>) : {};

  return {
    enabled: Boolean((rec as any).enabled),
    email: {
      enabled: Boolean(emailRec.enabled),
      trigger: parseTrigger(emailRec.trigger),
      subject: (typeof emailRec.subject === "string" ? (emailRec.subject as string) : "").slice(0, 120),
      text: (typeof emailRec.text === "string" ? (emailRec.text as string) : "").slice(0, 20000),
    },
    sms: {
      enabled: Boolean(smsRec.enabled),
      trigger: parseTrigger(smsRec.trigger),
      text: (typeof smsRec.text === "string" ? (smsRec.text as string) : "").slice(0, 900),
    },
    resources,
  };
}

function normalizeOutboundState(value: unknown): OutboundState {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const approved = rec.approvedAtByLeadId && typeof rec.approvedAtByLeadId === "object" ? (rec.approvedAtByLeadId as Record<string, unknown>) : {};
  const sent = rec.sentAtByLeadId && typeof rec.sentAtByLeadId === "object" ? (rec.sentAtByLeadId as Record<string, unknown>) : {};

  const approvedAtByLeadId: Record<string, string> = {};
  for (const [k, v] of Object.entries(approved)) {
    if (typeof k !== "string" || k.length > 64) continue;
    if (typeof v !== "string") continue;
    const iso = normalizeIsoString(v);
    if (!iso) continue;
    approvedAtByLeadId[k] = iso;
  }

  const sentAtByLeadId: Record<string, string> = {};
  for (const [k, v] of Object.entries(sent)) {
    if (typeof k !== "string" || k.length > 64) continue;
    if (typeof v !== "string") continue;
    const iso = normalizeIsoString(v);
    if (!iso) continue;
    sentAtByLeadId[k] = iso;
  }

  // Keep maps bounded.
  const cap = 5000;
  const approvedEntries = Object.entries(approvedAtByLeadId).slice(0, cap);
  const sentEntries = Object.entries(sentAtByLeadId).slice(0, cap);

  return {
    approvedAtByLeadId: Object.fromEntries(approvedEntries),
    sentAtByLeadId: Object.fromEntries(sentEntries),
  };
}

function normalizeSettings(value: unknown): NormalizedLeadScrapingSettings {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const version = rec.version === 1 ? 1 : rec.version === 2 ? 2 : 3;
  const b2b = rec.b2b && typeof rec.b2b === "object" ? (rec.b2b as Record<string, unknown>) : {};
  const b2c = rec.b2c && typeof rec.b2c === "object" ? (rec.b2c as Record<string, unknown>) : {};

  const defaultOutbound: OutboundSettings = {
    enabled: false,
    email: {
      enabled: true,
      trigger: "MANUAL",
      subject: "Quick question — {businessName}",
      text: "Hi {businessName},\n\nQuick question — are you taking on new work right now?\n\n—",
    },
    sms: {
      enabled: false,
      trigger: "MANUAL",
      text: "Hi {businessName} — quick question. Are you taking on new work right now?",
    },
    resources: [],
  };

  const outbound = normalizeOutbound(rec.outbound);
  const outboundState = normalizeOutboundState(rec.outboundState);

  const settings: NormalizedLeadScrapingSettings = {
    version: 3,
    b2b: {
      niche: typeof b2b.niche === "string" ? b2b.niche.slice(0, 200) : "",
      location: typeof b2b.location === "string" ? b2b.location.slice(0, 200) : "",
      count:
        typeof b2b.count === "number" && Number.isFinite(b2b.count)
          ? Math.min(500, Math.max(1, Math.floor(b2b.count)))
          : 25,
      requireEmail: Boolean((b2b as any).requireEmail),
      requirePhone: Boolean(b2b.requirePhone),
      requireWebsite: Boolean(b2b.requireWebsite),
      excludeNameContains: normalizeStringList(b2b.excludeNameContains),
      excludeDomains: normalizeStringList(b2b.excludeDomains, { lower: true }),
      excludePhones: normalizeStringList(b2b.excludePhones),
      scheduleEnabled: Boolean(b2b.scheduleEnabled),
      frequencyDays:
        typeof b2b.frequencyDays === "number" && Number.isFinite(b2b.frequencyDays)
          ? Math.min(60, Math.max(1, Math.floor(b2b.frequencyDays)))
          : 7,
      lastRunAtIso: normalizeIsoString(b2b.lastRunAtIso),
    },
    b2c: {
      notes: typeof b2c.notes === "string" ? b2c.notes.slice(0, 5000) : "",
      scheduleEnabled: Boolean(b2c.scheduleEnabled),
      frequencyDays:
        typeof b2c.frequencyDays === "number" && Number.isFinite(b2c.frequencyDays)
          ? Math.min(60, Math.max(1, Math.floor(b2c.frequencyDays)))
          : 7,
      lastRunAtIso: normalizeIsoString(b2c.lastRunAtIso),
    },
    outbound: {
      ...defaultOutbound,
      ...outbound,
      // If this record came from v1 settings, don't accidentally enable new behavior.
      enabled: version === 1 ? false : Boolean(outbound.enabled),
    },
    outboundState,
  };

  return settings;
}

async function loadSettings(ownerId: string): Promise<NormalizedLeadScrapingSettings> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return normalizeSettings(row?.dataJson);
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const entitlements = await resolveEntitlements(auth.session.user.email);

  const [settings, credits] = await Promise.all([
    loadSettings(ownerId),
    getCreditsState(ownerId),
  ]);

  // Outbound is a separately gated feature. If the account isn't entitled,
  // never surface an enabled outbound config.
  const gatedSettings: NormalizedLeadScrapingSettings = entitlements.leadOutbound
    ? settings
    : {
        ...settings,
        outbound: {
          ...settings.outbound,
          enabled: false,
          email: {
            ...settings.outbound.email,
            enabled: false,
            trigger: "MANUAL",
          },
          sms: {
            ...settings.outbound.sms,
            enabled: false,
            trigger: "MANUAL",
          },
        },
      };

  return NextResponse.json({
    ok: true,
    settings: gatedSettings,
    credits: credits.balance,
    placesConfigured: hasPlacesKey(),
  });
}

const putSchema = z.object({ settings: settingsSchema });

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const entitlements = await resolveEntitlements(auth.session.user.email);

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  let normalized = normalizeSettings(parsed.data.settings);

  if (!entitlements.leadOutbound) {
    normalized = {
      ...normalized,
      outbound: {
        ...normalized.outbound,
        enabled: false,
        email: {
          ...normalized.outbound.email,
          enabled: false,
          trigger: "MANUAL",
        },
        sms: {
          ...normalized.outbound.sms,
          enabled: false,
          trigger: "MANUAL",
        },
      },
    };
  }

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "IN_PROGRESS", dataJson: normalized },
    update: { dataJson: normalized, status: "IN_PROGRESS" },
    select: { id: true },
  });

  const credits = await getCreditsState(ownerId);

  return NextResponse.json({
    ok: true,
    settings: normalized,
    credits: credits.balance,
    placesConfigured: hasPlacesKey(),
  });
}
