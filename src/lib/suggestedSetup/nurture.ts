import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

type StarterStep = {
  ord: number;
  kind: "SMS" | "EMAIL";
  delayMinutes: number;
  subject?: string;
  body: string;
};

export function proposeNurtureCreateStarterCampaign(opts: {
  businessName: string;
  hasAnyCampaigns: boolean;
}): SuggestedSetupAction | null {
  if (opts.hasAnyCampaigns) return null;

  const businessName = (opts.businessName || "").trim();
  const name = businessName ? `${businessName} Starter Nurture` : "Starter Nurture";

  const steps: StarterStep[] = [
    {
      ord: 0,
      kind: "SMS",
      delayMinutes: 0,
      body: "Hey {contact.name}, thanks for reaching out. Any questions I can help with?",
    },
    {
      ord: 1,
      kind: "SMS",
      delayMinutes: 60 * 24 * 2,
      body: "Quick check in. If you want, I can share a booking link. Reply YES and I will send it.",
    },
    {
      ord: 2,
      kind: "EMAIL",
      delayMinutes: 60 * 24 * 7,
      subject: businessName ? `Checking in with ${businessName}` : "Checking in",
      body: "Hi {contact.name},\n\nJust checking in. If you have any questions, reply here and we will help.\n\nThanks,\n{owner.name}",
    },
  ];

  const payload = { name, steps };

  return {
    id: actionIdFromParts({
      kind: "nurture.createStarterCampaign",
      serviceSlug: "nurture-campaigns",
      signature: payload,
    }),
    serviceSlug: "nurture-campaigns",
    kind: "nurture.createStarterCampaign",
    title: "Create a starter nurture campaign",
    description: "Creates a draft nurture campaign with a simple SMS and email sequence.",
    payload,
  };
}
