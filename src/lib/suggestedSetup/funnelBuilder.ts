import { slugify } from "@/lib/slugify";

import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

function normalizeSlug(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .slice(0, 60);
  return cleaned.length >= 2 ? cleaned : "starter-funnel";
}

export function proposeFunnelBuilderCreateStarterFunnel(opts: {
  businessName: string;
  hasAnyFunnels: boolean;
}): SuggestedSetupAction | null {
  if (opts.hasAnyFunnels) return null;

  const businessName = String(opts.businessName || "").trim();
  const name = businessName ? `Lead funnel for ${businessName}`.slice(0, 120) : "Starter lead funnel";

  const slug = normalizeSlug(slugify(name) || "starter-funnel");

  const payload = {
    slug,
    name,
    page: {
      slug: "home",
      title: "Home",
      contentMarkdown: businessName
        ? `# Welcome to ${businessName}\n\nTell us what you are looking for and we will follow up shortly.`
        : "# Welcome\n\nTell us what you are looking for and we will follow up shortly.",
    },
  };

  return {
    id: actionIdFromParts({
      kind: "funnelBuilder.createStarterFunnel",
      serviceSlug: "funnel-builder",
      signature: payload,
    }),
    serviceSlug: "funnel-builder",
    kind: "funnelBuilder.createStarterFunnel",
    title: "Create a starter funnel",
    description: "Creates a draft funnel with a starter home page (requires credits).",
    payload,
  };
}
