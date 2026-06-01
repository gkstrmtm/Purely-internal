export const META_PROVIDER_STATUSES = [
  "coming_soon",
  "not_connected",
  "connected",
  "needs_permissions",
  "reconnect_required",
  "disabled",
] as const;

export type MetaProviderStatus = (typeof META_PROVIDER_STATUSES)[number];

export type PortalMetaTargetAccount = {
  key: string;
  kind: "facebook_page" | "instagram_professional";
  label: string;
  status: MetaProviderStatus;
  connected: boolean;
  placeholder: boolean;
  destinationType: "facebook_page" | "instagram_business" | null;
  destinationId: string | null;
  pageId: string | null;
  pageLabel: string | null;
  username: string | null;
  reason: string | null;
};

export type PortalMetaCapability = {
  available: boolean;
  liveEnabled: boolean;
  reason: string;
};

export type PortalMetaProviderReadiness = {
  provider: "meta";
  ownerScoped: true;
  status: MetaProviderStatus;
  oauthConfigured: boolean;
  encryptionConfigured: boolean;
  earlyAccessEnabled: boolean;
  isOwnerSession: boolean;
  canStartOAuth: boolean;
  connectHref: string | null;
  disconnectHref: string | null;
  connectedAccountLabel: string | null;
  connectedMetaUserId: string | null;
  connectedMetaUserName: string | null;
  connectedMetaUserEmail: string | null;
  permissionGaps: string[];
  publishingAvailable: boolean;
  metricsAvailable: boolean;
  actionLabel: string;
  actionHref: string | null;
  callbackUrl: string | null;
  setupMessage: string;
  explanation: string;
  targetAccounts: PortalMetaTargetAccount[];
  targetAccountBlockers: string[];
  capabilities: {
    publish: PortalMetaCapability;
    metrics: PortalMetaCapability;
  };
  education: string[];
};