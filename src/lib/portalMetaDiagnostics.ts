import type { PortalMetaIntegrationMode } from "@/lib/portalMetaModes";

export const META_BASE_SCOPES = ["public_profile", "email"] as const;
export const META_PAGE_LINKED_DISCOVERY_REQUIRED_SCOPES = ["pages_show_list", "instagram_basic"] as const;
export const META_PAGE_LINKED_PUBLISH_REQUIRED_SCOPES = ["instagram_basic", "instagram_content_publish"] as const;
export const META_PAGE_LINKED_REQUESTED_SCOPES = Array.from(new Set([
  ...META_BASE_SCOPES,
  ...META_PAGE_LINKED_DISCOVERY_REQUIRED_SCOPES,
  ...META_PAGE_LINKED_PUBLISH_REQUIRED_SCOPES,
]));
export const META_PAGE_LINKED_REQUIRED_SCOPES = Array.from(new Set([
  ...META_PAGE_LINKED_DISCOVERY_REQUIRED_SCOPES,
  ...META_PAGE_LINKED_PUBLISH_REQUIRED_SCOPES,
]));
export const META_INSTAGRAM_LOGIN_DISCOVERY_REQUIRED_SCOPES = ["instagram_business_basic"] as const;
export const META_INSTAGRAM_LOGIN_PUBLISH_REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;
export const META_INSTAGRAM_LOGIN_REQUESTED_SCOPES = Array.from(new Set([
  ...META_INSTAGRAM_LOGIN_DISCOVERY_REQUIRED_SCOPES,
  ...META_INSTAGRAM_LOGIN_PUBLISH_REQUIRED_SCOPES,
]));
export const META_INSTAGRAM_LOGIN_REQUIRED_SCOPES = Array.from(new Set([
  ...META_INSTAGRAM_LOGIN_DISCOVERY_REQUIRED_SCOPES,
  ...META_INSTAGRAM_LOGIN_PUBLISH_REQUIRED_SCOPES,
]));

export type PortalMetaDiagnosticCode =
  | "instagram_publish_permissions_unavailable"
  | "destination_discovery_unavailable"
  | "app_setup_incomplete";

export type PortalMetaDiagnostic = {
  code: PortalMetaDiagnosticCode;
  message: string;
  detail: string;
  guidance: string[];
  missingScopes: string[];
};

export type PortalMetaFutureMode = {
  available: boolean;
  note: string;
};

type PortalMetaDiagnosticInput = {
  mode: PortalMetaIntegrationMode;
  connected: boolean;
  grantedScopes: string[];
  permissionGaps: string[];
  pageDestinationCount: number;
  instagramDestinationCount: number;
  targetAccountBlockers: string[];
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeString(value)).filter((value): value is string => Boolean(value)))).sort();
}

function hasScope(scopes: Set<string>, scope: string) {
  return scopes.has(scope);
}

export function getMetaDiscoveryRequiredScopesForMode(mode: PortalMetaIntegrationMode): string[] {
  return mode === "instagram_login"
    ? [...META_INSTAGRAM_LOGIN_DISCOVERY_REQUIRED_SCOPES]
    : [...META_PAGE_LINKED_DISCOVERY_REQUIRED_SCOPES];
}

export function getMetaPublishRequiredScopesForMode(mode: PortalMetaIntegrationMode): string[] {
  return mode === "instagram_login"
    ? [...META_INSTAGRAM_LOGIN_PUBLISH_REQUIRED_SCOPES]
    : [...META_PAGE_LINKED_PUBLISH_REQUIRED_SCOPES];
}

export function getMetaRequestedScopesForMode(mode: PortalMetaIntegrationMode): string[] {
  return mode === "instagram_login"
    ? [...META_INSTAGRAM_LOGIN_REQUESTED_SCOPES]
    : [...META_PAGE_LINKED_REQUESTED_SCOPES];
}

export function getMetaRequiredScopesForMode(mode: PortalMetaIntegrationMode): string[] {
  return mode === "instagram_login"
    ? [...META_INSTAGRAM_LOGIN_REQUIRED_SCOPES]
    : [...META_PAGE_LINKED_REQUIRED_SCOPES];
}

export function getPortalMetaFutureInstagramLoginMode(): PortalMetaFutureMode {
  return {
    available: true,
    note: "Instagram Login can now be requested as a separate Purely connection mode. Keep its scope family isolated from the legacy Page-linked Facebook Login flow.",
  };
}

export function derivePortalMetaDiagnostics(input: PortalMetaDiagnosticInput): PortalMetaDiagnostic[] {
  if (!input.connected) return [];

  const mode = input.mode;
  const grantedScopes = normalizeStringArray(input.grantedScopes);
  const permissionGaps = normalizeStringArray(input.permissionGaps);
  const blockers = normalizeStringArray(input.targetAccountBlockers);
  const grantedSet = new Set(grantedScopes);
  const requiredScopes = getMetaRequiredScopesForMode(mode);
  const missingAnyRequiredScope = requiredScopes.some((scope) => !grantedSet.has(scope));

  const diagnostics: PortalMetaDiagnostic[] = [];

  if (mode === "instagram_login" && missingAnyRequiredScope) {
    diagnostics.push({
      code: "instagram_publish_permissions_unavailable",
      message: "Instagram connected, but Instagram Login publishing permissions are not enabled for this app yet.",
      detail: "Enable the Instagram API with Instagram Login product and Business Login settings in Meta Developers.",
      guidance: [
        permissionGaps.length
          ? `Purely still does not have ${permissionGaps.join(", ")}.`
          : "Purely still does not have the Instagram Login publish scope family.",
        "Connect the Instagram professional account you want Purely to publish to.",
        "Do not mix pages_show_list, instagram_basic, or instagram_content_publish into Instagram Login mode.",
      ],
      missingScopes: permissionGaps.length ? permissionGaps : requiredScopes.filter((scope) => !grantedSet.has(scope)),
    });
  }

  const hasPagesShowList = hasScope(grantedSet, "pages_show_list");
  const hasInstagramBasic = hasScope(grantedSet, "instagram_basic");
  const hasInstagramPublish = hasScope(grantedSet, "instagram_content_publish");
  const hasOnlyBaseScopes = grantedScopes.length > 0 && grantedScopes.every((scope) => (META_BASE_SCOPES as readonly string[]).includes(scope));

  if (mode === "page_linked_facebook_login" && (hasOnlyBaseScopes || missingAnyRequiredScope)) {
    diagnostics.push({
      code: "instagram_publish_permissions_unavailable",
      message: "Meta connected, but Instagram publishing is not enabled for this app yet.",
      detail: "Enable the Instagram API with Facebook Login / Page-linked Instagram product in Meta Developers.",
      guidance: [
        "Enable the Instagram API with Facebook Login / Page-linked Instagram product in Meta Developers.",
        permissionGaps.length
          ? `Purely still does not have ${permissionGaps.join(", ")}.`
          : "Purely still does not have the Page-linked Instagram publishing scope family.",
        "Do not add the newer Instagram Login scopes unless the app is migrated to that separate model.",
      ],
      missingScopes: permissionGaps.length ? permissionGaps : META_PAGE_LINKED_REQUIRED_SCOPES.filter((scope) => !grantedSet.has(scope)),
    });
  }

  if (mode === "instagram_login" && (
    blockers.some((blocker) => /permission|review|approved|advanced access|business verification/i.test(blocker))
    || missingAnyRequiredScope
  )) {
    diagnostics.push({
      code: "app_setup_incomplete",
      message: "Instagram connected, but the Instagram Login app setup is still incomplete for publishing.",
      detail: "Finish the Instagram product, Business Login, and Meta access steps required for instagram_business_basic and instagram_business_content_publish.",
      guidance: [
        "Enable the Instagram API with Instagram Login product and Business Login settings in Meta Developers.",
        "Finish the Meta access, app review, advanced access, or business verification steps tied to instagram_business_basic and instagram_business_content_publish.",
        "Keep the Instagram Login scopes isolated from the legacy Page-linked Facebook Login scopes.",
      ],
      missingScopes: permissionGaps,
    });
  }

  if (
    mode === "page_linked_facebook_login" && (
    (hasPagesShowList && (!hasInstagramBasic || !hasInstagramPublish))
    || blockers.some((blocker) => /permission|review|approved|advanced access|business verification/i.test(blocker))
  )) {
    diagnostics.push({
      code: "app_setup_incomplete",
      message: "Meta connected, but app review or product setup is still incomplete for Page-linked Instagram publishing.",
      detail: "Enable the Page-linked Instagram product, then complete the Meta access and review steps required for instagram_basic and instagram_content_publish.",
      guidance: [
        "Enable the Instagram API with Facebook Login / Page-linked Instagram product in Meta Developers.",
        "Finish the Meta access, app review, or business verification steps tied to instagram_basic and instagram_content_publish.",
        "Do not add the newer Instagram Login scopes unless the app is migrated to that separate model.",
      ],
      missingScopes: permissionGaps,
    });
  }

  if (
    !missingAnyRequiredScope
    && (
      mode === "instagram_login"
        ? (input.instagramDestinationCount < 1 || blockers.length > 0)
        : (input.instagramDestinationCount < 1 || input.pageDestinationCount < 1 || blockers.length > 0)
    )
  ) {
    diagnostics.push({
      code: "destination_discovery_unavailable",
      message: mode === "instagram_login"
        ? "Instagram connected, but Purely could not confirm an Instagram professional account destination for this workspace yet."
        : "Meta connected, but Purely could not discover any Page-linked Instagram destinations for this workspace yet.",
      detail: blockers[0] || (mode === "instagram_login"
        ? "Make sure you connected the Instagram professional account you actually want Purely to publish to."
        : "Make sure the connected Meta account manages the right Facebook Page and that the Page is linked to the Instagram professional account you expect to use."),
      guidance: mode === "instagram_login"
        ? [
            "Connect the Instagram professional account you want Purely to publish to.",
            "Make sure the account is Business or Creator.",
            "Reconnect with Instagram Login after Meta exposes the required permissions for this app.",
          ]
        : [
            "Make sure the connected Meta account manages the correct Facebook Page.",
            "Make sure that Page is linked to the Instagram professional account you expect to use.",
            "Do not add the newer Instagram Login scopes unless the app is migrated to that separate model.",
          ],
      missingScopes: [],
    });
  }

  return diagnostics;
}