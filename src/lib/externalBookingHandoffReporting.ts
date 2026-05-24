import {
  getExternalBookingLinkConfig,
  type ExternalBookingHandoffMode,
  type ExternalBookingProviderKey,
} from "@/lib/externalBookingLink";
import { getExternalBookingProviderConnectionReadiness } from "@/lib/externalBookingProviderConnection.server";
import { ensurePortalBookingExternalConfirmationEventsSchema } from "@/lib/portalBookingExternalConfirmationEventsSchema";
import { ensurePortalBookingExternalLinkEventsSchema } from "@/lib/portalBookingExternalLinkEventsSchema";
import { prisma } from "@/lib/db";

export type ExternalBookingHandoffGuidanceState =
  | "disabled"
  | "provider_not_connected"
  | "no_handoffs"
  | "handoffs_only"
  | "captured_leads"
  | "redirect_confirmed"
  | "provider_confirmed";

export type ExternalBookingHandoffGuidance = {
  state: ExternalBookingHandoffGuidanceState;
  title: string;
  detail: string;
};

export type ExternalBookingHandoffProviderBreakdown = {
  providerKey: string;
  providerLabel: string;
  handoffs: number;
};

export type ExternalBookingHandoffSummary = {
  enabled: boolean;
  handoffMode: ExternalBookingHandoffMode;
  providerKey: ExternalBookingProviderKey;
  providerLabel: string;
  destinationHost: string;
  confirmationState: "handoff_only" | "redirect_confirmed" | "provider_confirmed";
  providerConfirmationAvailable: boolean;
  providerConfirmationConnected: boolean;
  totalHandoffs: number;
  directHandoffs: number;
  leadFirstCaptures: number;
  distinctCapturedContacts: number;
  confirmedViaRedirect: number;
  distinctConfirmedContacts: number;
  providerConfirmedBookings: number;
  distinctProviderConfirmedContacts: number;
  providerCanceledBookings: number;
  providerRescheduledBookings: number;
  latestHandoffAt: string | null;
  latestConfirmedAt: string | null;
  latestProviderConfirmedAt: string | null;
  latestActivityAt: string | null;
  providerBreakdown: ExternalBookingHandoffProviderBreakdown[];
  guidance: ExternalBookingHandoffGuidance;
};

function readDestinationHost(raw: string): string {
  if (!raw) return "";
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return "";
  }
}

function defaultGuidance(providerLabel: string): ExternalBookingHandoffGuidance {
  return {
    state: "disabled",
    title: "External booking handoff is off",
    detail: `Turn the external booking link on and share the tracked ${providerLabel || "booking"} handoff if you want Purely to record sends to the booking page.`,
  };
}

export async function getExternalBookingHandoffSummaryForOwner(
  ownerId: string,
  options?: { startAt?: Date },
): Promise<ExternalBookingHandoffSummary> {
  const startAt = options?.startAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const config = await getExternalBookingLinkConfig(ownerId);
  const destinationHost = readDestinationHost(config.normalizedUrl || config.sourceUrl || "");

  const fallback = {
    enabled: config.enabled,
    handoffMode: config.handoffMode,
    providerKey: config.providerKey,
    providerLabel: config.providerLabel,
    destinationHost,
    confirmationState: "handoff_only" as const,
    providerConfirmationAvailable: false,
    providerConfirmationConnected: false,
    totalHandoffs: 0,
    directHandoffs: 0,
    leadFirstCaptures: 0,
    distinctCapturedContacts: 0,
    confirmedViaRedirect: 0,
    distinctConfirmedContacts: 0,
    providerConfirmedBookings: 0,
    distinctProviderConfirmedContacts: 0,
    providerCanceledBookings: 0,
    providerRescheduledBookings: 0,
    latestHandoffAt: null,
    latestConfirmedAt: null,
    latestProviderConfirmedAt: null,
    latestActivityAt: null,
    providerBreakdown: [],
    guidance: defaultGuidance(config.providerLabel),
  };

  await ensurePortalBookingExternalLinkEventsSchema().catch(() => null);
  await ensurePortalBookingExternalConfirmationEventsSchema().catch(() => null);

  const [aggregateRow, confirmationRow, providerRows, providerReadiness] = await Promise.all([
    prisma.$queryRawUnsafe<
      Array<{
        totalHandoffs: number;
        directHandoffs: number;
        leadFirstCaptures: number;
        distinctCapturedContacts: number;
        latestHandoffAt: Date | null;
      }>
    >(
      `
SELECT
  COUNT(*)::int AS "totalHandoffs",
  COUNT(*) FILTER (WHERE "handoffMode" = 'direct_book')::int AS "directHandoffs",
  COUNT(*) FILTER (WHERE "contactId" IS NOT NULL)::int AS "leadFirstCaptures",
  COUNT(DISTINCT "contactId") FILTER (WHERE "contactId" IS NOT NULL)::int AS "distinctCapturedContacts",
  MAX("clickedAt") AS "latestHandoffAt"
FROM "PortalBookingExternalLinkEvent"
WHERE "ownerId" = $1 AND "clickedAt" >= $2;
      `,
      ownerId,
      startAt,
    ),
    prisma.$queryRawUnsafe<
      Array<{
        confirmedViaRedirect: number;
        distinctConfirmedContacts: number;
        latestConfirmedAt: Date | null;
        providerConfirmedBookings: number;
        distinctProviderConfirmedContacts: number;
        providerCanceledBookings: number;
        providerRescheduledBookings: number;
        latestProviderConfirmedAt: Date | null;
      }>
    >(
      `
SELECT
  COUNT(*) FILTER (WHERE "confirmationKind" = 'redirect_return')::int AS "confirmedViaRedirect",
  COUNT(DISTINCT "contactId") FILTER (WHERE "contactId" IS NOT NULL AND "confirmationKind" = 'redirect_return')::int AS "distinctConfirmedContacts",
  MAX("confirmedAt") FILTER (WHERE "confirmationKind" = 'redirect_return') AS "latestConfirmedAt",
  COUNT(*) FILTER (WHERE "confirmationKind" <> 'redirect_return' AND "bookingStatus" = 'confirmed')::int AS "providerConfirmedBookings",
  COUNT(DISTINCT "contactId") FILTER (WHERE "contactId" IS NOT NULL AND "confirmationKind" <> 'redirect_return' AND "bookingStatus" = 'confirmed')::int AS "distinctProviderConfirmedContacts",
  COUNT(*) FILTER (WHERE "confirmationKind" <> 'redirect_return' AND "bookingStatus" = 'canceled')::int AS "providerCanceledBookings",
  COUNT(*) FILTER (WHERE "confirmationKind" <> 'redirect_return' AND "bookingStatus" = 'rescheduled')::int AS "providerRescheduledBookings",
  MAX("confirmedAt") FILTER (WHERE "confirmationKind" <> 'redirect_return' AND "bookingStatus" = 'confirmed') AS "latestProviderConfirmedAt"
FROM "PortalBookingExternalConfirmationEvent"
WHERE "ownerId" = $1 AND "confirmedAt" >= $2;
      `,
      ownerId,
      startAt,
    ),
    prisma.$queryRawUnsafe<Array<{ providerKey: string; providerLabel: string; handoffs: number }>>(
      `
SELECT
  COALESCE(NULLIF("providerKey", ''), 'unknown') AS "providerKey",
  COALESCE(NULLIF("providerLabel", ''), 'External booking page') AS "providerLabel",
  COUNT(*)::int AS "handoffs"
FROM "PortalBookingExternalLinkEvent"
WHERE "ownerId" = $1 AND "clickedAt" >= $2
GROUP BY 1, 2
ORDER BY "handoffs" DESC, "providerLabel" ASC;
      `,
      ownerId,
      startAt,
    ),
    getExternalBookingProviderConnectionReadiness(ownerId, config.providerKey).catch(() => null),
  ]);

  const row = aggregateRow?.[0] ?? null;
  const totalHandoffs = Number(row?.totalHandoffs ?? 0);
  const directHandoffs = Number(row?.directHandoffs ?? 0);
  const leadFirstCaptures = Number(row?.leadFirstCaptures ?? 0);
  const distinctCapturedContacts = Number(row?.distinctCapturedContacts ?? 0);
  const latestHandoffAt = row?.latestHandoffAt instanceof Date ? row.latestHandoffAt.toISOString() : null;
  const confirmation = confirmationRow?.[0] ?? null;
  const confirmedViaRedirect = Number(confirmation?.confirmedViaRedirect ?? 0);
  const distinctConfirmedContacts = Number(confirmation?.distinctConfirmedContacts ?? 0);
  const latestConfirmedAt = confirmation?.latestConfirmedAt instanceof Date ? confirmation.latestConfirmedAt.toISOString() : null;
  const providerConfirmedBookings = Number(confirmation?.providerConfirmedBookings ?? 0);
  const distinctProviderConfirmedContacts = Number(confirmation?.distinctProviderConfirmedContacts ?? 0);
  const providerCanceledBookings = Number(confirmation?.providerCanceledBookings ?? 0);
  const providerRescheduledBookings = Number(confirmation?.providerRescheduledBookings ?? 0);
  const latestProviderConfirmedAt =
    confirmation?.latestProviderConfirmedAt instanceof Date ? confirmation.latestProviderConfirmedAt.toISOString() : null;
  const latestActivityAt = [latestHandoffAt, latestConfirmedAt, latestProviderConfirmedAt]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const providerBreakdown = (providerRows ?? []).map((item) => ({
    providerKey: String(item.providerKey || "unknown"),
    providerLabel: String(item.providerLabel || "External booking page"),
    handoffs: Number(item.handoffs || 0),
  }));

  const providerLabel = providerBreakdown[0]?.providerLabel || config.providerLabel || "booking page";
  let guidance: ExternalBookingHandoffGuidance;
  if (!config.enabled || !destinationHost) {
    guidance = defaultGuidance(providerLabel);
  } else if (providerReadiness?.implemented && !providerReadiness.connected) {
    guidance = {
      state: "provider_not_connected",
      title: `${providerLabel} confirmation is available but not connected`,
      detail: providerReadiness.blocker || `Connect ${providerLabel} confirmation if you want Purely to count verified booking lifecycle events instead of handoffs alone.`,
    };
  } else if (providerConfirmedBookings > 0) {
    guidance = {
      state: "provider_confirmed",
      title: "Verified provider bookings are reaching Purely",
      detail:
        "Purely is receiving verified provider events for confirmed bookings. Keep those counts separate from redirect returns and raw handoffs when you review follow-up or no-show risk.",
    };
  } else if (totalHandoffs === 0) {
    guidance = {
      state: "no_handoffs",
      title: "No tracked booking handoffs yet",
      detail:
        "Share the tracked booking handoff on a funnel, landing page, or CTA so Purely can count sends to the booking page before any provider confirmation exists.",
    };
  } else if (confirmedViaRedirect > 0) {
    guidance = {
      state: "redirect_confirmed",
      title: "Redirect-return confirmations are coming back into Purely",
      detail:
        "Purely is now recording returns to the hosted confirmation page after the external provider flow. Use that signal for review requests or appointment follow-up, but keep it separate from webhook or API-confirmed booking truth.",
    };
  } else if (leadFirstCaptures === 0) {
    guidance = {
      state: "handoffs_only",
      title: "People are reaching the booking page, but Purely can only confirm handoffs",
      detail:
        "You are sending people to your booking page. Add lead-first capture or paste the hosted confirmation URL into a provider redirect field if you need stronger booking proof.",
    };
  } else {
    guidance = {
      state: "captured_leads",
      title: "Captured leads still need follow-up or provider confirmation",
      detail:
        "Purely captured leads before redirect, but that still does not prove a completed booking. Follow up with captured contacts or connect a provider confirmation path.",
    };
  }

  return {
    ...fallback,
    confirmationState: providerConfirmedBookings > 0 ? "provider_confirmed" : confirmedViaRedirect > 0 ? "redirect_confirmed" : "handoff_only",
    providerConfirmationAvailable: Boolean(providerReadiness?.implemented),
    providerConfirmationConnected: Boolean(providerReadiness?.connected),
    totalHandoffs,
    directHandoffs,
    leadFirstCaptures,
    distinctCapturedContacts,
    confirmedViaRedirect,
    distinctConfirmedContacts,
    providerConfirmedBookings,
    distinctProviderConfirmedContacts,
    providerCanceledBookings,
    providerRescheduledBookings,
    latestHandoffAt,
    latestConfirmedAt,
    latestProviderConfirmedAt,
    latestActivityAt,
    providerBreakdown,
    guidance,
  };
}