import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

function clampText(value: string, max: number) {
  return value.trim().slice(0, max);
}

export function proposeLeadScrapingConfigureSettings(opts: {
  industry: string | null;
  businessName: string;
  currentSettings: unknown;
  profileLocation: string | null;
}): SuggestedSetupAction | null {
  const rec = opts.currentSettings && typeof opts.currentSettings === "object" ? (opts.currentSettings as any) : null;
  const b2b = rec?.b2b && typeof rec.b2b === "object" ? (rec.b2b as any) : null;
  const hasAnyConfig = Boolean(
    (typeof b2b?.niche === "string" && b2b.niche.trim()) || (typeof b2b?.location === "string" && b2b.location.trim()),
  );
  if (hasAnyConfig) return null;

  const niche = clampText(opts.industry ?? "", 200);
  const location = clampText(opts.profileLocation ?? "", 200);

  const payload = {
    version: 3,
    tagPresets: [
      { label: "New", color: "#2563EB" },
      { label: "Follow-up", color: "#F59E0B" },
      { label: "Outbound sent", color: "#10B981" },
      { label: "Interested", color: "#7C3AED" },
      { label: "Not interested", color: "#64748B" },
    ],
    b2b: {
      niche,
      location,
      count: 25,
      requireEmail: false,
      requirePhone: false,
      requireWebsite: false,
      excludeNameContains: [],
      excludeDomains: [],
      excludePhones: [],
      scheduleEnabled: false,
      frequencyDays: 7,
      lastRunAtIso: null,
    },
    b2c: {
      source: "OSM_ADDRESS" as const,
      notes: "",
      scheduleEnabled: false,
      frequencyDays: 7,
      lastRunAtIso: null,
    },
    outbound: {
      enabled: false,
      aiDraftAndSend: false,
      aiCampaignId: null,
      aiPrompt: "",
      email: {
        enabled: false,
        trigger: "MANUAL" as const,
        subject: "Quick question: {businessName}",
        text: "Hi {businessName},\n\nQuick question: are you taking on new work right now?\n\n-",
      },
      sms: {
        enabled: false,
        trigger: "MANUAL" as const,
        text: "Hi {businessName}, quick question. Are you taking on new work right now?",
      },
      calls: {
        enabled: false,
        trigger: "MANUAL" as const,
      },
      resources: [],
    },
    outboundState: {
      approvedAtByLeadId: {},
      sentAtByLeadId: {},
    },
  };

  return {
    id: actionIdFromParts({ kind: "leadScraping.configureSettings", serviceSlug: "lead-scraping", signature: payload }),
    serviceSlug: "lead-scraping",
    kind: "leadScraping.configureSettings",
    title: "Set Lead Scraping defaults",
    description: "Seeds default niche and location and keeps schedules and outbound disabled.",
    payload,
  };
}
