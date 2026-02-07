import { NextResponse } from "next/server";
import { z } from "zod";
import https from "https";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { addCredits, consumeCredits } from "@/lib/credits";
import { hasPlacesKey, placeDetails, placesTextSearch } from "@/lib/googlePlaces";
import { resolveEntitlements } from "@/lib/entitlements";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { createPortalLeadCompat } from "@/lib/portalLeadCompat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

const TAG_COLORS = [
  "#0EA5E9", // sky
  "#2563EB", // blue
  "#7C3AED", // violet
  "#EC4899", // pink
  "#F97316", // orange
  "#F59E0B", // amber
  "#10B981", // emerald
  "#22C55E", // green
  "#64748B", // slate
  "#111827", // gray-900
] as const;

const runSchema = z.object({
  kind: z.enum(["B2B", "B2C"]),
});

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length < 8) return digits;
  return digits;
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

type Settings = {
  version: 3;
  tagPresets: Array<{ label: string; color: string }>;
  b2b: {
    niche: string;
    location: string;
    fallbackEnabled: boolean;
    fallbackLocations: string[];
    fallbackNiches: string[];
    count: number;
    requireEmail: boolean;
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
    source?: "OSM_ADDRESS" | "OSM_POI_PHONE";
    location?: string;
    country?: string;
    count?: number;
    notes: string;
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  outbound: {
    enabled: boolean;
    email: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
      subject: string;
      text: string;
    };
    sms: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
      text: string;
    };
    resources: Array<{ label: string; url: string }>;
  };
  outboundState: {
    approvedAtByLeadId: Record<string, string>;
    sentAtByLeadId: Record<string, string>;
  };
};

function isDevTlsCertError(e: unknown): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const anyErr = e as any;
  const code = anyErr?.cause?.code;
  if (code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") return true;
  const msg = anyErr?.cause?.message || anyErr?.message;
  return typeof msg === "string" && msg.toLowerCase().includes("certificate");
}

async function httpsTextInsecure(urlStr: string, {
  method,
  headers,
  body,
}: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; text: string }> {
  const url = new URL(urlStr);
  if (url.protocol !== "https:") throw new Error("Only https:// URLs are supported");

  const agent = new https.Agent({ rejectUnauthorized: false });

  return await new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: url.pathname + url.search,
        method: method ?? "GET",
        headers,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, text });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchTextWithDevTlsFallback(
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, init);
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    if (!isDevTlsCertError(e)) throw e;

    const insecure = await httpsTextInsecure(url, {
      method: typeof init.method === "string" ? init.method : "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === "string" ? init.body : undefined,
    });

    return { ok: insecure.status >= 200 && insecure.status < 300, status: insecure.status, text: insecure.text };
  }
}

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

function normalizeOutbound(value: unknown): Settings["outbound"] {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const isV2 =
    typeof (rec as any).sendEmail === "boolean" ||
    typeof (rec as any).sendSms === "boolean" ||
    typeof (rec as any).emailHtml === "string" ||
    typeof (rec as any).emailText === "string";

  const resourcesRaw = Array.isArray(rec.resources) ? rec.resources : [];
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

    const html = typeof (rec as any).emailHtml === "string" ? ((rec as any).emailHtml as string) : "";
    const textRaw = typeof (rec as any).emailText === "string" ? ((rec as any).emailText as string) : "";
    const text = (textRaw || stripHtml(html)).slice(0, 20000);

    return {
      enabled,
      email: {
        enabled: enabled && sendEmail,
        trigger,
        subject: (typeof (rec as any).emailSubject === "string" ? ((rec as any).emailSubject as string) : "").slice(0, 120),
        text,
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
      enabled: Boolean((emailRec as any).enabled),
      trigger: parseTrigger((emailRec as any).trigger),
      subject: (typeof (emailRec as any).subject === "string" ? ((emailRec as any).subject as string) : "").slice(0, 120),
      text: (typeof (emailRec as any).text === "string" ? ((emailRec as any).text as string) : "").slice(0, 20000),
    },
    sms: {
      enabled: Boolean((smsRec as any).enabled),
      trigger: parseTrigger((smsRec as any).trigger),
      text: (typeof (smsRec as any).text === "string" ? ((smsRec as any).text as string) : "").slice(0, 900),
    },
    resources,
  };
}

function normalizeOutboundState(value: unknown): Settings["outboundState"] {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const approved =
    rec.approvedAtByLeadId && typeof rec.approvedAtByLeadId === "object"
      ? (rec.approvedAtByLeadId as Record<string, unknown>)
      : {};
  const sent =
    rec.sentAtByLeadId && typeof rec.sentAtByLeadId === "object"
      ? (rec.sentAtByLeadId as Record<string, unknown>)
      : {};

  const approvedAtByLeadId: Record<string, string> = {};
  for (const [k, v] of Object.entries(approved)) {
    if (k.length > 64) continue;
    if (typeof v !== "string") continue;
    const iso = normalizeIsoString(v);
    if (!iso) continue;
    approvedAtByLeadId[k] = iso;
  }

  const sentAtByLeadId: Record<string, string> = {};
  for (const [k, v] of Object.entries(sent)) {
    if (k.length > 64) continue;
    if (typeof v !== "string") continue;
    const iso = normalizeIsoString(v);
    if (!iso) continue;
    sentAtByLeadId[k] = iso;
  }

  return {
    approvedAtByLeadId: Object.fromEntries(Object.entries(approvedAtByLeadId).slice(0, 5000)),
    sentAtByLeadId: Object.fromEntries(Object.entries(sentAtByLeadId).slice(0, 5000)),
  };
}

function normalizeTagPresets(value: unknown): Settings["tagPresets"] {
  const raw = Array.isArray(value) ? value : [];
  const presets = raw
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .map((p) => {
      const label = (typeof p.label === "string" ? p.label.trim() : "").slice(0, 40);
      const colorRaw = typeof p.color === "string" ? p.color.trim() : "";
      const color = (TAG_COLORS as readonly string[]).includes(colorRaw) ? colorRaw : "#111827";
      return { label, color };
    })
    .filter((p) => Boolean(p.label))
    .slice(0, 10);

  if (presets.length) return presets;

  return [
    { label: "New", color: "#2563EB" },
    { label: "Follow-up", color: "#F59E0B" },
    { label: "Outbound sent", color: "#10B981" },
    { label: "Interested", color: "#7C3AED" },
    { label: "Not interested", color: "#64748B" },
  ];
}

function renderTemplate(raw: string, lead: { businessName: string; phone: string | null; website: string | null; address: string | null; niche: string | null }) {
  const map: Record<string, string> = {
    businessName: lead.businessName,
    phone: lead.phone ?? "",
    website: lead.website ?? "",
    address: lead.address ?? "",
    niche: lead.niche ?? "",
  };
  return raw.replace(/\{(businessName|phone|website|address|niche)\}/g, (_, k: string) => map[k] ?? "");
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseUrlFromEnv(): string {
  const env = process.env.NEXTAUTH_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");
  return "http://localhost:3000";
}

async function sendEmail({
  to,
  cc,
  subject,
  text,
  fromName,
}: {
  to: string;
  cc?: string | null;
  subject: string;
  text: string;
  fromName?: string;
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) throw new Error("Email is not configured yet.");

  const safeText = (text || "").trim() || " ";
  const ccEmail = (cc || "").trim();
  const personalizations: any = {
    to: [{ email: to }],
    ...(ccEmail ? { cc: [{ email: ccEmail }] } : {}),
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [personalizations],
      from: { email: fromEmail, name: fromName ?? "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: safeText }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SendGrid failed (${res.status}): ${t.slice(0, 400)}`);
  }
}

async function sendSms({ ownerId, to, body }: { ownerId: string; to: string; body: string }) {
  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) throw new Error("Texting is not configured yet.");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", twilio.fromNumberE164);
  form.set("Body", body.slice(0, 900));

  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Twilio failed (${res.status}): ${t.slice(0, 400)}`);
  }
}

function normalizeSettings(value: unknown): Settings {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const legacyVersion = rec.version === 1 ? 1 : rec.version === 3 ? 3 : 2;
  const b2b = rec.b2b && typeof rec.b2b === "object" ? (rec.b2b as Record<string, unknown>) : {};
  const b2c = rec.b2c && typeof rec.b2c === "object" ? (rec.b2c as Record<string, unknown>) : {};

  const defaultOutbound: Settings["outbound"] = {
    enabled: false,
    email: {
      enabled: false,
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

  const mergedOutbound: Settings["outbound"] = {
    ...defaultOutbound,
    ...outbound,
    email: {
      ...defaultOutbound.email,
      ...outbound.email,
    },
    sms: {
      ...defaultOutbound.sms,
      ...outbound.sms,
    },
    resources: outbound.resources ?? defaultOutbound.resources,
  };

  if (legacyVersion === 1) {
    mergedOutbound.enabled = false;
  }

  return {
    version: 3,
    tagPresets: normalizeTagPresets((rec as any).tagPresets),
    b2b: {
      niche: typeof b2b.niche === "string" ? b2b.niche.slice(0, 200) : "",
      location: typeof b2b.location === "string" ? b2b.location.slice(0, 200) : "",
      fallbackEnabled: Boolean((b2b as any).fallbackEnabled),
      fallbackLocations: normalizeStringList((b2b as any).fallbackLocations),
      fallbackNiches: normalizeStringList((b2b as any).fallbackNiches),
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
      source: (b2c as any).source === "OSM_POI_PHONE" ? "OSM_POI_PHONE" : "OSM_ADDRESS",
      location: typeof (b2c as any).location === "string" ? ((b2c as any).location as string).slice(0, 200) : "",
      country: typeof (b2c as any).country === "string" ? ((b2c as any).country as string).slice(0, 80) : "",
      count:
        typeof (b2c as any).count === "number" && Number.isFinite((b2c as any).count)
          ? Math.min(500, Math.max(1, Math.floor((b2c as any).count)))
          : 200,
      notes: typeof b2c.notes === "string" ? b2c.notes.slice(0, 5000) : "",
      scheduleEnabled: Boolean(b2c.scheduleEnabled),
      frequencyDays:
        typeof b2c.frequencyDays === "number" && Number.isFinite(b2c.frequencyDays)
          ? Math.min(60, Math.max(1, Math.floor(b2c.frequencyDays)))
          : 7,
      lastRunAtIso: normalizeIsoString(b2c.lastRunAtIso),
    },
    outbound: mergedOutbound,
    outboundState,
  };
}

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: [string, string, string, string]; // [south, north, west, east]
};

async function geocodeToBbox(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");

  const res = await fetchTextWithDevTlsFallback(url.toString(), {
    headers: {
      "user-agent": "PurelyAutomation/1.0 (lead-scraping; contact: support@purelyautomation.com)",
      accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim failed (${res.status}): ${res.text.slice(0, 200)}`);
  }

  const json = (JSON.parse(res.text || "[]") as NominatimResult[]) ?? [];
  const first = Array.isArray(json) ? json[0] : undefined;
  const bb = first?.boundingbox;
  if (!bb || bb.length !== 4) return null;

  const south = Number(bb[0]);
  const north = Number(bb[1]);
  const west = Number(bb[2]);
  const east = Number(bb[3]);
  if (![south, north, west, east].every((n) => Number.isFinite(n))) return null;

  return {
    displayName: typeof first?.display_name === "string" ? first.display_name : query,
    bbox: { south, north, west, east },
  };
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function fetchOsmElementsInBbox(
  { south, west, north, east }: { south: number; west: number; north: number; east: number },
  { mode }: { mode: "OSM_ADDRESS" | "OSM_POI_PHONE" },
) {
  const query =
    mode === "OSM_POI_PHONE"
      ? `[
out:json][timeout:25];
(
  node["name"]["addr:housenumber"]["addr:street"]["phone"](${south},${west},${north},${east});
  way["name"]["addr:housenumber"]["addr:street"]["phone"](${south},${west},${north},${east});
  relation["name"]["addr:housenumber"]["addr:street"]["phone"](${south},${west},${north},${east});
  node["name"]["addr:housenumber"]["addr:street"]["contact:phone"](${south},${west},${north},${east});
  way["name"]["addr:housenumber"]["addr:street"]["contact:phone"](${south},${west},${north},${east});
  relation["name"]["addr:housenumber"]["addr:street"]["contact:phone"](${south},${west},${north},${east});
);
out body center;`
      : `[
out:json][timeout:25];
(
  node["addr:housenumber"](${south},${west},${north},${east});
  way["addr:housenumber"](${south},${west},${north},${east});
  relation["addr:housenumber"](${south},${west},${north},${east});
);
out body center;`;

  const body = new URLSearchParams({ data: query }).toString();
  const res = await fetchTextWithDevTlsFallback("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "PurelyAutomation/1.0 (lead-scraping; contact: support@purelyautomation.com)",
      accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Overpass failed (${res.status}): ${res.text.slice(0, 200)}`);
  }

  const json = (JSON.parse(res.text || "{}") as any) ?? {};
  const elements = Array.isArray(json?.elements) ? (json.elements as OverpassElement[]) : [];
  return elements;
}

function matchesNameExclusion(businessName: string, excludeNameContains: string[]) {
  const name = businessName.toLowerCase();
  return excludeNameContains.some((term) => {
    const t = term.toLowerCase().trim();
    return t ? name.includes(t) : false;
  });
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const entitlements = await resolveEntitlements(auth.session.user.email);
  const outboundUnlocked = Boolean(entitlements.leadOutbound);
  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });
  const fromName = profile?.businessName?.trim() || "Purely Automation";

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (parsed.data.kind === "B2C") {
    const setup = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });

    const settings = normalizeSettings(setup?.dataJson);
    const location = (settings.b2c.location ?? "").trim();
    const country = (settings.b2c.country ?? "").trim();
    const requestedCount = typeof settings.b2c.count === "number" ? settings.b2c.count : 200;
    const source = settings.b2c.source === "OSM_POI_PHONE" ? "OSM_POI_PHONE" : "OSM_ADDRESS";

    if (!location) {
      return NextResponse.json(
        { ok: false, error: "Location is required.", code: "MISSING_REQUIRED" },
        { status: 400 },
      );
    }

    // Billing: reserve up to requestedCount, then refund unused.
    const reservedCredits = requestedCount;
    const consumed = await consumeCredits(ownerId, reservedCredits);
    if (!consumed.ok) {
      return NextResponse.json(
        { ok: false, error: "Insufficient credits.", code: "INSUFFICIENT_CREDITS" },
        { status: 402 },
      );
    }

    const run = await prisma.portalLeadScrapeRun.create({
      data: {
        ownerId,
        kind: "B2C",
        requestedCount,
        chargedCredits: reservedCredits,
        settingsJson: settings,
      },
      select: { id: true },
    });

    let createdCount = 0;
    let error: string | null = null;

    try {
      const geocodeQuery = country ? `${location}, ${country}` : location;
      const geo = await geocodeToBbox(geocodeQuery);
      if (!geo) throw new Error("Unable to geocode location. Try a more specific location.");

      const latSpan = Math.abs(geo.bbox.north - geo.bbox.south);
      const lonSpan = Math.abs(geo.bbox.east - geo.bbox.west);
      if (latSpan > 2.5 || lonSpan > 2.5) {
        throw new Error("Location is too broad for free pulling. Use a city/ZIP/postcode-sized area.");
      }

      const elements = await fetchOsmElementsInBbox(geo.bbox, { mode: source });
      const seen = new Set<string>();

      for (const el of elements) {
        if (createdCount >= requestedCount) break;
        const tags = el.tags ?? {};
        const name = (tags["name"] || "").trim();
        const house = (tags["addr:housenumber"] || "").trim();
        const street = (tags["addr:street"] || tags["name"] || "").trim();
        const city = (tags["addr:city"] || "").trim();
        const state = (tags["addr:state"] || "").trim();
        const postcode = (tags["addr:postcode"] || "").trim();
        const countryTag = (tags["addr:country"] || "").trim();

        const phoneRaw = (tags["phone"] || tags["contact:phone"] || "").trim();
        const phone = source === "OSM_POI_PHONE" ? normalizePhone(phoneRaw) : null;

        const line1 = [house, street].filter(Boolean).join(" ").trim();
        const line2 = [city, state, postcode].filter(Boolean).join(", ").trim();
        const address = [line1, line2, countryTag].filter(Boolean).join(" • ") || line1 || null;
        if (!address) continue;

        const placeId = `osm:${el.type}/${el.id}`;
        if (seen.has(placeId)) continue;
        seen.add(placeId);

        const created = await createPortalLeadCompat({
          ownerId,
          kind: "B2C",
          source: "GOOGLE_PLACES",
          businessName: (source === "OSM_POI_PHONE" ? (name || line1) : line1) || "Consumer lead",
          phone,
          website: null,
          address,
          niche: location.slice(0, 200) || null,
          placeId,
          dataJson: {
            osm: {
              placeId,
              element: el,
              tags,
            },
            leadScraping: {
              kind: "B2C",
              source,
              geocode: { query: geocodeQuery, displayName: geo.displayName, bbox: geo.bbox },
            },
          },
        });

        if (created) createdCount++;
      }
    } catch (e: any) {
      error = typeof e?.message === "string" ? e.message : "Unknown error";
    }

    const refundedCredits = Math.max(0, reservedCredits - createdCount);
    if (refundedCredits > 0) {
      await addCredits(ownerId, refundedCredits);
    }

    const nowIso = new Date().toISOString();
    const updatedSettings: Settings = {
      ...settings,
      b2c: {
        ...settings.b2c,
        lastRunAtIso: nowIso,
      },
    };

    await prisma.$transaction([
      prisma.portalLeadScrapeRun.update({
        where: { id: run.id },
        data: { createdCount, refundedCredits, error },
        select: { id: true },
      }),
      prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
        create: { ownerId, serviceSlug: SERVICE_SLUG, status: "IN_PROGRESS", dataJson: updatedSettings },
        update: { dataJson: updatedSettings, status: "IN_PROGRESS" },
        select: { id: true },
      }),
    ]);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error,
          code: "RUN_FAILED",
          requestedCount,
          chargedCredits: reservedCredits,
          refundedCredits,
          createdCount,
          plannedBatches: 1,
          batchesRan: 1,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      requestedCount,
      chargedCredits: reservedCredits,
      refundedCredits,
      createdCount,
      plannedBatches: 1,
      batchesRan: 1,
    });
  }

  if (!hasPlacesKey()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Google Places is not configured.",
        code: "PLACES_NOT_CONFIGURED",
      },
      { status: 409 },
    );
  }

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const settings = normalizeSettings(setup?.dataJson);

  const niche = settings.b2b.niche.trim();
  const location = settings.b2b.location.trim();
  const requestedCount = settings.b2b.count;

  if (!niche || !location) {
    return NextResponse.json(
      {
        ok: false,
        error: "Niche and location are required.",
        code: "MISSING_REQUIRED",
      },
      { status: 400 },
    );
  }

  // Billing: reserve up to requestedCount, then refund unused.
  const reservedCredits = requestedCount;
  const consumed = await consumeCredits(ownerId, reservedCredits);

  if (!consumed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits.",
        code: "INSUFFICIENT_CREDITS",
      },
      { status: 402 },
    );
  }

  const run = await prisma.portalLeadScrapeRun.create({
    data: {
      ownerId,
      kind: "B2B",
      requestedCount,
      chargedCredits: reservedCredits,
      settingsJson: settings,
    },
    select: { id: true },
  });

  let createdCount = 0;
  let error: string | null = null;
  const maxPerPlacesBatch = 60;
  const baseBatches = Math.max(1, Math.ceil(requestedCount / maxPerPlacesBatch));
  const plannedPrimaryBatches = Math.min(10, baseBatches + (requestedCount >= 50 ? 1 : 0));
  const fallbackLocations = settings.b2b.fallbackEnabled
    ? settings.b2b.fallbackLocations.map((s) => s.trim()).filter(Boolean).slice(0, 5)
    : [];
  const fallbackNiches = settings.b2b.fallbackEnabled
    ? settings.b2b.fallbackNiches.map((s) => s.trim()).filter(Boolean).slice(0, 5)
    : [];
  const plannedBatches = Math.min(
    25,
    plannedPrimaryBatches +
      (fallbackLocations.length ? fallbackLocations.length * 2 : 0) +
      (fallbackNiches.length ? fallbackNiches.length * 2 : 0),
  );
  let batchesRan = 0;
  const usedFallbackLocations: string[] = [];
  const usedFallbackNiches: string[] = [];
  const createdLeads: Array<{
    id: string;
    businessName: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    niche: string | null;
  }> = [];

  try {
    const buildQueryVariants = ({ nicheTerm, loc }: { nicheTerm: string; loc: string }) =>
      Array.from(
        new Set(
          [
            `${nicheTerm} in ${loc}`,
            `${nicheTerm} near ${loc}`,
            `${nicheTerm} services in ${loc}`,
            `${nicheTerm} company in ${loc}`,
          ]
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );

    const excludedPhones = new Set(
      settings.b2b.excludePhones
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p)),
    );

    const seenPlaceIds = new Set<string>();

    const locationsToTry = [location, ...fallbackLocations];
    const nichesToTry = [niche, ...fallbackNiches];

    const combos: Array<{ nicheTerm: string; loc: string; isFallbackLocation: boolean; isFallbackNiche: boolean }> = [];
    for (let nicheIndex = 0; nicheIndex < nichesToTry.length; nicheIndex++) {
      for (let locIndex = 0; locIndex < locationsToTry.length; locIndex++) {
        combos.push({
          nicheTerm: nichesToTry[nicheIndex] || niche,
          loc: locationsToTry[locIndex] || location,
          isFallbackLocation: locIndex > 0,
          isFallbackNiche: nicheIndex > 0,
        });
      }
    }

    for (let comboIndex = 0; comboIndex < combos.length; comboIndex++) {
      if (createdCount >= requestedCount) break;

      const combo = combos[comboIndex];
      const queryVariants = buildQueryVariants({ nicheTerm: combo.nicheTerm, loc: combo.loc });

      const isPrimaryCombo = comboIndex === 0;
      const attemptsForThisCombo = isPrimaryCombo
        ? plannedPrimaryBatches
        : Math.min(5, Math.max(1, Math.ceil((requestedCount - createdCount) / maxPerPlacesBatch) + 1));

      for (let attempt = 0; attempt < attemptsForThisCombo; attempt++) {
        if (createdCount >= requestedCount) break;
        if (batchesRan >= plannedBatches) break;
        batchesRan++;

        const remaining = requestedCount - createdCount;
        const targetThisBatch = Math.min(maxPerPlacesBatch, Math.max(1, remaining));
        const query =
          queryVariants[attempt % queryVariants.length] || `${combo.nicheTerm} in ${combo.loc}`;
        const results = await placesTextSearch(query, Math.max(1, targetThisBatch * 4));

        let createdThisAttempt = 0;

        for (const place of results) {
          if (createdCount >= requestedCount) break;

          const businessName = place.name?.trim() || "";
          if (!businessName) continue;

          if (matchesNameExclusion(businessName, settings.b2b.excludeNameContains)) continue;

          const placeId = place.place_id;
          if (seenPlaceIds.has(placeId)) continue;
          seenPlaceIds.add(placeId);
          const details = await placeDetails(placeId);

          const phoneCandidate = details.international_phone_number || details.formatted_phone_number || null;
          const phoneNorm = normalizePhone(phoneCandidate);
          if (phoneNorm && excludedPhones.has(phoneNorm)) continue;

          const website = details.website || null;
          const domain = website ? extractDomain(website) : null;
          if (domain && settings.b2b.excludeDomains.includes(domain)) continue;

          if (settings.b2b.requirePhone && !phoneNorm) continue;
          if (settings.b2b.requireWebsite && !website) continue;

          const created = await createPortalLeadCompat({
            ownerId,
            kind: "B2B",
            source: "GOOGLE_PLACES",
            businessName,
            phone: phoneNorm,
            website,
            address: details.formatted_address || place.formatted_address || null,
            niche: combo.nicheTerm,
            placeId,
            dataJson: {
              googlePlaces: {
                placeId,
                details,
              },
              leadScraping: {
                location: combo.loc,
                niche: combo.nicheTerm,
                isFallbackLocation: combo.isFallbackLocation,
                isFallbackNiche: combo.isFallbackNiche,
              },
            },
          });

          if (created) {
            createdLeads.push({
              ...created,
              email: null,
            });
            createdCount++;
            createdThisAttempt++;
          }
        }

        if (combo.isFallbackLocation && createdThisAttempt > 0 && !usedFallbackLocations.includes(combo.loc)) {
          usedFallbackLocations.push(combo.loc);
        }
        if (combo.isFallbackNiche && createdThisAttempt > 0 && !usedFallbackNiches.includes(combo.nicheTerm)) {
          usedFallbackNiches.push(combo.nicheTerm);
        }

        // Best-effort progress update so the UI can poll run history if needed.
        await prisma.portalLeadScrapeRun.update({
          where: { id: run.id },
          data: { createdCount },
          select: { id: true },
        });
      }
    }
  } catch (e: any) {
    error = typeof e?.message === "string" ? e.message : "Unknown error";
  }

  const refundedCredits = Math.max(0, reservedCredits - createdCount);
  if (refundedCredits > 0) {
    await addCredits(ownerId, refundedCredits);
  }

  const nowIso = new Date().toISOString();
  const updatedSettings: Settings = {
    ...settings,
    b2b: {
      ...settings.b2b,
      lastRunAtIso: nowIso,
    },
  };

  // Optional outbound: auto-send immediately after new leads are created.
  const shouldSendEmail =
    outboundUnlocked &&
    updatedSettings.outbound.enabled &&
    updatedSettings.outbound.email.enabled &&
    updatedSettings.outbound.email.trigger === "ON_SCRAPE";
  const shouldSendSms =
    outboundUnlocked &&
    updatedSettings.outbound.enabled &&
    updatedSettings.outbound.sms.enabled &&
    updatedSettings.outbound.sms.trigger === "ON_SCRAPE";

  if ((shouldSendEmail || shouldSendSms) && createdLeads.length) {
    const base = baseUrlFromEnv();
    const nextSent = { ...updatedSettings.outboundState.sentAtByLeadId };

    for (const lead of createdLeads) {
      try {
        const resources = updatedSettings.outbound.resources
          .map((r) => ({
            label: r.label,
            url: r.url.startsWith("/") ? `${base}${r.url}` : r.url,
          }))
          .filter((r) => Boolean(r.url));

        if (shouldSendEmail && lead.email) {
          const subject = renderTemplate(updatedSettings.outbound.email.subject, lead).slice(0, 120);
          const textBase = renderTemplate(updatedSettings.outbound.email.text, lead);
          const textResources = resources.length
            ? `\n\nResources:\n${resources.map((r) => `- ${r.label}: ${r.url}`).join("\n")}`
            : "";
          const text = (textBase + textResources).slice(0, 20000);

          await sendEmail({
            to: lead.email,
            cc: auth.session.user.email,
            subject: subject || `Follow-up: ${lead.businessName}`,
            text,
            fromName,
          });
        }

        if (shouldSendSms && lead.phone) {
          const smsBody = renderTemplate(updatedSettings.outbound.sms.text, lead).slice(0, 900);
          if (smsBody.trim()) {
            await sendSms({ ownerId, to: lead.phone, body: smsBody });
          }
        }

        nextSent[lead.id] = nowIso;
      } catch {
        // Non-fatal: scraping should still succeed even if outbound fails.
      }
    }

    updatedSettings.outboundState = {
      ...updatedSettings.outboundState,
      sentAtByLeadId: nextSent,
    };
  }

  await prisma.$transaction([
    prisma.portalLeadScrapeRun.update({
      where: { id: run.id },
      data: {
        createdCount,
        refundedCredits,
        error,
      },
      select: { id: true },
    }),
    prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "IN_PROGRESS", dataJson: updatedSettings },
      update: { dataJson: updatedSettings, status: "IN_PROGRESS" },
      select: { id: true },
    }),
  ]);

  // Refunds are not implemented (we didn't build a credit refund primitive).
  // We still surface charged vs created in run history so billing can be audited.

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error,
        code: "RUN_FAILED",
        requestedCount,
        chargedCredits: reservedCredits,
        refundedCredits,
        createdCount,
        plannedBatches,
        batchesRan,
        usedFallbackLocations,
        usedFallbackNiches,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    requestedCount,
    chargedCredits: reservedCredits,
    refundedCredits,
    createdCount,
    plannedBatches,
    batchesRan,
    usedFallbackLocations,
    usedFallbackNiches,
  });
}
