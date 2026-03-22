import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeReviewsConfigureSettings(opts: {
  businessName: string;
  enabledNow: boolean;
}): SuggestedSetupAction | null {
  if (opts.enabledNow) return null;

  const businessName = (opts.businessName || "").trim();
  const fromName = businessName || "our team";

  const settings = {
    version: 1,
    enabled: true,
    automation: { autoSend: false, manualSend: true, calendarIds: [] },
    tagAfterSend: { enabled: false, tagId: null },
    sendAfter: { value: 60, unit: "minutes" },
    destinations: [],
    messageTemplate: `Hi {name}, thanks again for choosing ${fromName}. If you have 30 seconds, would you leave us a review? {link}`,
    calendarMessageTemplates: {},
    publicPage: {
      enabled: true,
      galleryEnabled: true,
      fontKey: "brand",
      title: "Reviews",
      description: "We would love to hear about your experience.",
      thankYouMessage: "Thanks. Your review was submitted.",
      form: {
        version: 1,
        email: { enabled: false, required: false },
        phone: { enabled: false, required: false },
        questions: [],
      },
      photoUrls: [],
    },
  };

  return {
    id: actionIdFromParts({
      kind: "reviews.configureSettings",
      serviceSlug: "reviews",
      signature: settings,
    }),
    serviceSlug: "reviews",
    kind: "reviews.configureSettings",
    title: "Turn on Reviews (manual send)",
    description: "Enables your hosted reviews page and a starter message template. Auto sending stays off.",
    payload: { settings },
  };
}
