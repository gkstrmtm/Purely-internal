import {
  getExternalBookingLinkConfig,
  type ExternalBookingHandoffMode,
  type ExternalBookingProviderKey,
} from "@/lib/externalBookingLink";
import {
  resolveExternalBookingConfirmationState,
  resolveExternalBookingGuidance,
  type ExternalBookingGuidance,
} from "@/lib/externalBookingTruthInvariants";
import { getExternalBookingProviderConnectionReadiness } from "@/lib/externalBookingProviderConnection.server";
import { ensurePortalBookingExternalConfirmationEventsSchema } from "@/lib/portalBookingExternalConfirmationEventsSchema";
import { ensurePortalBookingExternalLinkEventsSchema } from "@/lib/portalBookingExternalLinkEventsSchema";
import { prisma } from "@/lib/db";

export type ExternalBookingHandoffGuidanceState = ExternalBookingGuidance["state"];

export type ExternalBookingHandoffGuidance = ExternalBookingGuidance;

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
    guidance: resolveExternalBookingGuidance({
      enabled: config.enabled,
      destinationHost,
      providerLabel: config.providerLabel,
      providerConfirmationAvailable: false,
      providerConfirmationConnected: false,
      totalHandoffs: 0,
      leadFirstCaptures: 0,
      confirmedViaRedirect: 0,
      providerConfirmedBookings: 0,
    }),
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
    getExternalBookingProviderConnectionReadiness(ownerId, config.providerKey, { config }).catch(() => null),
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
  const guidance = resolveExternalBookingGuidance({
    enabled: config.enabled,
    destinationHost,
    providerLabel,
    providerConfirmationAvailable: Boolean(providerReadiness?.implemented),
    providerConfirmationConnected: Boolean(providerReadiness?.connected),
    providerConnectionBlocker: providerReadiness?.blocker,
    totalHandoffs,
    leadFirstCaptures,
    confirmedViaRedirect,
    providerConfirmedBookings,
  });

  return {
    ...fallback,
    confirmationState: resolveExternalBookingConfirmationState({
      confirmedViaRedirect,
      providerConfirmedBookings,
    }),
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