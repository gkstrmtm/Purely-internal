import type { ExternalBookingProviderKey } from "@/lib/externalBookingLink";

export type ExternalBookingCapabilitySupport = "supported" | "possible" | "derived" | "manual" | "unknown";

export type ExternalBookingProviderCapability = {
  providerKey: ExternalBookingProviderKey;
  providerLabel: string;
  supportsRedirectReturn: ExternalBookingCapabilitySupport;
  supportsWebhook: ExternalBookingCapabilitySupport;
  supportsApiPolling: ExternalBookingCapabilitySupport;
  supportsOAuth: ExternalBookingCapabilitySupport;
  supportsBookingCreated: ExternalBookingCapabilitySupport;
  supportsBookingCanceled: ExternalBookingCapabilitySupport;
  supportsBookingRescheduled: ExternalBookingCapabilitySupport;
  setupNotes: string[];
  confidenceLevel: "high" | "medium" | "low";
  implementedPath: "square_manual_webhook" | null;
  recommendedFirstPath: boolean;
  selectionReason?: string;
};

export const FIRST_EXTERNAL_BOOKING_PROVIDER_PATH = {
  providerKey: "square" as const,
  label: "Square Appointments manual webhook",
  reason:
    "Square is the safest first provider path in this repo because its booking webhooks and signature verification are documented clearly, booking lifecycle events are available without building OAuth first, and the current shared booking QA account already uses a Square Appointments handoff.",
};

const CAPABILITY_MAP: Record<ExternalBookingProviderKey, ExternalBookingProviderCapability> = {
  unknown: {
    providerKey: "unknown",
    providerLabel: "External booking page",
    supportsRedirectReturn: "unknown",
    supportsWebhook: "unknown",
    supportsApiPolling: "unknown",
    supportsOAuth: "unknown",
    supportsBookingCreated: "unknown",
    supportsBookingCanceled: "unknown",
    supportsBookingRescheduled: "unknown",
    setupNotes: [
      "Purely can only promise handoff or redirect-return tracking until a known provider contract is identified.",
    ],
    confidenceLevel: "low",
    implementedPath: null,
    recommendedFirstPath: false,
  },
  calendly: {
    providerKey: "calendly",
    providerLabel: "Calendly",
    supportsRedirectReturn: "supported",
    supportsWebhook: "supported",
    supportsApiPolling: "supported",
    supportsOAuth: "supported",
    supportsBookingCreated: "supported",
    supportsBookingCanceled: "supported",
    supportsBookingRescheduled: "possible",
    setupNotes: [
      "Calendly commonly supports post-booking redirects on qualifying plans.",
      "Webhook and Scheduling API paths exist, but this repo does not yet ship a Calendly connection flow.",
    ],
    confidenceLevel: "medium",
    implementedPath: null,
    recommendedFirstPath: false,
  },
  square: {
    providerKey: "square",
    providerLabel: "Square Appointments",
    supportsRedirectReturn: "possible",
    supportsWebhook: "supported",
    supportsApiPolling: "supported",
    supportsOAuth: "supported",
    supportsBookingCreated: "supported",
    supportsBookingCanceled: "derived",
    supportsBookingRescheduled: "derived",
    setupNotes: [
      "Square bookings emit booking.created and booking.updated webhooks.",
      "Cancellation and reschedule states can be derived from verified booking.updated payloads and the last stored booking snapshot.",
      "Signature validation is well documented and can run without inventing a fake booking outcome.",
    ],
    confidenceLevel: "high",
    implementedPath: "square_manual_webhook",
    recommendedFirstPath: true,
    selectionReason: FIRST_EXTERNAL_BOOKING_PROVIDER_PATH.reason,
  },
  acuity: {
    providerKey: "acuity",
    providerLabel: "Acuity / Squarespace Scheduling",
    supportsRedirectReturn: "supported",
    supportsWebhook: "possible",
    supportsApiPolling: "possible",
    supportsOAuth: "unknown",
    supportsBookingCreated: "possible",
    supportsBookingCanceled: "possible",
    supportsBookingRescheduled: "possible",
    setupNotes: [
      "Acuity commonly supports post-scheduling redirects.",
      "Purely does not yet ship an Acuity-specific verification or sync path in this repo.",
    ],
    confidenceLevel: "medium",
    implementedPath: null,
    recommendedFirstPath: false,
  },
  glossgenius: {
    providerKey: "glossgenius",
    providerLabel: "GlossGenius",
    supportsRedirectReturn: "possible",
    supportsWebhook: "unknown",
    supportsApiPolling: "unknown",
    supportsOAuth: "unknown",
    supportsBookingCreated: "unknown",
    supportsBookingCanceled: "unknown",
    supportsBookingRescheduled: "unknown",
    setupNotes: [
      "Treat GlossGenius as redirect-return only until a documented provider contract is verified.",
    ],
    confidenceLevel: "low",
    implementedPath: null,
    recommendedFirstPath: false,
  },
  booksy: {
    providerKey: "booksy",
    providerLabel: "Booksy",
    supportsRedirectReturn: "possible",
    supportsWebhook: "unknown",
    supportsApiPolling: "unknown",
    supportsOAuth: "unknown",
    supportsBookingCreated: "unknown",
    supportsBookingCanceled: "unknown",
    supportsBookingRescheduled: "unknown",
    setupNotes: [
      "Treat Booksy as redirect-return only until a documented provider contract is verified.",
    ],
    confidenceLevel: "low",
    implementedPath: null,
    recommendedFirstPath: false,
  },
  fresha: {
    providerKey: "fresha",
    providerLabel: "Fresha",
    supportsRedirectReturn: "possible",
    supportsWebhook: "unknown",
    supportsApiPolling: "unknown",
    supportsOAuth: "unknown",
    supportsBookingCreated: "unknown",
    supportsBookingCanceled: "unknown",
    supportsBookingRescheduled: "unknown",
    setupNotes: [
      "Treat Fresha as redirect-return only until a documented provider contract is verified.",
    ],
    confidenceLevel: "low",
    implementedPath: null,
    recommendedFirstPath: false,
  },
  custom_form: {
    providerKey: "custom_form",
    providerLabel: "Custom booking page",
    supportsRedirectReturn: "possible",
    supportsWebhook: "unknown",
    supportsApiPolling: "unknown",
    supportsOAuth: "unknown",
    supportsBookingCreated: "unknown",
    supportsBookingCanceled: "unknown",
    supportsBookingRescheduled: "unknown",
    setupNotes: [
      "Custom booking pages can use tracked handoffs and redirect returns, but Purely should not claim provider confirmation without a verified upstream contract.",
    ],
    confidenceLevel: "low",
    implementedPath: null,
    recommendedFirstPath: false,
  },
};

export function getExternalBookingProviderCapability(providerKey: ExternalBookingProviderKey): ExternalBookingProviderCapability {
  return CAPABILITY_MAP[providerKey] ?? CAPABILITY_MAP.unknown;
}

export function listExternalBookingProviderCapabilities(): ExternalBookingProviderCapability[] {
  return Object.values(CAPABILITY_MAP);
}