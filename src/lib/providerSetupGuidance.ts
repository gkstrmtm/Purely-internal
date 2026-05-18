export type ProviderSetupBlocker = {
  providerKey: "twilio" | "email_delivery" | "voice_agent";
  providerLabel: string;
  statusLabel: "Not connected" | "Needs credentials" | "Needs setup";
  actionState: "Blocked" | "Draft only" | "Test only" | "Live";
  setupLabel: "Integrations" | "Profile";
  setupPath: string;
  summary: string;
};

function oneLine(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentence(value: string) {
  const normalized = oneLine(value).replace(/[.\s]+$/, "");
  return normalized ? `${normalized}.` : "";
}

export function formatProviderBlocker(blocker: ProviderSetupBlocker) {
  return [
    sentence(blocker.summary),
    `Next: open ${blocker.setupLabel} at ${blocker.setupPath}.`,
    `Status: ${blocker.statusLabel}.`,
    `State: ${blocker.actionState}.`,
  ].join(" ");
}

export function formatProviderBlockers(blockers: ProviderSetupBlocker[]) {
  return blockers.map((blocker) => formatProviderBlocker(blocker)).join(" ");
}

export function twilioSetupBlocker(input: {
  setupPath: string;
  actionLabel: string;
  flowLabel: "SMS" | "calls" | "texts and calls";
}): ProviderSetupBlocker {
  return {
    providerKey: "twilio",
    providerLabel: "Twilio",
    statusLabel: "Not connected",
    actionState: "Blocked",
    setupLabel: "Integrations",
    setupPath: input.setupPath,
    summary: `Twilio powers ${input.flowLabel} for this workspace. ${input.actionLabel} cannot run yet because Twilio is not connected. Add your Twilio credentials and number first.`,
  };
}

export function emailDeliverySetupBlocker(input: {
  setupPath: string;
  actionLabel: string;
  reason: string;
}): ProviderSetupBlocker {
  return {
    providerKey: "email_delivery",
    providerLabel: "Email delivery",
    statusLabel: "Needs credentials",
    actionState: "Blocked",
    setupLabel: "Integrations",
    setupPath: input.setupPath,
    summary: `Email delivery powers live outbound email. ${input.actionLabel} cannot run yet because email sending is not configured. ${input.reason}`,
  };
}

export function voiceAgentApiKeyBlocker(input: {
  setupPath: string;
  actionLabel: string;
}): ProviderSetupBlocker {
  return {
    providerKey: "voice_agent",
    providerLabel: "Voice agent provider",
    statusLabel: "Needs credentials",
    actionState: "Blocked",
    setupLabel: "Profile",
    setupPath: input.setupPath,
    summary: `Your voice agent provider powers live AI calls. ${input.actionLabel} cannot run yet because no voice API key is configured.`,
  };
}

export function voiceAgentIdBlocker(input: {
  setupPath: string;
  actionLabel: string;
}): ProviderSetupBlocker {
  return {
    providerKey: "voice_agent",
    providerLabel: "Voice agent",
    statusLabel: "Needs setup",
    actionState: "Blocked",
    setupLabel: "Profile",
    setupPath: input.setupPath,
    summary: `A voice agent ID tells the system which live AI caller to use. ${input.actionLabel} cannot run yet because no agent ID is set on this campaign or in Profile.`,
  };
}