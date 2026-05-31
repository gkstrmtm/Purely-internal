export const META_INTEGRATION_MODES = [
  "page_linked_facebook_login",
  "instagram_login",
] as const;

export type PortalMetaIntegrationMode = (typeof META_INTEGRATION_MODES)[number];

export const LEGACY_META_INTEGRATION_MODE: PortalMetaIntegrationMode = "page_linked_facebook_login";
export const DEFAULT_META_INTEGRATION_MODE: PortalMetaIntegrationMode = "instagram_login";

export function normalizePortalMetaIntegrationMode(
  value: unknown,
  fallback: PortalMetaIntegrationMode = DEFAULT_META_INTEGRATION_MODE,
): PortalMetaIntegrationMode {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized === "page_linked_facebook_login" || normalized === "instagram_login"
    ? normalized
    : fallback;
}