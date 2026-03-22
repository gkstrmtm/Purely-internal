import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeLeadOutboundCreateCampaign(opts: {
  businessName: string;
  hasAnyCampaigns: boolean;
}): SuggestedSetupAction | null {
  if (opts.hasAnyCampaigns) return null;

  const businessName = (opts.businessName || "").trim();
  const name = businessName ? `${businessName} Outbound Follow Up` : "Outbound Follow Up";

  const script = businessName
    ? `Hi, this is an automated call from ${businessName}. We are following up to see if you have any questions. If now is not a good time, you can text us and we will respond.`
    : "Hi, this is an automated call. We are following up to see if you have any questions. If now is not a good time, you can text us and we will respond.";

  const payload = {
    name,
    status: "DRAFT",
    messageChannelPolicy: "BOTH",
    script,
  };

  return {
    id: actionIdFromParts({
      kind: "leadOutbound.createCampaign",
      serviceSlug: "ai-outbound-calls",
      signature: payload,
    }),
    serviceSlug: "ai-outbound-calls",
    kind: "leadOutbound.createCampaign",
    title: "Create an AI outbound campaign (draft)",
    description: "Creates a draft campaign with a starter script. It does not enroll anyone or start sending.",
    payload,
  };
}
