import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeAiReceptionistConfigureSettings(opts: {
  businessName: string;
  hasBusinessNameNow: boolean;
}): SuggestedSetupAction | null {
  // If it is already personalized, do not overwrite.
  if (opts.hasBusinessNameNow) return null;

  const businessName = (opts.businessName || "").trim();
  const greeting = businessName ? `Thanks for calling ${businessName}. How can I help?` : "Thanks for calling. How can I help?";

  const systemPrompt = [
    "You are a helpful receptionist.",
    "Answer questions clearly and keep a friendly tone.",
    "If appropriate, capture lead details (name, email, phone).",
    "Offer to help book an appointment.",
    "Be concise.",
  ].join(" ");

  const settingsPatch = {
    version: 1,
    enabled: false,
    mode: "AI",
    businessName,
    greeting,
    systemPrompt,
    smsEnabled: false,
    smsSystemPrompt: "",
    aiCanTransferToHuman: false,
  };

  return {
    id: actionIdFromParts({
      kind: "aiReceptionist.configureSettings",
      serviceSlug: "ai-receptionist",
      signature: settingsPatch,
    }),
    serviceSlug: "ai-receptionist",
    kind: "aiReceptionist.configureSettings",
    title: "Set up AI receptionist settings",
    description: "Creates a starter receptionist configuration (keeps it off until Twilio is ready).",
    payload: { settingsPatch },
  };
}
