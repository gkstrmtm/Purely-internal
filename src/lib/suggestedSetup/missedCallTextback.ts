import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeMissedCallTextBackConfigureSettings(opts: {
  businessName: string;
  enabledNow: boolean;
  replyBodyNow: string;
}): SuggestedSetupAction | null {
  if (opts.enabledNow) return null;

  const businessName = String(opts.businessName || "").trim();
  const defaultReply = businessName
    ? `Hey! Sorry we missed your call. This is ${businessName}. What can we help with?`
    : "Hey! Sorry we missed your call. What can we help with?";

  const replyBodyNow = String(opts.replyBodyNow || "").trim();
  const looksCustomized = replyBodyNow.length >= 25 && replyBodyNow !== "Hey! Sorry we missed your call. What can we help with?";
  if (looksCustomized) return null;

  const payload = {
    settingsPatch: {
      enabled: false,
      replyDelaySeconds: 30,
      replyBody: defaultReply,
    },
  };

  return {
    id: actionIdFromParts({
      kind: "missedCallTextback.configureSettings",
      serviceSlug: "missed-call-textback",
      signature: payload,
    }),
    serviceSlug: "missed-call-textback",
    kind: "missedCallTextback.configureSettings",
    title: "Set up missed-call text back",
    description: "Configures a professional default reply so missed calls turn into conversations (kept off until you enable it).",
    payload,
  };
}
