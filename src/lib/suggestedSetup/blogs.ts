import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeBlogsCreateSite(opts: {
  businessName: string;
  exists: boolean;
}): SuggestedSetupAction | null {
  if (opts.exists) return null;

  const name = (opts.businessName || "Hosted site").trim() || "Hosted site";

  return {
    id: actionIdFromParts({
      kind: "blogs.createSite",
      serviceSlug: "blogs",
      signature: { name },
    }),
    serviceSlug: "blogs",
    kind: "blogs.createSite",
    title: "Create your hosted blog site",
    description: "Creates your blog site record and sets a public handle if needed.",
    payload: { name },
  };
}

export function proposeBlogsAutomationSettings(opts: {
  enabledNow: boolean;
  topicsNow: string[];
}): SuggestedSetupAction | null {
  // Only propose if not configured at all.
  const hasTopics = Array.isArray(opts.topicsNow) && opts.topicsNow.length > 0;
  if (opts.enabledNow && hasTopics) return null;

  const payload = {
    enabled: true,
    frequencyDays: 7,
    autoPublish: false,
    topics: [
      "How to keep up with SEO without weekly scramble",
      "A simple content workflow you can automate",
      "What to automate first in your marketing ops",
      "Follow up systems that prevent leads from slipping",
      "Turning daily operations into helpful content",
      "How consistent publishing builds trust over time",
    ],
  };

  return {
    id: actionIdFromParts({
      kind: "blogs.setAutomationSettings",
      serviceSlug: "blogs",
      signature: payload,
    }),
    serviceSlug: "blogs",
    kind: "blogs.setAutomationSettings",
    title: "Configure blog automation",
    description: "Sets a weekly schedule and a starter topic list (auto-publish off).",
    payload,
  };
}
