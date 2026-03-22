import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeNewsletterConfigureAutomation(opts: {
  businessName: string;
  enabledExternalNow: boolean;
  enabledInternalNow: boolean;
}): SuggestedSetupAction | null {
  if (opts.enabledExternalNow || opts.enabledInternalNow) return null;

  const businessName = (opts.businessName || "").trim();

  const external = {
    enabled: true,
    frequencyDays: 7,
    cursor: 0,
    requireApproval: true,
    fontKey: "brand",
    channels: { email: true, sms: false },
    topics: [
      "A quick win you can apply this week",
      "A common mistake and how to avoid it",
      "A behind the scenes look at how we work",
      "Answers to a question we hear often",
      "A simple checklist to save time",
    ],
    promptAnswers: {
      businessName: businessName || "",
    },
    includeImages: false,
    royaltyFreeImages: true,
    includeImagesWhereNeeded: true,
    audience: { tagIds: [], contactIds: [], emails: [], userIds: [], sendAllUsers: true },
  };

  const internal = {
    enabled: false,
    frequencyDays: 7,
    cursor: 0,
    requireApproval: true,
    fontKey: "brand",
    channels: { email: true, sms: false },
    topics: [],
    promptAnswers: {},
    includeImages: false,
    royaltyFreeImages: true,
    includeImagesWhereNeeded: true,
    audience: { tagIds: [], contactIds: [], emails: [], userIds: [], sendAllUsers: false },
  };

  const payload = { external, internal };

  return {
    id: actionIdFromParts({
      kind: "newsletter.configureAutomation",
      serviceSlug: "newsletter",
      signature: payload,
    }),
    serviceSlug: "newsletter",
    kind: "newsletter.configureAutomation",
    title: "Configure Newsletter automation",
    description: "Enables weekly external newsletters with approval required (no auto sending).",
    payload,
  };
}
