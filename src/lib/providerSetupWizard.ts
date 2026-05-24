export type ProviderSetupCategory = "communication" | "booking" | "payment" | "social" | "credit";

export type ProviderSetupStatus =
  | "not_started"
  | "needs_setup"
  | "connected"
  | "test_ready"
  | "live_ready"
  | "blocked"
  | "coming_soon";

export type ProviderSetupKey = "email" | "twilio_sms" | "twilio_voice" | "booking" | "payment" | "meta";

export type ProviderSetupItem = {
  key: ProviderSetupKey;
  displayName: string;
  category: ProviderSetupCategory;
  status: ProviderSetupStatus;
  reason: string;
  businessOutcome: string;
  setupHref: string;
  wizardHref: string;
  testActionHref: string | null;
  testActionLabel: string | null;
  liveActionWarning: string | null;
  connectedLabel: string | null;
};

export type ProviderSetupWizardSummary = {
  configuredCount: number;
  actionableCount: number;
  totalCount: number;
  liveReadyCount: number;
  testReadyCount: number;
  blockedCount: number;
};

export type ProviderSetupWizardPayload = {
  workspaceVariant: "portal" | "credit";
  portalBase: "/portal" | "/credit";
  checkedAtIso: string;
  summary: ProviderSetupWizardSummary;
  items: ProviderSetupItem[];
};

export function portalBaseFromWorkspaceVariant(variant?: string | null): "/portal" | "/credit" {
  return variant === "credit" ? "/credit" : "/portal";
}

export function buildProviderSetupWizardHref(portalBase: "/portal" | "/credit", key?: ProviderSetupKey | null) {
  const setup = key ? `?setup=${encodeURIComponent(key)}` : "";
  const hash = key ? `#provider-setup-${encodeURIComponent(key)}` : "#provider-setup-wizard";
  return `${portalBase}/app/settings/integrations${setup}${hash}`;
}