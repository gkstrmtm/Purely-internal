import { prisma } from "@/lib/db";

const SERVICE_SLUG = "booking-external-link";

export type ExternalBookingGoal =
  | "more_bookings"
  | "more_leads"
  | "fewer_no_shows"
  | "more_reviews"
  | "more_repeat_visits";

export type ExternalBookingHandoffMode = "direct_book" | "lead_first";

export type ExternalBookingProviderKey =
  | "unknown"
  | "calendly"
  | "square"
  | "acuity"
  | "glossgenius"
  | "fresha"
  | "booksy"
  | "custom_form";

export type ExternalBookingLinkConfig = {
  version: 1;
  enabled: boolean;
  sourceUrl: string;
  normalizedUrl: string;
  providerKey: ExternalBookingProviderKey;
  providerLabel: string;
  detectionConfidence: "high" | "low";
  offerName: string;
  goal: ExternalBookingGoal;
  handoffMode: ExternalBookingHandoffMode;
};

const DEFAULT_CONFIG: ExternalBookingLinkConfig = {
  version: 1,
  enabled: false,
  sourceUrl: "",
  normalizedUrl: "",
  providerKey: "unknown",
  providerLabel: "External booking page",
  detectionConfidence: "low",
  offerName: "",
  goal: "more_bookings",
  handoffMode: "direct_book",
};

function normalizeString(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeUrl(raw: string) {
  const value = normalizeString(raw, 1500);
  if (!value) return "";

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  parsed.hash = "";
  return parsed.toString();
}

export function detectExternalBookingProvider(rawUrl: string): Pick<ExternalBookingLinkConfig, "providerKey" | "providerLabel" | "detectionConfidence"> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return {
      providerKey: "unknown",
      providerLabel: "External booking page",
      detectionConfidence: "low",
    };
  }

  const host = new URL(normalized).hostname.toLowerCase();
  if (host.includes("calendly.com")) {
    return { providerKey: "calendly", providerLabel: "Calendly", detectionConfidence: "high" };
  }
  if (host.includes("acuityscheduling.com")) {
    return { providerKey: "acuity", providerLabel: "Acuity Scheduling", detectionConfidence: "high" };
  }
  if (host.includes("squareup.com") || host.includes("square.site") || host.includes("appointments.squareup.com")) {
    return { providerKey: "square", providerLabel: "Square Appointments", detectionConfidence: "high" };
  }
  if (host.includes("glossgenius.com")) {
    return { providerKey: "glossgenius", providerLabel: "GlossGenius", detectionConfidence: "high" };
  }
  if (host.includes("fresha.com")) {
    return { providerKey: "fresha", providerLabel: "Fresha", detectionConfidence: "high" };
  }
  if (host.includes("booksy.com")) {
    return { providerKey: "booksy", providerLabel: "Booksy", detectionConfidence: "high" };
  }

  return {
    providerKey: "custom_form",
    providerLabel: "Custom booking page",
    detectionConfidence: "low",
  };
}

export function parseExternalBookingLinkConfig(value: unknown): ExternalBookingLinkConfig {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const sourceUrl = normalizeString(rec?.sourceUrl, 1500);
  const normalizedUrl = normalizeUrl(normalizeString(rec?.normalizedUrl, 1500) || sourceUrl);
  const detected = detectExternalBookingProvider(normalizedUrl || sourceUrl);
  const providerKey = normalizeString(rec?.providerKey, 50) as ExternalBookingProviderKey;
  const providerLabel = normalizeString(rec?.providerLabel, 80);
  const goal = normalizeString(rec?.goal, 40) as ExternalBookingGoal;
  const handoffMode = normalizeString(rec?.handoffMode, 40) as ExternalBookingHandoffMode;
  const enabled = Boolean(rec?.enabled) && Boolean(normalizedUrl);
  const isUnknownProviderKey = providerKey === "unknown";
  const hasKnownProviderKey =
    providerKey === "calendly" ||
    providerKey === "square" ||
    providerKey === "acuity" ||
    providerKey === "glossgenius" ||
    providerKey === "fresha" ||
    providerKey === "booksy" ||
    providerKey === "custom_form";
  const shouldUseDetectedProvider = detected.providerKey !== "unknown" && (isUnknownProviderKey || !hasKnownProviderKey);
  const resolvedProviderKey = shouldUseDetectedProvider
    ? detected.providerKey
    : hasKnownProviderKey || isUnknownProviderKey
      ? providerKey
      : detected.providerKey;
  const resolvedProviderLabel =
    shouldUseDetectedProvider || !providerLabel || providerLabel === DEFAULT_CONFIG.providerLabel
      ? detected.providerLabel
      : providerLabel;

  return {
    version: 1,
    enabled,
    sourceUrl,
    normalizedUrl,
    providerKey: resolvedProviderKey,
    providerLabel: resolvedProviderLabel,
    detectionConfidence:
      normalizeString(rec?.detectionConfidence, 10) === "high" && detected.detectionConfidence === "high" ? "high" : detected.detectionConfidence,
    offerName: normalizeString(rec?.offerName, 120),
    goal:
      goal === "more_bookings" ||
      goal === "more_leads" ||
      goal === "fewer_no_shows" ||
      goal === "more_reviews" ||
      goal === "more_repeat_visits"
        ? goal
        : DEFAULT_CONFIG.goal,
    handoffMode: handoffMode === "lead_first" ? "lead_first" : "direct_book",
  };
}

export async function getExternalBookingLinkConfig(ownerId: string): Promise<ExternalBookingLinkConfig> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseExternalBookingLinkConfig(row?.dataJson);
}

export async function setExternalBookingLinkConfig(ownerId: string, config: ExternalBookingLinkConfig): Promise<ExternalBookingLinkConfig> {
  const normalized = parseExternalBookingLinkConfig(config);

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: normalized },
    update: { status: "COMPLETE", dataJson: normalized },
    select: { dataJson: true },
  });

  return parseExternalBookingLinkConfig(row.dataJson);
}