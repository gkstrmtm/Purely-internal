export type ExternalBookingConfirmationState = "handoff_only" | "redirect_confirmed" | "provider_confirmed";

export type ExternalBookingGuidanceState =
  | "disabled"
  | "provider_not_connected"
  | "no_handoffs"
  | "handoffs_only"
  | "captured_leads"
  | "redirect_confirmed"
  | "provider_confirmed";

export type ExternalBookingGuidance = {
  state: ExternalBookingGuidanceState;
  title: string;
  detail: string;
};

export type ExternalBookingTruthInput = {
  enabled: boolean;
  destinationHost: string;
  providerLabel: string;
  providerConfirmationAvailable: boolean;
  providerConfirmationConnected: boolean;
  providerConnectionBlocker?: string | null;
  totalHandoffs: number;
  leadFirstCaptures: number;
  confirmedViaRedirect: number;
  providerConfirmedBookings: number;
};

export function resolveExternalBookingConfirmationState(input: {
  confirmedViaRedirect: number;
  providerConfirmedBookings: number;
}): ExternalBookingConfirmationState {
  if (input.providerConfirmedBookings > 0) return "provider_confirmed";
  if (input.confirmedViaRedirect > 0) return "redirect_confirmed";
  return "handoff_only";
}

export function resolveExternalBookingGuidance(input: ExternalBookingTruthInput): ExternalBookingGuidance {
  const providerLabel = input.providerLabel || "booking page";

  if (!input.enabled || !input.destinationHost) {
    return {
      state: "disabled",
      title: "External booking handoff is off",
      detail: `Turn the external booking link on and share the tracked ${providerLabel} handoff if you want Purely to record sends to the booking page.`,
    };
  }

  if (input.providerConfirmationAvailable && !input.providerConfirmationConnected) {
    return {
      state: "provider_not_connected",
      title: `${providerLabel} confirmation is available but not connected`,
      detail:
        input.providerConnectionBlocker ||
        `Connect ${providerLabel} confirmation if you want Purely to count verified booking lifecycle events instead of handoffs alone.`,
    };
  }

  if (input.providerConfirmedBookings > 0) {
    return {
      state: "provider_confirmed",
      title: "Verified provider bookings are reaching Purely",
      detail:
        "Purely is receiving verified provider events for confirmed bookings. Keep those counts separate from redirect returns and raw handoffs when you review follow-up or no-show risk.",
    };
  }

  if (input.totalHandoffs === 0) {
    return {
      state: "no_handoffs",
      title: "No tracked booking handoffs yet",
      detail:
        "Share the tracked booking handoff on a funnel, landing page, or CTA so Purely can count sends to the booking page before any provider confirmation exists.",
    };
  }

  if (input.confirmedViaRedirect > 0) {
    return {
      state: "redirect_confirmed",
      title: "Redirect-return confirmations are coming back into Purely",
      detail:
        "Purely is now recording returns to the hosted confirmation page after the external provider flow. Use that signal for review requests or appointment follow-up, but keep it separate from webhook or API-confirmed booking truth.",
    };
  }

  if (input.leadFirstCaptures === 0) {
    return {
      state: "handoffs_only",
      title: "People are reaching the booking page, but Purely can only confirm handoffs",
      detail:
        "You are sending people to your booking page. Add lead-first capture or paste the hosted confirmation URL into a provider redirect field if you need stronger booking proof.",
    };
  }

  return {
    state: "captured_leads",
    title: "Captured leads still need follow-up or provider confirmation",
    detail:
      "Purely captured leads before redirect, but that still does not prove a completed booking. Follow up with captured contacts or connect a provider confirmation path.",
  };
}