import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { resolveExternalBookingOwnerBySlug } from "@/lib/externalBookingHandoff";
import {
  getExternalBookingLinkConfig,
  type ExternalBookingLinkConfig,
  type ExternalBookingProviderKey,
} from "@/lib/externalBookingLink";
import { getExternalBookingProviderCapability } from "@/lib/externalBookingProviderCapabilities";
import { ensurePortalBookingExternalConfirmationEventsSchema } from "@/lib/portalBookingExternalConfirmationEventsSchema";
import { recordPortalContactServiceTrigger } from "@/lib/portalContactServiceTriggers";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import { buildPublicIntakeFingerprint, getPublicIntakeIp } from "@/lib/publicIntakeSecurity";

const CONFIRMATION_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const CONFIRMATION_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

type HeadersLike = {
  get(name: string): string | null;
};

type ConfirmationTokenPayload = {
  v: 1;
  ownerId: string;
  siteId: string;
  slug: string;
  providerKey: ExternalBookingProviderKey;
  externalUrlHost: string;
  exp: number;
};

type ConfirmationRequestMeta = {
  portalVariant: "portal" | "credit" | null;
  sourceRoute: string | null;
  sourceCampaign: string | null;
  referrerHost: string | null;
  ipHash: string | null;
  userAgent: string | null;
  providerReference: string | null;
  metaJson: Record<string, string>;
};

type ValidatedHandoffLink = {
  id: string;
  contactId: string | null;
  portalVariant: "portal" | "credit" | null;
};

export type ExternalBookingConfirmationSetup = {
  enabled: boolean;
  level: "handoff_only" | "redirect_return_ready";
  url: string | null;
  path: string | null;
  expiresAt: string | null;
  detail: string;
  providerCapabilities: {
    redirectReturn: "likely" | "possible" | "unknown";
    webhook: "planned" | "unknown";
    api: "planned" | "unknown";
    note: string;
  };
};

export type ExternalBookingRedirectConfirmationCaptureResult =
  | {
      ok: true;
      deduped: boolean;
      duplicateReason?: string | null;
      providerLabel: string;
      offerName: string;
      contactId: string | null;
      handoffEventId: string | null;
      providerReference: string | null;
      confirmedAt: string;
    }
  | {
      ok: false;
      reason: "invalid" | "expired" | "unavailable";
      providerLabel: string;
      offerName: string;
      detail: string;
    };

function normalizeShortString(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer | null {
  const input = String(value || "").trim();
  if (!input) return null;
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  try {
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getSecret() {
  return process.env.BOOKING_LINK_SECRET || process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_URL || "";
}

function readExternalUrlHost(config: ExternalBookingLinkConfig): string {
  const raw = String(config.normalizedUrl || config.sourceUrl || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return "";
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 40);
}

function normalizePortalVariant(value: unknown): "portal" | "credit" | null {
  const normalized = normalizeShortString(value, 20).toLowerCase();
  if (normalized === "portal") return "portal";
  if (normalized === "credit") return "credit";
  return null;
}

function readReferrerHost(headers: HeadersLike): string | null {
  const raw = headers.get("referer");
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function readReferrerPath(headers: HeadersLike): string | null {
  const raw = headers.get("referer");
  if (!raw) return null;
  try {
    return new URL(raw).pathname.slice(0, 240) || null;
  } catch {
    return null;
  }
}

function readQueryValue(url: URL, keys: string[], max = 160): string | null {
  for (const key of keys) {
    const value = normalizeShortString(url.searchParams.get(key), max);
    if (value) return value;
  }
  return null;
}

function buildConfirmationRequestMeta(url: URL, headers: HeadersLike, ownerVariant: "portal" | "credit" | null): ConfirmationRequestMeta {
  const portalVariant = normalizePortalVariant(readQueryValue(url, ["variant"], 20)) ?? ownerVariant;
  const sourceRoute = readQueryValue(url, ["source"], 240) ?? readReferrerPath(headers);
  const sourceCampaign = readQueryValue(url, ["campaign", "utmCampaign", "utm_campaign"], 160) ?? null;
  const referrerHost = readReferrerHost(headers);
  const ip = getPublicIntakeIp({ headers } as Request);
  const userAgent = normalizeShortString(headers.get("user-agent"), 320) || null;
  const ipHash = ip ? buildPublicIntakeFingerprint({ kind: "booking_external_confirmation", ip }).slice(0, 32) : null;
  const providerReference =
    readQueryValue(url, ["providerRef", "provider_ref", "bookingRef", "booking_ref", "eventRef", "event_ref"], 160) ?? null;

  const metaJson: Record<string, string> = {};
  for (const [sourceKey, targetKey] of [
    ["pageId", "pageId"],
    ["funnelId", "funnelId"],
    ["utmSource", "utmSource"],
    ["utmMedium", "utmMedium"],
    ["utmCampaign", "utmCampaign"],
    ["utmContent", "utmContent"],
    ["utmTerm", "utmTerm"],
  ] as const) {
    const value = readQueryValue(url, [sourceKey, sourceKey.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)], 160) ?? null;
    if (value) metaJson[targetKey] = value;
  }
  if (providerReference) metaJson.providerReference = providerReference;
  if (portalVariant) metaJson.portalVariant = portalVariant;

  return {
    portalVariant,
    sourceRoute,
    sourceCampaign,
    referrerHost,
    ipHash,
    userAgent,
    providerReference,
    metaJson,
  };
}

function buildCapability(providerKey: ExternalBookingProviderKey): ExternalBookingConfirmationSetup["providerCapabilities"] {
  const capability = getExternalBookingProviderCapability(providerKey);
  return {
    redirectReturn: capability.supportsRedirectReturn === "supported" ? "likely" : capability.supportsRedirectReturn === "possible" ? "possible" : "unknown",
    webhook: capability.supportsWebhook === "supported" || capability.supportsWebhook === "manual" ? "planned" : "unknown",
    api: capability.supportsApiPolling === "supported" || capability.supportsApiPolling === "possible" ? "planned" : "unknown",
    note: capability.setupNotes[0] || "Purely can expose a hosted confirmation URL, but the provider must actually redirect back to it before any redirect-return proof exists.",
  };
}

function signToken(payload: ConfirmationTokenPayload): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payloadPart = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = base64UrlEncode(crypto.createHmac("sha256", secret).update(payloadPart).digest());
  return `${payloadPart}.${signature}`;
}

function verifyToken(token: string): { ok: true; payload: ConfirmationTokenPayload } | { ok: false; reason: "invalid" | "expired" | "unavailable" } {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "unavailable" };

  const raw = String(token || "").trim();
  if (!raw) return { ok: false, reason: "invalid" };

  const [payloadPart, signature] = raw.split(".");
  if (!payloadPart || !signature) return { ok: false, reason: "invalid" };

  const expected = base64UrlEncode(crypto.createHmac("sha256", secret).update(payloadPart).digest());
  if (!timingSafeEqual(expected, signature)) return { ok: false, reason: "invalid" };

  const decoded = base64UrlDecode(payloadPart);
  if (!decoded) return { ok: false, reason: "invalid" };

  try {
    const parsed = JSON.parse(decoded.toString("utf8")) as Partial<ConfirmationTokenPayload>;
    if (
      parsed?.v !== 1 ||
      !normalizeShortString(parsed.ownerId, 120) ||
      !normalizeShortString(parsed.siteId, 120) ||
      !normalizeShortString(parsed.slug, 160) ||
      !normalizeShortString(parsed.providerKey, 40) ||
      !normalizeShortString(parsed.externalUrlHost, 240) ||
      !Number.isFinite(Number(parsed.exp))
    ) {
      return { ok: false, reason: "invalid" };
    }
    if (Number(parsed.exp) < Date.now()) return { ok: false, reason: "expired" };
    return {
      ok: true,
      payload: {
        v: 1,
        ownerId: normalizeShortString(parsed.ownerId, 120),
        siteId: normalizeShortString(parsed.siteId, 120),
        slug: normalizeShortString(parsed.slug, 160),
        providerKey: normalizeShortString(parsed.providerKey, 40) as ExternalBookingProviderKey,
        externalUrlHost: normalizeShortString(parsed.externalUrlHost, 240).toLowerCase(),
        exp: Number(parsed.exp),
      },
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function buildExternalBookingConfirmationPath(slug: string): string {
  return `/book/${encodeURIComponent(String(slug || "").trim())}/confirmed`;
}

async function buildConfirmationTokenForSite(input: {
  ownerId: string;
  siteId: string;
  slug: string;
  config: ExternalBookingLinkConfig;
}): Promise<{ token: string | null; expiresAt: string | null }> {
  const externalUrlHost = readExternalUrlHost(input.config);
  if (!externalUrlHost) return { token: null, expiresAt: null };

  const expiresAtMs = Date.now() + CONFIRMATION_TOKEN_TTL_MS;
  const token = signToken({
    v: 1,
    ownerId: input.ownerId,
    siteId: input.siteId,
    slug: input.slug,
    providerKey: input.config.providerKey,
    externalUrlHost,
    exp: expiresAtMs,
  });

  return { token, expiresAt: token ? new Date(expiresAtMs).toISOString() : null };
}

export async function getExternalBookingConfirmationSetupForOwner(
  ownerId: string,
  options?: { config?: ExternalBookingLinkConfig },
): Promise<ExternalBookingConfirmationSetup> {
  const config = options?.config ?? (await getExternalBookingLinkConfig(ownerId));
  const providerCapabilities = buildCapability(config.providerKey);
  if (!config.enabled || !readExternalUrlHost(config)) {
    return {
      enabled: false,
      level: "handoff_only",
      url: null,
      path: null,
      expiresAt: null,
      detail: "Purely is only set up to count handoffs until an active external booking link exists.",
      providerCapabilities,
    };
  }

  const site = await prisma.portalBookingSite.findFirst({
    where: { ownerId },
    select: { id: true, slug: true },
  });
  if (!site?.id || !site.slug) {
    return {
      enabled: false,
      level: "handoff_only",
      url: null,
      path: null,
      expiresAt: null,
      detail: "Purely needs a hosted booking route before it can expose a redirect-return confirmation URL.",
      providerCapabilities,
    };
  }

  const { token, expiresAt } = await buildConfirmationTokenForSite({
    ownerId,
    siteId: String(site.id),
    slug: String(site.slug),
    config,
  });

  if (!token) {
    return {
      enabled: false,
      level: "handoff_only",
      url: null,
      path: null,
      expiresAt: null,
      detail: "Purely could not sign a redirect-return confirmation URL in this environment, so booking visibility stays at handoff-only truth for now.",
      providerCapabilities,
    };
  }

  const path = buildExternalBookingConfirmationPath(String(site.slug));
  const url = new URL(toPurelyHostedUrl(path));
  url.searchParams.set("token", token);

  return {
    enabled: true,
    level: "redirect_return_ready",
    url: url.toString(),
    path,
    expiresAt,
    detail:
      "Paste this URL into the provider's post-booking redirect or thank-you return field if that provider supports it. Purely will record a redirect return here, which is stronger than a click but still not the same as an API or webhook-confirmed booking.",
    providerCapabilities,
  };
}

async function validateLinkedHandoff(ownerId: string, siteId: string, handoffEventId: string): Promise<ValidatedHandoffLink | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; contactId: string | null; portalVariant: string | null }>
  >(
    `
SELECT "id", "contactId", "portalVariant"
FROM "PortalBookingExternalLinkEvent"
WHERE "ownerId" = $1 AND "siteId" = $2 AND "id" = $3
LIMIT 1;
    `,
    ownerId,
    siteId,
    handoffEventId,
  );

  const row = rows?.[0];
  if (!row?.id) return null;
  return {
    id: String(row.id),
    contactId: row.contactId ? String(row.contactId) : null,
    portalVariant: row.portalVariant === "CREDIT" ? "credit" : row.portalVariant === "PORTAL" ? "portal" : null,
  };
}

async function validateContact(ownerId: string, contactId: string): Promise<string | null> {
  const contact = await prisma.portalContact.findFirst({
    where: { ownerId, id: contactId },
    select: { id: true },
  });
  return contact?.id ? String(contact.id) : null;
}

async function findRecentDuplicate(input: {
  ownerId: string;
  siteId: string;
  contactId: string | null;
  handoffEventId: string | null;
  providerReference: string | null;
  confirmationTokenHash: string;
  ipHash: string | null;
  userAgent: string | null;
}): Promise<{ id: string; confirmedAt: Date } | null> {
  if (input.providerReference) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; confirmedAt: Date }>>(
      `
SELECT "id", "confirmedAt"
FROM "PortalBookingExternalConfirmationEvent"
WHERE "ownerId" = $1
  AND "siteId" = $2
  AND "providerReference" = $3
  AND COALESCE("contactId", '') = COALESCE($4, '')
  AND COALESCE("handoffEventId", '') = COALESCE($5, '')
LIMIT 1;
      `,
      input.ownerId,
      input.siteId,
      input.providerReference,
      input.contactId,
      input.handoffEventId,
    );
    return rows?.[0] ?? null;
  }

  if (!input.ipHash && !input.userAgent) return null;
  const since = new Date(Date.now() - CONFIRMATION_DEDUPE_WINDOW_MS);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; confirmedAt: Date }>>(
    `
SELECT "id", "confirmedAt"
FROM "PortalBookingExternalConfirmationEvent"
WHERE "ownerId" = $1
  AND "siteId" = $2
  AND "confirmationTokenHash" = $3
  AND COALESCE("ipHash", '') = COALESCE($4, '')
  AND COALESCE("userAgent", '') = COALESCE($5, '')
  AND COALESCE("contactId", '') = COALESCE($6, '')
  AND COALESCE("handoffEventId", '') = COALESCE($7, '')
  AND "confirmedAt" >= $8
ORDER BY "confirmedAt" DESC
LIMIT 1;
    `,
    input.ownerId,
    input.siteId,
    input.confirmationTokenHash,
    input.ipHash,
    input.userAgent,
    input.contactId,
    input.handoffEventId,
    since,
  );
  return rows?.[0] ?? null;
}

export async function captureExternalBookingRedirectConfirmation(input: {
  slug: string;
  url: URL;
  headers: HeadersLike;
}): Promise<ExternalBookingRedirectConfirmationCaptureResult> {
  const resolved = await resolveExternalBookingOwnerBySlug(input.slug);
  if (!resolved) {
    return {
      ok: false,
      reason: "unavailable",
      providerLabel: "External booking page",
      offerName: "",
      detail: "This booking confirmation route is not active for the requested page.",
    };
  }

  const config = resolved.externalLink;
  const externalUrlHost = readExternalUrlHost(config);
  if (!config.enabled || !externalUrlHost) {
    return {
      ok: false,
      reason: "unavailable",
      providerLabel: config.providerLabel || "External booking page",
      offerName: config.offerName || "",
      detail: "This booking confirmation route is not active for the current external booking setup.",
    };
  }

  const tokenRaw = normalizeShortString(input.url.searchParams.get("token"), 4096);
  const verified = verifyToken(tokenRaw);
  if (!verified.ok) {
    return {
      ok: false,
      reason: verified.reason,
      providerLabel: config.providerLabel || "External booking page",
      offerName: config.offerName || "",
      detail:
        verified.reason === "expired"
          ? "This booking return link expired or no longer matches the current provider setup. Refresh the confirmation URL in booking settings before using it again."
          : verified.reason === "unavailable"
            ? "Purely could not verify this booking return link in the current environment."
            : "This booking return link is invalid or has been changed.",
    };
  }

  if (
    verified.payload.ownerId !== resolved.ownerId ||
    verified.payload.siteId !== resolved.siteId ||
    verified.payload.slug !== resolved.slug ||
    verified.payload.providerKey !== config.providerKey ||
    verified.payload.externalUrlHost !== externalUrlHost
  ) {
    return {
      ok: false,
      reason: "expired",
      providerLabel: config.providerLabel || "External booking page",
      offerName: config.offerName || "",
      detail: "This booking return link no longer matches the active provider setup. Refresh it from booking settings before using it again.",
    };
  }

  await ensurePortalBookingExternalConfirmationEventsSchema().catch(() => null);

  const meta = buildConfirmationRequestMeta(input.url, input.headers, resolved.portalVariant);
  const handoffEventIdRaw = readQueryValue(input.url, ["handoffEventId", "handoff", "eventId"], 120);
  const contactIdRaw = readQueryValue(input.url, ["contactId", "contact"], 120);

  const linkedHandoff = handoffEventIdRaw
    ? await validateLinkedHandoff(resolved.ownerId, resolved.siteId, handoffEventIdRaw).catch(() => null)
    : null;
  const contactId = linkedHandoff?.contactId || (contactIdRaw ? await validateContact(resolved.ownerId, contactIdRaw).catch(() => null) : null);
  const portalVariant = linkedHandoff?.portalVariant ?? meta.portalVariant ?? resolved.portalVariant;
  const confirmationTokenHash = hashToken(tokenRaw);

  const duplicate = await findRecentDuplicate({
    ownerId: resolved.ownerId,
    siteId: resolved.siteId,
    contactId,
    handoffEventId: linkedHandoff?.id ?? null,
    providerReference: meta.providerReference,
    confirmationTokenHash,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  }).catch(() => null);

  if (duplicate?.id) {
    return {
      ok: true,
      deduped: true,
      duplicateReason: meta.providerReference
        ? "Purely already recorded this provider return for the same contact and handoff during the current confirmation window."
        : "Purely already recorded this hosted return for the same contact and handoff during the current confirmation window.",
      providerLabel: config.providerLabel || "External booking page",
      offerName: config.offerName || "",
      contactId,
      handoffEventId: linkedHandoff?.id ?? null,
      providerReference: meta.providerReference,
      confirmedAt: new Date(duplicate.confirmedAt).toISOString(),
    };
  }

  const inserted = await prisma.$queryRawUnsafe<Array<{ id: string; confirmedAt: Date }>>(
    `
INSERT INTO "PortalBookingExternalConfirmationEvent" (
  "id",
  "ownerId",
  "siteId",
  "contactId",
  "handoffEventId",
  "portalVariant",
  "confirmationKind",
  "providerKey",
  "providerLabel",
  "externalUrlHost",
  "providerReference",
  "confirmationTokenHash",
  "sourceRoute",
  "sourceCampaign",
  "referrerHost",
  "ipHash",
  "userAgent",
  "metaJson"
) VALUES (
  $1, $2, $3, $4, $5, $6::"ClientPortalVariant", 'redirect_return', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
)
RETURNING "id", "confirmedAt";
    `,
    crypto.randomUUID(),
    resolved.ownerId,
    resolved.siteId,
    contactId,
    linkedHandoff?.id ?? null,
    portalVariant === "credit" ? "CREDIT" : portalVariant === "portal" ? "PORTAL" : null,
    config.providerKey,
    config.providerLabel,
    externalUrlHost,
    meta.providerReference,
    confirmationTokenHash,
    meta.sourceRoute,
    meta.sourceCampaign,
    meta.referrerHost,
    meta.ipHash,
    meta.userAgent,
    JSON.stringify(Object.keys(meta.metaJson).length ? meta.metaJson : null),
  );

  if (contactId) {
    await recordPortalContactServiceTrigger({
      ownerId: resolved.ownerId,
      contactId,
      serviceSlug: "booking-external-confirmed",
    }).catch(() => null);
  }

  return {
    ok: true,
    deduped: false,
    duplicateReason: null,
    providerLabel: config.providerLabel || "External booking page",
    offerName: config.offerName || "",
    contactId,
    handoffEventId: linkedHandoff?.id ?? null,
    providerReference: meta.providerReference,
    confirmedAt: inserted?.[0]?.confirmedAt ? new Date(inserted[0].confirmedAt).toISOString() : new Date().toISOString(),
  };
}
