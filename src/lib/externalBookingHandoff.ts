import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { buildExternalBookingHandoffPath } from "@/lib/externalBookingHandoff.shared";
import {
  getExternalBookingLinkConfig,
  type ExternalBookingHandoffMode,
  type ExternalBookingLinkConfig,
  type ExternalBookingProviderKey,
} from "@/lib/externalBookingLink";
import { findOrCreatePortalContact, normalizeEmailKey, normalizePhoneKey } from "@/lib/portalContacts";
import { ensurePortalBookingExternalLinkEventsSchema } from "@/lib/portalBookingExternalLinkEventsSchema";
import { buildPublicIntakeFingerprint, getPublicIntakeIp } from "@/lib/publicIntakeSecurity";

type PublicPortalVariant = "portal" | "credit";

export type PublicExternalBookingHandoff = {
  enabled: boolean;
  handoffMode: ExternalBookingHandoffMode;
  offerName: string;
  providerKey: ExternalBookingProviderKey;
  providerLabel: string;
  detectionConfidence: "high" | "low";
  destinationHost: string;
  handoffPath: string;
  portalVariant: PublicPortalVariant | null;
};

type ResolvedExternalBookingOwner = {
  siteId: string;
  ownerId: string;
  slug: string;
  portalVariant: PublicPortalVariant | null;
  externalLink: ExternalBookingLinkConfig;
};

type HandoffRequestMeta = {
  portalVariant: PublicPortalVariant | null;
  sourceRoute: string | null;
  sourceCampaign: string | null;
  referrerHost: string | null;
  ipHash: string | null;
  userAgent: string | null;
  metaJson: Record<string, string>;
};

type LeadCaptureInput = {
  name: string;
  email: string | null;
  phone: string | null;
};

function normalizeShortString(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizePortalVariant(value: unknown): PublicPortalVariant | null {
  const normalized = normalizeShortString(value, 20).toLowerCase();
  if (normalized === "credit") return "credit";
  if (normalized === "portal") return "portal";
  return null;
}

function getExternalDestination(config: ExternalBookingLinkConfig): string {
  return config.normalizedUrl || config.sourceUrl || "";
}

function getExternalUrlHost(config: ExternalBookingLinkConfig): string {
  const raw = getExternalDestination(config);
  if (!raw) return "";
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return "";
  }
}

function readReferrerHost(req: Request): string | null {
  const raw = req.headers.get("referer");
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function readReferrerPath(req: Request): string | null {
  const raw = req.headers.get("referer");
  if (!raw) return null;
  try {
    return new URL(raw).pathname.slice(0, 240) || null;
  } catch {
    return null;
  }
}

function readQueryOrBodyValue(url: URL, body: Record<string, unknown> | null, key: string, max = 160): string | null {
  const fromBody = normalizeShortString(body?.[key], max);
  if (fromBody) return fromBody;
  const fromQuery = normalizeShortString(url.searchParams.get(key), max);
  return fromQuery || null;
}

function buildHandoffMeta(req: Request, body: Record<string, unknown> | null, ownerVariant: PublicPortalVariant | null): HandoffRequestMeta {
  const url = new URL(req.url);
  const portalVariant = normalizePortalVariant(readQueryOrBodyValue(url, body, "variant", 20)) ?? ownerVariant;
  const sourceRoute = readQueryOrBodyValue(url, body, "source", 240) ?? readReferrerPath(req);
  const sourceCampaign =
    readQueryOrBodyValue(url, body, "campaign", 160) ??
    readQueryOrBodyValue(url, body, "utmCampaign", 160) ??
    (normalizeShortString(url.searchParams.get("utm_campaign"), 160) || null);
  const referrerHost = readReferrerHost(req);
  const ip = getPublicIntakeIp(req);
  const userAgent = normalizeShortString(req.headers.get("user-agent"), 320) || null;
  const ipHash = ip ? buildPublicIntakeFingerprint({ kind: "booking_external_handoff", ip }).slice(0, 32) : null;

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
    const value = readQueryOrBodyValue(url, body, sourceKey, 160) ?? normalizeShortString(url.searchParams.get(sourceKey.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)), 160);
    if (value) metaJson[targetKey] = value;
  }
  if (portalVariant) metaJson.portalVariant = portalVariant;

  return { portalVariant, sourceRoute, sourceCampaign, referrerHost, ipHash, userAgent, metaJson };
}

export function buildPublicExternalBookingHandoff(
  slug: string,
  config: ExternalBookingLinkConfig,
  portalVariant: PublicPortalVariant | null,
): PublicExternalBookingHandoff | null {
  const destination = getExternalDestination(config);
  const destinationHost = getExternalUrlHost(config);
  if (!config.enabled || !destination || !destinationHost) return null;
  return {
    enabled: true,
    handoffMode: config.handoffMode,
    offerName: config.offerName,
    providerKey: config.providerKey,
    providerLabel: config.providerLabel,
    detectionConfidence: config.detectionConfidence,
    destinationHost,
    handoffPath: buildExternalBookingHandoffPath(slug),
    portalVariant,
  };
}

export async function resolveExternalBookingOwnerBySlug(slugRaw: string): Promise<ResolvedExternalBookingOwner | null> {
  const slug = normalizeShortString(slugRaw, 160);
  if (!slug) return null;

  const site = await prisma.portalBookingSite.findUnique({
    where: { slug },
    select: {
      id: true,
      ownerId: true,
      slug: true,
      owner: { select: { clientPortalVariant: true } },
    },
  });

  if (!site) return null;

  const externalLink = await getExternalBookingLinkConfig(String(site.ownerId));
  return {
    siteId: String(site.id),
    ownerId: String(site.ownerId),
    slug: String(site.slug),
    portalVariant: site.owner?.clientPortalVariant === "CREDIT" ? "credit" : site.owner?.clientPortalVariant === "PORTAL" ? "portal" : null,
    externalLink,
  };
}

async function createExternalBookingHandoffEvent(input: {
  resolved: ResolvedExternalBookingOwner;
  contactId?: string | null;
  meta: HandoffRequestMeta;
}) {
  await ensurePortalBookingExternalLinkEventsSchema().catch(() => null);
  const destinationHost = getExternalUrlHost(input.resolved.externalLink);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; clickedAt: Date }>>(
    `
INSERT INTO "PortalBookingExternalLinkEvent" (
  "id",
  "ownerId",
  "siteId",
  "contactId",
  "portalVariant",
  "handoffMode",
  "providerKey",
  "providerLabel",
  "externalUrlHost",
  "sourceRoute",
  "sourceCampaign",
  "referrerHost",
  "ipHash",
  "userAgent",
  "metaJson"
) VALUES (
  $1, $2, $3, $4, $5::"ClientPortalVariant", $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb
)
RETURNING "id", "clickedAt";
    `,
    crypto.randomUUID(),
    input.resolved.ownerId,
    input.resolved.siteId,
    input.contactId || null,
    input.meta.portalVariant === "credit" ? "CREDIT" : input.meta.portalVariant === "portal" ? "PORTAL" : null,
    input.resolved.externalLink.handoffMode,
    input.resolved.externalLink.providerKey,
    input.resolved.externalLink.providerLabel,
    destinationHost,
    input.meta.sourceRoute,
    input.meta.sourceCampaign,
    input.meta.referrerHost,
    input.meta.ipHash,
    input.meta.userAgent,
    JSON.stringify(Object.keys(input.meta.metaJson).length ? input.meta.metaJson : null),
  );

  return rows?.[0] ?? { id: "", clickedAt: new Date() };
}

function jsonFailure(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseLeadCaptureInput(body: Record<string, unknown> | null): LeadCaptureInput {
  const name = normalizeShortString(body?.name, 80);
  const rawEmail = normalizeShortString(body?.email, 120);
  const rawPhone = normalizeShortString(body?.phone, 40);
  const email = normalizeEmailKey(rawEmail);
  const phoneNorm = normalizePhoneKey(rawPhone);

  if (phoneNorm.error) {
    throw new Error(phoneNorm.error);
  }

  return {
    name,
    email,
    phone: phoneNorm.phone,
  };
}

export async function handlePublicExternalBookingHandoff(req: Request, slug: string) {
  const resolved = await resolveExternalBookingOwnerBySlug(slug);
  if (!resolved) return jsonFailure(404, "Booking link not found.");

  const destination = getExternalDestination(resolved.externalLink);
  const destinationHost = getExternalUrlHost(resolved.externalLink);
  if (!resolved.externalLink.enabled || !destination || !destinationHost) {
    return jsonFailure(404, "This external booking handoff is not active.");
  }

  if (req.method === "GET") {
    if (resolved.externalLink.handoffMode !== "direct_book") {
      return jsonFailure(409, "Lead capture is required before redirect.");
    }

    const meta = buildHandoffMeta(req, null, resolved.portalVariant);
    await createExternalBookingHandoffEvent({ resolved, meta, contactId: null });
    return NextResponse.redirect(destination, { status: 307 });
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const meta = buildHandoffMeta(req, body, resolved.portalVariant);

    let contactId: string | null = null;
    if (resolved.externalLink.handoffMode === "lead_first") {
      let lead: LeadCaptureInput;
      try {
        lead = parseLeadCaptureInput(body);
      } catch (error) {
        return jsonFailure(400, error instanceof Error ? error.message : "Enter a valid phone number.");
      }

      if (!lead.name) {
        return jsonFailure(400, "Name is required before redirect.");
      }
      if (!lead.email && !lead.phone) {
        return jsonFailure(400, "Add an email or phone number before redirect.");
      }

      contactId = await findOrCreatePortalContact({
        ownerId: resolved.ownerId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
      });

      if (!contactId) {
        return jsonFailure(500, "Could not capture the lead before redirect.");
      }
    }

    const event = await createExternalBookingHandoffEvent({ resolved, meta, contactId });
    return NextResponse.json({ ok: true, redirectTo: destination, eventId: event.id, contactId });
  }

  return new NextResponse(null, { status: 405, headers: { Allow: "GET, POST" } });
}
