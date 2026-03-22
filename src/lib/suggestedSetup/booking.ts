import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeBookingConfigureSite(opts: {
  businessName: string;
  exists: boolean;
  enabledNow: boolean;
}): SuggestedSetupAction | null {
  // If they already turned booking on, assume they have configured it.
  if (opts.exists && opts.enabledNow) return null;

  const businessName = (opts.businessName || "").trim();
  const title = businessName ? `Book with ${businessName}`.slice(0, 80) : "Book a call";

  const payload = {
    enabled: false,
    title,
    description: "Schedule a time in a few clicks.",
    durationMinutes: 30,
    meetingPlatform: "PURELY_CONNECT",
  };

  return {
    id: actionIdFromParts({
      kind: "booking.configureSite",
      serviceSlug: "booking",
      signature: payload,
    }),
    serviceSlug: "booking",
    kind: "booking.configureSite",
    title: "Set up your booking page",
    description: "Creates your booking page if needed and sets a clean starter configuration (keeps it off until you enable it).",
    payload,
  };
}
