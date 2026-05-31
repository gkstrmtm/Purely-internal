import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { decryptStringV1, encryptStringV1, isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";
import {
  derivePortalMetaDiagnostics,
  getMetaRequiredScopesForMode,
  getMetaRequestedScopesForMode,
  getPortalMetaFutureInstagramLoginMode,
} from "@/lib/portalMetaDiagnostics";
import {
  DEFAULT_META_INTEGRATION_MODE,
  LEGACY_META_INTEGRATION_MODE,
  normalizePortalMetaIntegrationMode,
  type PortalMetaIntegrationMode,
} from "@/lib/portalMetaModes";
import type { MetaProviderStatus, PortalMetaProviderReadiness, PortalMetaTargetAccount } from "@/lib/portalMetaProviderReadiness";
import { buildProviderSetupWizardHref, portalBaseFromWorkspaceVariant } from "@/lib/providerSetupWizard";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

const META_SERVICE_SLUG = "media-library";
const META_CONNECT_PATH = "/api/portal/integrations/meta/connect";
const META_DISCONNECT_PATH = "/api/portal/integrations/meta/disconnect";
const META_CALLBACK_PATH = "/api/portal/integrations/meta/callback";
const META_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const META_GRAPH_VERSION = "v23.0";
const META_INSTAGRAM_GRAPH_VERSION = "v25.0";

type MetaServiceData = Record<string, unknown>;

type StoredMetaConnectionSecret = {
  accessToken: string;
  tokenType: string | null;
  accessTokenExpiresAtIso: string | null;
  grantedScopes: string[];
};

type StoredMetaTargetAccount = {
  key: string;
  kind: "facebook_page" | "instagram_professional";
  destinationType: "facebook_page" | "instagram_business";
  destinationId: string;
  label: string;
  pageId: string | null;
  pageLabel: string | null;
  username: string | null;
  reason: string | null;
};

type StoredMetaConnectionEnvelope = {
  version: 1;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
};

type StoredMetaConnectionBundle = {
  provider: "meta";
  integrationMode: PortalMetaIntegrationMode;
  status: Extract<MetaProviderStatus, "connected" | "needs_permissions" | "reconnect_required">;
  connectedMetaUserId: string | null;
  connectedMetaUserName: string | null;
  connectedMetaUserEmail: string | null;
  connectedAccountLabel: string | null;
  permissionGaps: string[];
  targetAccounts: StoredMetaTargetAccount[];
  targetAccountBlockers: string[];
  connectedAtIso: string;
  lastCheckedAtIso: string;
  accessTokenExpiresAtIso: string | null;
  encrypted: StoredMetaConnectionEnvelope;
};

export type PortalStoredMetaConnectionSecret = StoredMetaConnectionSecret;
export type PortalStoredMetaConnectionBundle = StoredMetaConnectionBundle;

type MetaOAuthStatePayload = {
  ownerId: string;
  memberId: string;
  portalVariant: string;
  nextPath: string;
  integrationMode: PortalMetaIntegrationMode;
  nonce: string;
  issuedAtMs: number;
};

type MetaUserProfile = {
  id: string | null;
  name: string | null;
  email: string | null;
  username: string | null;
};

type MetaPermissionSnapshot = {
  grantedScopes: string[];
  missingRequiredScopes: string[];
  tokenInvalid: boolean;
  errorMessage: string | null;
};

type MetaTargetAccountSnapshot = {
  accounts: StoredMetaTargetAccount[];
  blockers: string[];
};

export class PortalMetaIntegrationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "meta_integration_error") {
    super(message);
    this.name = "PortalMetaIntegrationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function boolFromEnv(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function dedupeStringArray(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeString(value)).filter((value): value is string => Boolean(value))));
}

function parseMetaServiceData(raw: unknown): MetaServiceData {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? ({ ...(raw as Record<string, unknown>) } as MetaServiceData)
    : {};
}

function parseEncryptedEnvelope(raw: unknown): StoredMetaConnectionEnvelope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.ciphertextB64 !== "string" ||
    typeof value.ivB64 !== "string" ||
    typeof value.authTagB64 !== "string"
  ) {
    return null;
  }

  return {
    version: 1,
    ciphertextB64: value.ciphertextB64,
    ivB64: value.ivB64,
    authTagB64: value.authTagB64,
  };
}

function parseStoredTargetAccount(raw: unknown): StoredMetaTargetAccount | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const key = normalizeString(value.key);
  const kind = normalizeString(value.kind);
  const destinationType = normalizeString(value.destinationType);
  const destinationId = normalizeString(value.destinationId);
  const label = normalizeString(value.label);
  if (
    !key
    || (kind !== "facebook_page" && kind !== "instagram_professional")
    || (destinationType !== "facebook_page" && destinationType !== "instagram_business")
    || !destinationId
    || !label
  ) {
    return null;
  }

  return {
    key,
    kind,
    destinationType,
    destinationId,
    label,
    pageId: normalizeString(value.pageId),
    pageLabel: normalizeString(value.pageLabel),
    username: normalizeString(value.username),
    reason: normalizeString(value.reason),
  };
}

function parseStoredBundle(raw: unknown): StoredMetaConnectionBundle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const status = normalizeString(value.status);
  const integrationMode = normalizePortalMetaIntegrationMode(value.integrationMode, LEGACY_META_INTEGRATION_MODE);
  if (
    value.provider !== "meta" ||
    (status !== "connected" && status !== "needs_permissions" && status !== "reconnect_required")
  ) {
    return null;
  }

  const connectedAtIso = normalizeString(value.connectedAtIso);
  const lastCheckedAtIso = normalizeString(value.lastCheckedAtIso);
  const encrypted = parseEncryptedEnvelope(value.encrypted);
  if (!connectedAtIso || !lastCheckedAtIso || !encrypted) return null;

  return {
    provider: "meta",
    integrationMode,
    status,
    connectedMetaUserId: normalizeString(value.connectedMetaUserId),
    connectedMetaUserName: normalizeString(value.connectedMetaUserName),
    connectedMetaUserEmail: normalizeString(value.connectedMetaUserEmail),
    connectedAccountLabel: normalizeString(value.connectedAccountLabel),
    permissionGaps: normalizeStringArray(value.permissionGaps),
    targetAccounts: Array.isArray(value.targetAccounts)
      ? value.targetAccounts.map((entry) => parseStoredTargetAccount(entry)).filter((entry): entry is StoredMetaTargetAccount => Boolean(entry))
      : [],
    targetAccountBlockers: normalizeStringArray(value.targetAccountBlockers),
    connectedAtIso,
    lastCheckedAtIso,
    accessTokenExpiresAtIso: normalizeString(value.accessTokenExpiresAtIso),
    encrypted,
  };
}

function getStoredBundle(data: MetaServiceData) {
  return parseStoredBundle(data.metaOauthConnection);
}

async function readMediaSetupRow(ownerId: string) {
  return prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: META_SERVICE_SLUG } },
    select: { dataJson: true },
  });
}

async function updateMediaSetupData(ownerId: string, updater: (current: MetaServiceData) => MetaServiceData) {
  const existing = await readMediaSetupRow(ownerId);
  const current = parseMetaServiceData(existing?.dataJson);
  const next = updater(current);

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: META_SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: META_SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: next as Prisma.InputJsonValue,
    },
    update: {
      status: "COMPLETE",
      dataJson: next as Prisma.InputJsonValue,
    },
  });
}

function oauthStateSecret() {
  return String(
    process.env.NEXTAUTH_SECRET
      || process.env.AUTH_SECRET
      || process.env.PORTAL_ENCRYPTION_MASTER_KEY
      || "",
  ).trim();
}

function signStatePayload(encodedPayload: string) {
  const secret = oauthStateSecret();
  if (!secret) {
    throw new PortalMetaIntegrationError("Missing NEXTAUTH_SECRET for Meta OAuth state signing.", 500, "meta_state_secret_missing");
  }
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function timingSafeEqualString(left: string, right: string) {
  const leftBuf = Buffer.from(left, "utf8");
  const rightBuf = Buffer.from(right, "utf8");
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function safeNextPath(raw: string | null | undefined, fallback: string) {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function readConfiguredRedirectUrl() {
  const explicit = String(process.env.META_REDIRECT_URI || process.env.META_APP_OAUTH_REDIRECT_URI || "").trim();
  if (!explicit) return toPurelyHostedUrl(META_CALLBACK_PATH);
  try {
    return new URL(explicit).toString();
  } catch {
    return toPurelyHostedUrl(META_CALLBACK_PATH);
  }
}

function readConfiguredInstagramBusinessLoginUrl() {
  const raw = String(
    process.env.META_INSTAGRAM_BUSINESS_LOGIN_URL
      || process.env.META_INSTAGRAM_LOGIN_EMBED_URL
      || process.env.INSTAGRAM_BUSINESS_LOGIN_URL
      || "",
  ).trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (!/instagram\.com$/i.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function getMetaOauthConfig() {
  return {
    appId: String(process.env.META_APP_ID || "").trim(),
    appSecret: String(process.env.META_APP_SECRET || "").trim(),
    redirectUri: readConfiguredRedirectUrl(),
  };
}

function buildConnectedAccountLabel(profile: MetaUserProfile) {
  if (profile.username) return `@${profile.username}`;
  if (profile.name && profile.email) return `${profile.name} (${profile.email})`;
  if (profile.name) return profile.name;
  if (profile.email) return profile.email;
  if (profile.id) return `Meta user ${profile.id}`;
  return null;
}

function buildTargetAccountStatus(status: MetaProviderStatus): MetaProviderStatus {
  if (status === "connected" || status === "needs_permissions") return "connected";
  if (status === "disabled") return "disabled";
  if (status === "not_connected") return "not_connected";
  return "coming_soon";
}

function buildTargetAccountReason(account: StoredMetaTargetAccount, integrationMode: PortalMetaIntegrationMode) {
  if (integrationMode === "instagram_login") {
    return account.reason || "Connected directly through Instagram Login for the selected professional account.";
  }
  if (account.kind === "facebook_page") {
    return account.reason || "Available Facebook Page destination for the connected Meta account.";
  }
  if (account.pageLabel) {
    return account.reason || `Available Instagram professional account connected through Facebook Page ${account.pageLabel}.`;
  }
  return account.reason || "Available Instagram professional account for the connected Meta account.";
}

function mapStoredTargetAccount(account: StoredMetaTargetAccount, integrationMode: PortalMetaIntegrationMode): PortalMetaTargetAccount {
  return {
    key: account.key,
    kind: account.kind,
    label: account.label,
    status: "connected",
    connected: true,
    placeholder: false,
    destinationType: account.destinationType,
    destinationId: account.destinationId,
    pageId: account.pageId,
    pageLabel: account.pageLabel,
    username: account.username,
    reason: buildTargetAccountReason(account, integrationMode),
  };
}

function buildPlaceholderTargetAccounts(status: MetaProviderStatus, integrationMode: PortalMetaIntegrationMode): PortalMetaTargetAccount[] {
  const targetStatus = buildTargetAccountStatus(status);
  if (integrationMode === "instagram_login") {
    return [
      {
        key: "instagram_professional",
        kind: "instagram_professional",
        label: "Instagram professional account",
        status: targetStatus,
        connected: false,
        placeholder: true,
        destinationType: "instagram_business",
        destinationId: null,
        pageId: null,
        pageLabel: null,
        username: null,
        reason: status === "not_connected"
          ? "Connect the Instagram professional account you want Purely to publish to."
          : "Instagram destination discovery depends on the saved Instagram Login connection and approved permissions.",
      },
    ];
  }
  return [
    {
      key: "facebook_page",
      kind: "facebook_page",
      label: "Facebook Page",
      status: targetStatus,
      connected: false,
      placeholder: true,
      destinationType: "facebook_page",
      destinationId: null,
      pageId: null,
      pageLabel: null,
      username: null,
      reason: status === "not_connected"
        ? "Connect Meta first so Purely can read available Facebook Pages."
        : "Facebook Page discovery depends on the saved Meta connection and approved permissions.",
    },
    {
      key: "instagram_professional",
      kind: "instagram_professional",
      label: "Instagram professional account",
      status: targetStatus,
      connected: false,
      placeholder: true,
      destinationType: "instagram_business",
      destinationId: null,
      pageId: null,
      pageLabel: null,
      username: null,
      reason: status === "not_connected"
        ? "Connect Meta first so Purely can read available Instagram professional accounts."
        : "Instagram destination discovery depends on the saved Meta connection and approved permissions.",
    },
  ];
}

export function getDefaultMetaSettingsPath(portalVariant?: string | null) {
  return String(portalVariant || "portal").toLowerCase() === "credit"
    ? "/credit/app/services/media-library"
    : "/portal/app/services/media-library";
}

export function getDefaultMetaReturnPath(portalVariant?: string | null) {
  return buildProviderSetupWizardHref(portalBaseFromWorkspaceVariant(portalVariant), "meta");
}

export function normalizeMetaReturnPath(raw: string | null | undefined, portalVariant?: string | null) {
  const portalBase = portalBaseFromWorkspaceVariant(portalVariant);
  const fallback = getDefaultMetaReturnPath(portalVariant);
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(value, "http://purely.local");
  } catch {
    return fallback;
  }

  if (parsed.pathname === `${portalBase}/app/settings/integrations`) {
    return buildProviderSetupWizardHref(portalBase, "meta");
  }

  if (parsed.pathname !== `${portalBase}/app/services/media-library`) {
    return fallback;
  }

  const next = new URL(parsed.pathname, "http://purely.local");
  const view = String(parsed.searchParams.get("view") || "").trim();
  if (view === "library" || view === "calendar") next.searchParams.set("view", view);

  const folderId = String(parsed.searchParams.get("folderId") || "").trim();
  if (folderId) next.searchParams.set("folderId", folderId);

  const itemId = String(parsed.searchParams.get("itemId") || "").trim();
  if (itemId) {
    next.searchParams.set("itemId", itemId);
    if (parsed.searchParams.get("composer") === "1") next.searchParams.set("composer", "1");
  }

  return `${next.pathname}${next.search}`;
}

export function buildMetaConnectHref(
  portalVariant?: string | null,
  integrationMode: PortalMetaIntegrationMode = DEFAULT_META_INTEGRATION_MODE,
  nextPath?: string | null,
) {
  const normalizedNextPath = normalizeMetaReturnPath(nextPath, portalVariant);
  return `${META_CONNECT_PATH}?next=${encodeURIComponent(normalizedNextPath)}&mode=${encodeURIComponent(integrationMode)}`;
}

export function getMetaDisconnectHref() {
  return META_DISCONNECT_PATH;
}

export function getMetaCallbackUrl() {
  return readConfiguredRedirectUrl();
}

export function createMetaOAuthState(input: {
  ownerId: string;
  memberId: string;
  portalVariant?: string | null;
  nextPath: string;
  integrationMode?: PortalMetaIntegrationMode | null;
}) {
  const payload: MetaOAuthStatePayload = {
    ownerId: String(input.ownerId || "").trim(),
    memberId: String(input.memberId || "").trim(),
    portalVariant: String(input.portalVariant || "portal").trim() || "portal",
    nextPath: normalizeMetaReturnPath(input.nextPath, input.portalVariant),
    integrationMode: normalizePortalMetaIntegrationMode(input.integrationMode, DEFAULT_META_INTEGRATION_MODE),
    nonce: crypto.randomBytes(18).toString("base64url"),
    issuedAtMs: Date.now(),
  };

  if (!payload.ownerId || !payload.memberId) {
    throw new PortalMetaIntegrationError("Cannot build Meta OAuth state without owner context.", 400, "meta_state_owner_missing");
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signStatePayload(encodedPayload)}`;
}

export function readMetaOAuthState(raw: string | null | undefined): MetaOAuthStatePayload | null {
  const token = String(raw || "").trim();
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = signStatePayload(encodedPayload);
  if (!timingSafeEqualString(expected, signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<MetaOAuthStatePayload>;
    if (
      typeof parsed.ownerId !== "string" ||
      typeof parsed.memberId !== "string" ||
      typeof parsed.portalVariant !== "string" ||
      typeof parsed.nextPath !== "string" ||
      (parsed.integrationMode !== undefined && typeof parsed.integrationMode !== "string") ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.issuedAtMs !== "number"
    ) {
      return null;
    }

    if (Date.now() - parsed.issuedAtMs > META_OAUTH_STATE_MAX_AGE_MS) {
      return null;
    }

    return {
      ownerId: parsed.ownerId,
      memberId: parsed.memberId,
      portalVariant: parsed.portalVariant,
      nextPath: normalizeMetaReturnPath(parsed.nextPath, parsed.portalVariant),
      integrationMode: normalizePortalMetaIntegrationMode(parsed.integrationMode, LEGACY_META_INTEGRATION_MODE),
      nonce: parsed.nonce,
      issuedAtMs: parsed.issuedAtMs,
    };
  } catch {
    return null;
  }
}

export function getMetaProviderConnectUrl(input: { state: string; integrationMode: PortalMetaIntegrationMode }) {
  const config = getMetaOauthConfig();
  if (!config.appId || !config.appSecret) {
    throw new PortalMetaIntegrationError("Meta OAuth is not configured for this environment.", 500, "meta_oauth_not_configured");
  }

  const url = input.integrationMode === "instagram_login"
    ? (readConfiguredInstagramBusinessLoginUrl() || new URL("https://www.instagram.com/oauth/authorize"))
    : new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", getMetaRequestedScopesForMode(input.integrationMode).join(","));
  return url.toString();
}

function normalizeDelimitedScopes(value: unknown): string[] {
  if (Array.isArray(value)) return dedupeStringArray(value.map((entry) => String(entry || "")));
  const raw = normalizeString(value);
  return raw ? dedupeStringArray(raw.split(",")) : [];
}

function extractPrimaryObject(body: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!body) return null;
  if (Array.isArray(body.data)) {
    const first = body.data[0];
    return first && typeof first === "object" && !Array.isArray(first) ? first as Record<string, unknown> : null;
  }
  return body;
}

async function exchangeInstagramLoginLongLivedToken(shortLivedAccessToken: string) {
  const config = getMetaOauthConfig();
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("access_token", shortLivedAccessToken);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const accessToken = normalizeString(body?.access_token);
  if (!response.ok || !accessToken) {
    throw new PortalMetaIntegrationError(
      buildMetaGraphError(body, "Could not exchange the Instagram Login token for a long-lived token."),
      400,
      "meta_token_exchange_failed",
    );
  }

  const expiresInRaw = typeof body?.expires_in === "number" || typeof body?.expires_in === "string"
    ? Number(body.expires_in)
    : NaN;

  return {
    accessToken,
    tokenType: normalizeString(body?.token_type),
    accessTokenExpiresAtIso: Number.isFinite(expiresInRaw) && expiresInRaw > 0
      ? new Date(Date.now() + expiresInRaw * 1000).toISOString()
      : null,
  };
}

async function exchangeCodeForAccessToken(code: string, integrationMode: PortalMetaIntegrationMode) {
  const config = getMetaOauthConfig();
  if (!config.appId || !config.appSecret) {
    throw new PortalMetaIntegrationError("Meta OAuth is not configured for this environment.", 500, "meta_oauth_not_configured");
  }

  if (integrationMode === "instagram_login") {
    const form = new FormData();
    form.set("client_id", config.appId);
    form.set("client_secret", config.appSecret);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", config.redirectUri);
    form.set("code", code);

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    const tokenBody = (await tokenRes.json().catch(() => null)) as Record<string, unknown> | null;
    const tokenRecord = extractPrimaryObject(tokenBody);
    const shortLivedAccessToken = normalizeString(tokenRecord?.access_token) || normalizeString(tokenBody?.access_token);
    if (!tokenRes.ok || !shortLivedAccessToken) {
      throw new PortalMetaIntegrationError(
        normalizeString(tokenBody?.error_message) || buildMetaGraphError(tokenBody, "Could not connect Instagram Login."),
        400,
        "meta_token_exchange_failed",
      );
    }

    const longLived = await exchangeInstagramLoginLongLivedToken(shortLivedAccessToken);
    return {
      accessToken: longLived.accessToken,
      tokenType: longLived.tokenType,
      accessTokenExpiresAtIso: longLived.accessTokenExpiresAtIso,
      grantedScopes: normalizeDelimitedScopes(tokenRecord?.permissions),
      appUserId: normalizeString(tokenRecord?.user_id) || normalizeString(tokenBody?.user_id),
    };
  }

  const tokenUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString(), { cache: "no-store" });
  const tokenBody = (await tokenRes.json().catch(() => null)) as Record<string, unknown> | null;
  const accessToken = normalizeString(tokenBody?.access_token);
  if (!tokenRes.ok || !accessToken) {
    const nestedError = tokenBody?.error && typeof tokenBody.error === "object" ? tokenBody.error as Record<string, unknown> : null;
    throw new PortalMetaIntegrationError(
      normalizeString(tokenBody?.error_description) || normalizeString(nestedError?.message) || "Could not connect Meta.",
      400,
      "meta_token_exchange_failed",
    );
  }

  const expiresInRaw = typeof tokenBody?.expires_in === "number" || typeof tokenBody?.expires_in === "string"
    ? Number(tokenBody.expires_in)
    : NaN;

  return {
    accessToken,
    tokenType: normalizeString(tokenBody?.token_type),
    accessTokenExpiresAtIso: Number.isFinite(expiresInRaw) && expiresInRaw > 0
      ? new Date(Date.now() + expiresInRaw * 1000).toISOString()
      : null,
    grantedScopes: [] as string[],
    appUserId: null,
  };
}

async function fetchMetaUserProfile(accessToken: string, integrationMode: PortalMetaIntegrationMode): Promise<MetaUserProfile> {
  if (integrationMode === "instagram_login") {
    const profileUrl = new URL(`https://graph.instagram.com/${META_INSTAGRAM_GRAPH_VERSION}/me`);
    profileUrl.searchParams.set("fields", "user_id,username");
    profileUrl.searchParams.set("access_token", accessToken);

    const profileRes = await fetch(profileUrl.toString(), { cache: "no-store" });
    const profileBody = (await profileRes.json().catch(() => null)) as Record<string, unknown> | null;
    const profileRecord = extractPrimaryObject(profileBody);
    const userId = normalizeString(profileRecord?.user_id) || normalizeString(profileBody?.user_id);
    const username = normalizeString(profileRecord?.username) || normalizeString(profileBody?.username);
    if (!profileRes.ok || !userId) {
      throw new PortalMetaIntegrationError(
        buildMetaGraphError(profileBody, "Could not read Instagram account details."),
        400,
        "meta_profile_fetch_failed",
      );
    }

    return {
      id: userId,
      name: username,
      email: null,
      username,
    };
  }

  const profileUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me`);
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set("access_token", accessToken);

  const profileRes = await fetch(profileUrl.toString(), { cache: "no-store" });
  const profileBody = (await profileRes.json().catch(() => null)) as Record<string, unknown> | null;
  if (!profileRes.ok) {
    const nestedError = profileBody?.error && typeof profileBody.error === "object" ? profileBody.error as Record<string, unknown> : null;
    throw new PortalMetaIntegrationError(
      normalizeString(nestedError?.message) || "Could not read Meta account details.",
      400,
      "meta_profile_fetch_failed",
    );
  }

  return {
    id: normalizeString(profileBody?.id),
    name: normalizeString(profileBody?.name),
    email: normalizeString(profileBody?.email),
    username: null,
  };
}

async function fetchPermissionSnapshot(accessToken: string): Promise<MetaPermissionSnapshot> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" }).catch(() => null);
  const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
  const granted = new Set<string>();
  const nestedError = body?.error && typeof body.error === "object" ? body.error as Record<string, unknown> : null;
  const errorCode = typeof nestedError?.code === "number" || typeof nestedError?.code === "string"
    ? Number(nestedError.code)
    : NaN;
  const errorMessage = buildMetaGraphError(body, "Purely could not read the Meta permission state for this token.");

  if (res?.ok && Array.isArray(body?.data)) {
    for (const entry of body.data as Array<Record<string, unknown>>) {
      const permission = normalizeString(entry.permission);
      const status = normalizeString(entry.status);
      if (permission && status === "granted") granted.add(permission);
    }
  }

  const grantedScopes = Array.from(granted).sort();
  return {
    grantedScopes,
    missingRequiredScopes: getMetaRequiredScopesForMode(LEGACY_META_INTEGRATION_MODE).filter((scope) => !granted.has(scope)),
    tokenInvalid: !res?.ok && (errorCode === 190 || /access token/i.test(errorMessage)),
    errorMessage: res?.ok ? null : errorMessage,
  };
}

function normalizePageTaskList(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function buildMetaGraphError(body: Record<string, unknown> | null, fallback: string) {
  const nested = body?.error && typeof body.error === "object" ? body.error as Record<string, unknown> : null;
  return normalizeString(nested?.message) || normalizeString(body?.error_description) || fallback;
}

async function fetchMetaTargetAccounts(accessToken: string): Promise<MetaTargetAccountSnapshot> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts`);
  url.searchParams.set("fields", "id,name,tasks,instagram_business_account{id,username,name}");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" }).catch(() => null);
  const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
  if (!res?.ok) {
    return {
      accounts: [],
      blockers: [buildMetaGraphError(body, "Purely could not read Facebook Pages for this Meta account.")],
    };
  }

  const pages = Array.isArray(body?.data) ? body.data as Array<Record<string, unknown>> : [];
  const accounts: StoredMetaTargetAccount[] = [];
  let sawInstagramAccount = false;

  for (const page of pages) {
    const pageId = normalizeString(page.id);
    const pageLabel = normalizeString(page.name);
    if (!pageId || !pageLabel) continue;

    const tasks = normalizePageTaskList(page.tasks);
    accounts.push({
      key: `facebook_page:${pageId}`,
      kind: "facebook_page",
      destinationType: "facebook_page",
      destinationId: pageId,
      label: pageLabel,
      pageId,
      pageLabel,
      username: null,
      reason: tasks.length
        ? `Meta returned this Page with tasks: ${tasks.join(", ")}.`
        : "Meta returned this Page for the connected account.",
    });

    const instagram = page.instagram_business_account;
    if (!instagram || typeof instagram !== "object" || Array.isArray(instagram)) continue;
    const instagramId = normalizeString((instagram as Record<string, unknown>).id);
    if (!instagramId) continue;
    sawInstagramAccount = true;

    const instagramUsername = normalizeString((instagram as Record<string, unknown>).username);
    const instagramName = normalizeString((instagram as Record<string, unknown>).name);
    accounts.push({
      key: `instagram_professional:${instagramId}`,
      kind: "instagram_professional",
      destinationType: "instagram_business",
      destinationId: instagramId,
      label: instagramName || (instagramUsername ? `@${instagramUsername}` : `Instagram ${instagramId}`),
      pageId,
      pageLabel,
      username: instagramUsername,
      reason: pageLabel
        ? `Connected through Facebook Page ${pageLabel}.`
        : "Connected Instagram professional account returned by Meta.",
    });
  }

  const blockers: string[] = [];
  if (!pages.length) blockers.push("Meta did not return any Facebook Pages for this connected account.");
  if (!sawInstagramAccount) blockers.push("Meta did not return any Instagram professional accounts for the available Facebook Pages.");

  return {
    accounts,
    blockers: dedupeStringArray(blockers),
  };
}

function buildInstagramLoginTargetSnapshot(profile: MetaUserProfile): MetaTargetAccountSnapshot {
  if (!profile.id) {
    return {
      accounts: [],
      blockers: ["Instagram Login did not return a professional account ID for this connection."],
    };
  }

  return {
    accounts: [
      {
        key: `instagram_professional:${profile.id}`,
        kind: "instagram_professional",
        destinationType: "instagram_business",
        destinationId: profile.id,
        label: profile.username ? `@${profile.username}` : (profile.name || `Instagram ${profile.id}`),
        pageId: null,
        pageLabel: null,
        username: profile.username,
        reason: "Connected directly through Instagram Login.",
      },
    ],
    blockers: [],
  };
}

async function refreshStoredMetaConnection(ownerId: string, bundle: StoredMetaConnectionBundle, secret: StoredMetaConnectionSecret) {
  if (bundle.integrationMode === "instagram_login") {
    const profile = await fetchMetaUserProfile(secret.accessToken, bundle.integrationMode).catch(() => null);
    const requiredScopes = getMetaRequiredScopesForMode(bundle.integrationMode);
    const grantedScopes = dedupeStringArray(secret.grantedScopes);
    const missingRequiredScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    const targetSnapshot = profile ? buildInstagramLoginTargetSnapshot(profile) : {
      accounts: [],
      blockers: ["Reconnect Instagram before Purely can verify the saved professional account again."],
    };
    const nowIso = new Date().toISOString();
    const nextStatus: StoredMetaConnectionBundle["status"] = !profile
      ? "reconnect_required"
      : missingRequiredScopes.length
        ? "needs_permissions"
        : "connected";
    const nextBundle: StoredMetaConnectionBundle = {
      ...bundle,
      status: nextStatus,
      connectedMetaUserId: profile?.id ?? bundle.connectedMetaUserId,
      connectedMetaUserName: profile?.username ?? profile?.name ?? bundle.connectedMetaUserName,
      connectedMetaUserEmail: null,
      connectedAccountLabel: profile ? buildConnectedAccountLabel(profile) : bundle.connectedAccountLabel,
      permissionGaps: profile ? missingRequiredScopes : [],
      targetAccounts: profile ? targetSnapshot.accounts : [],
      targetAccountBlockers: targetSnapshot.blockers,
      lastCheckedAtIso: nowIso,
      accessTokenExpiresAtIso: secret.accessTokenExpiresAtIso,
    };

    await storeMetaConnection(ownerId, nextBundle, {
      ...secret,
      grantedScopes,
    });
    return { bundle: nextBundle, secret: { ...secret, grantedScopes } };
  }

  const permissionSnapshot = await fetchPermissionSnapshot(secret.accessToken);
  const targetSnapshot = await fetchMetaTargetAccounts(secret.accessToken);
  const nowIso = new Date().toISOString();
  const nextStatus: StoredMetaConnectionBundle["status"] = permissionSnapshot.tokenInvalid
    ? "reconnect_required"
    : permissionSnapshot.missingRequiredScopes.length
      ? "needs_permissions"
      : "connected";
  const nextBundle: StoredMetaConnectionBundle = {
    ...bundle,
    status: nextStatus,
    permissionGaps: permissionSnapshot.tokenInvalid ? [] : permissionSnapshot.missingRequiredScopes,
    targetAccounts: targetSnapshot.accounts,
    targetAccountBlockers: dedupeStringArray([
      ...(permissionSnapshot.errorMessage ? [permissionSnapshot.errorMessage] : []),
      ...targetSnapshot.blockers,
    ]),
    lastCheckedAtIso: nowIso,
    accessTokenExpiresAtIso: secret.accessTokenExpiresAtIso,
  };
  const nextSecret: StoredMetaConnectionSecret = {
    ...secret,
    grantedScopes: permissionSnapshot.grantedScopes,
  };

  await storeMetaConnection(ownerId, nextBundle, nextSecret);
  return { bundle: nextBundle, secret: nextSecret };
}

async function storeMetaConnection(ownerId: string, bundle: StoredMetaConnectionBundle, secret: StoredMetaConnectionSecret) {
  if (!isPortalEncryptionConfigured()) {
    throw new PortalMetaIntegrationError("Secure integration storage is not configured on this server.", 500, "meta_encryption_missing");
  }

  const encrypted = encryptStringV1(JSON.stringify(secret));
  const nextBundle: StoredMetaConnectionBundle = {
    ...bundle,
    encrypted: {
      version: 1,
      ciphertextB64: encrypted.ciphertextB64,
      ivB64: encrypted.ivB64,
      authTagB64: encrypted.authTagB64,
    },
  };

  await updateMediaSetupData(ownerId, (current) => ({
    ...current,
    metaOauthConnection: nextBundle,
  }));
}

export async function clearMetaOauthConnection(ownerId: string) {
  await updateMediaSetupData(ownerId, (current) => {
    const next = { ...current };
    delete next.metaOauthConnection;
    return next;
  });
}

async function readMetaConnectionSecret(bundle: StoredMetaConnectionBundle): Promise<StoredMetaConnectionSecret | null> {
  try {
    const decrypted = decryptStringV1(bundle.encrypted);
    const parsed = JSON.parse(decrypted) as Partial<StoredMetaConnectionSecret>;
    if (!parsed || typeof parsed.accessToken !== "string" || !parsed.accessToken.trim()) return null;
    return {
      accessToken: parsed.accessToken,
      tokenType: normalizeString(parsed.tokenType),
      accessTokenExpiresAtIso: normalizeString(parsed.accessTokenExpiresAtIso),
      grantedScopes: normalizeStringArray(parsed.grantedScopes),
    };
  } catch {
    return null;
  }
}

export async function completeMetaOauthConnection(input: { ownerId: string; code: string; integrationMode?: PortalMetaIntegrationMode | null }) {
  if (!isPortalEncryptionConfigured()) {
    throw new PortalMetaIntegrationError("Secure integration storage is not configured on this server.", 500, "meta_encryption_missing");
  }

  const integrationMode = input.integrationMode || DEFAULT_META_INTEGRATION_MODE;
  const token = await exchangeCodeForAccessToken(input.code, integrationMode);
  const profile = await fetchMetaUserProfile(token.accessToken, integrationMode);
  const permissionSnapshot = integrationMode === "instagram_login"
    ? {
        grantedScopes: dedupeStringArray(token.grantedScopes),
        missingRequiredScopes: getMetaRequiredScopesForMode(integrationMode).filter((scope) => !token.grantedScopes.includes(scope)),
        tokenInvalid: false,
        errorMessage: null,
      }
    : await fetchPermissionSnapshot(token.accessToken);
  const targetSnapshot = integrationMode === "instagram_login"
    ? buildInstagramLoginTargetSnapshot(profile)
    : await fetchMetaTargetAccounts(token.accessToken);
  const nowIso = new Date().toISOString();
  const status: StoredMetaConnectionBundle["status"] = permissionSnapshot.missingRequiredScopes.length ? "needs_permissions" : "connected";

  const bundle: StoredMetaConnectionBundle = {
    provider: "meta",
    integrationMode,
    status,
    connectedMetaUserId: profile.id,
    connectedMetaUserName: profile.username || profile.name,
    connectedMetaUserEmail: profile.email,
    connectedAccountLabel: buildConnectedAccountLabel(profile),
    permissionGaps: permissionSnapshot.missingRequiredScopes,
    targetAccounts: targetSnapshot.accounts,
    targetAccountBlockers: targetSnapshot.blockers,
    connectedAtIso: nowIso,
    lastCheckedAtIso: nowIso,
    accessTokenExpiresAtIso: token.accessTokenExpiresAtIso,
    encrypted: { version: 1, ciphertextB64: "", ivB64: "", authTagB64: "" },
  };

  await storeMetaConnection(input.ownerId, bundle, {
    accessToken: token.accessToken,
    tokenType: token.tokenType,
    accessTokenExpiresAtIso: token.accessTokenExpiresAtIso,
    grantedScopes: permissionSnapshot.grantedScopes,
  });

  return bundle;
}

export async function getPortalMetaProviderReadiness(
  ownerId: string,
  opts?: { portalVariant?: string | null; isOwnerSession?: boolean; preferredMode?: PortalMetaIntegrationMode | null },
): Promise<PortalMetaProviderReadiness> {
  const config = getMetaOauthConfig();
  const oauthConfigured = Boolean(config.appId && config.appSecret);
  const encryptionConfigured = isPortalEncryptionConfigured();
  const disabledByEnv = boolFromEnv(process.env.META_PROVIDER_DISABLED);
  const isOwnerSession = Boolean(opts?.isOwnerSession);
  const existing = await readMediaSetupRow(ownerId).catch(() => null);
  const current = parseMetaServiceData(existing?.dataJson);
  const bundle = getStoredBundle(current);
  const integrationMode = bundle?.integrationMode || normalizePortalMetaIntegrationMode(opts?.preferredMode, DEFAULT_META_INTEGRATION_MODE);

  let status: MetaProviderStatus = "coming_soon";
  let permissionGaps: string[] = [];
  let grantedScopes: string[] = [];
  let connectedAccountLabel: string | null = null;
  let connectedMetaUserId: string | null = null;
  let connectedMetaUserName: string | null = null;
  let connectedMetaUserEmail: string | null = null;
  let targetAccounts: PortalMetaTargetAccount[] = buildPlaceholderTargetAccounts(status, integrationMode);
  let targetAccountBlockers: string[] = [];
  let disconnectHref: string | null = null;
  let setupMessage = integrationMode === "instagram_login"
    ? "Connect the Instagram professional account you want Purely to publish to. Manual posting remains available from Media Library."
    : "Meta direct publishing is still blocked. Manual posting remains available from Media Library.";

  if (disabledByEnv) {
    status = "disabled";
    setupMessage = integrationMode === "instagram_login"
      ? "Instagram Login is disabled in this environment. Manual posting remains available while the connection shell stays off."
      : "Meta connection is disabled in this environment. Manual posting remains available while the connection shell stays off.";
  } else if (!oauthConfigured) {
    status = "coming_soon";
    setupMessage = integrationMode === "instagram_login"
      ? "Instagram Login credentials are not fully configured yet. Manual posting remains available while the connection shell is completed."
      : "Meta app credentials are not fully configured yet. Manual posting remains available while the connection shell is completed.";
  } else if (!encryptionConfigured) {
    status = "coming_soon";
    setupMessage = integrationMode === "instagram_login"
      ? "Secure integration storage is not configured on this server yet. Manual posting remains available until secure Instagram storage is ready."
      : "Secure integration storage is not configured on this server yet. Manual posting remains available until secure Meta storage is ready.";
  } else if (!bundle) {
    status = "not_connected";
    setupMessage = integrationMode === "instagram_login"
      ? "Connect the Instagram professional account you want Purely to publish to. This account must be Business or Creator."
      : "Connect Meta to let Purely verify your account first. Posting and metrics will stay off until the next permission step is ready.";
    targetAccounts = buildPlaceholderTargetAccounts(status, integrationMode);
  } else {
    const decrypted = await readMetaConnectionSecret(bundle);
    const expiresAtMs = bundle.accessTokenExpiresAtIso ? new Date(bundle.accessTokenExpiresAtIso).getTime() : 0;
    const expired = Boolean(expiresAtMs && expiresAtMs <= Date.now());
    let activeBundle = bundle;

    status = !decrypted || expired ? "reconnect_required" : bundle.status;
    permissionGaps = bundle.permissionGaps;
    connectedAccountLabel = bundle.connectedAccountLabel;
    connectedMetaUserId = bundle.connectedMetaUserId;
    connectedMetaUserName = bundle.connectedMetaUserName;
    connectedMetaUserEmail = bundle.connectedMetaUserEmail;
    disconnectHref = getMetaDisconnectHref();

    if (decrypted && !expired) {
      grantedScopes = decrypted.grantedScopes;
      const refreshed = await refreshStoredMetaConnection(ownerId, bundle, decrypted).catch(() => null);
      if (refreshed) {
        activeBundle = refreshed.bundle;
        status = refreshed.bundle.status;
        permissionGaps = refreshed.bundle.permissionGaps;
        grantedScopes = refreshed.secret.grantedScopes;
        connectedAccountLabel = refreshed.bundle.connectedAccountLabel;
        connectedMetaUserId = refreshed.bundle.connectedMetaUserId;
        connectedMetaUserName = refreshed.bundle.connectedMetaUserName;
        connectedMetaUserEmail = refreshed.bundle.connectedMetaUserEmail;
      }
    }

    targetAccounts = activeBundle.targetAccounts.length
      ? activeBundle.targetAccounts.map((account) => mapStoredTargetAccount(account, activeBundle.integrationMode))
      : [];
    targetAccountBlockers = activeBundle.targetAccountBlockers;

    if (status === "connected") {
      setupMessage = activeBundle.integrationMode === "instagram_login"
        ? "Instagram professional account connected. Purely can verify the account now, but publishing and metrics stay disabled until approval and the full contract are ready."
        : "Meta account connected. Purely can verify your Meta account now, but posting and metrics stay disabled until the next permission step is ready.";
    } else if (status === "needs_permissions") {
      setupMessage = activeBundle.integrationMode === "instagram_login"
        ? "Instagram connected, but the Instagram Login permission set is still incomplete. Publishing stays disabled until Meta approval and valid permissions are in place."
        : "Meta account connected, but the current permission set is still incomplete. Purely can verify the account now, while posting and metrics stay disabled until the next permission step is ready.";
    } else {
      setupMessage = activeBundle.integrationMode === "instagram_login"
        ? "Reconnect the Instagram professional account before Purely can verify it again. Publishing and metrics remain disabled, and manual posting stays available now."
        : "Your saved Meta connection needs to be reconnected before Purely can verify it again. Posting and metrics remain disabled, and manual posting stays available now.";
      targetAccounts = buildPlaceholderTargetAccounts(status, activeBundle.integrationMode);
    }
  }

  if (!isOwnerSession) {
    setupMessage = `${setupMessage} Only the account owner can start or disconnect the Meta connection from this workspace.`;
  }

  const connectHref = buildMetaConnectHref(opts?.portalVariant, integrationMode);
  const canStartOAuth = isOwnerSession && oauthConfigured && encryptionConfigured && !disabledByEnv && status !== "connected";
  const pageDestinationCount = targetAccounts.filter((account) => account.destinationType === "facebook_page" && account.connected && !account.placeholder).length;
  const instagramDestinationCount = targetAccounts.filter((account) => account.destinationType === "instagram_business" && account.connected && !account.placeholder).length;
  const diagnostics = derivePortalMetaDiagnostics({
    mode: integrationMode,
    connected: status === "connected" || status === "needs_permissions",
    grantedScopes,
    permissionGaps,
    pageDestinationCount,
    instagramDestinationCount,
    targetAccountBlockers,
  });
  const primaryDiagnostic = diagnostics[0] || null;
  const providerLabel = integrationMode === "instagram_login" ? "Instagram" : "Meta";
  const actionLabel = status === "connected"
    ? "Connected"
    : status === "reconnect_required"
      ? `Reconnect ${providerLabel}`
      : status === "needs_permissions"
        ? `Reconnect ${providerLabel}`
        : status === "not_connected"
          ? `Connect ${providerLabel}`
          : status === "disabled"
            ? "Disabled"
            : "Coming soon";
  const explanation = primaryDiagnostic
    ? `${primaryDiagnostic.message} ${primaryDiagnostic.detail} Manual posting remains available now.`
    : targetAccountBlockers[0]
      ? `${targetAccountBlockers[0]} Manual posting remains available while Purely keeps live Meta publishing disabled.`
      : integrationMode === "instagram_login"
        ? "Connection lets Purely verify the Instagram professional account first. Publishing still requires Meta approval and valid permissions. Manual posting remains available now."
        : "Connection lets Purely verify your Meta account first. Posting and metrics will be enabled after permissions and app review are ready. Manual posting remains available now.";

  if (primaryDiagnostic) {
    setupMessage = primaryDiagnostic.message;
  }

  if (!targetAccounts.length && status !== "connected" && status !== "needs_permissions") {
    targetAccounts = buildPlaceholderTargetAccounts(status, integrationMode);
  }

  return {
    provider: "meta",
    ownerScoped: true,
    integrationMode,
    availableModes: [
      {
        mode: "instagram_login",
        label: "Instagram Login",
        description: "Connect the Instagram professional account directly with Instagram Login.",
        recommended: true,
      },
      {
        mode: "page_linked_facebook_login",
        label: "Page-linked Facebook Login",
        description: "Legacy Facebook Login flow that discovers Instagram through managed Facebook Pages.",
        recommended: false,
      },
    ],
    status,
    oauthConfigured,
    encryptionConfigured,
    earlyAccessEnabled: oauthConfigured && encryptionConfigured && !disabledByEnv,
    isOwnerSession,
    canStartOAuth,
    connectHref: canStartOAuth ? connectHref : null,
    disconnectHref: isOwnerSession ? disconnectHref : null,
    connectedAccountLabel,
    connectedMetaUserId,
    connectedMetaUserName,
    connectedMetaUserEmail,
    grantedScopes,
    permissionGaps,
    publishingAvailable: false,
    metricsAvailable: false,
    actionLabel,
    actionHref: canStartOAuth ? connectHref : null,
    callbackUrl: getMetaCallbackUrl(),
    setupMessage,
    explanation,
    targetAccounts,
    targetAccountBlockers,
    diagnostics,
    primaryDiagnostic,
    futureModes: {
      instagramLogin: getPortalMetaFutureInstagramLoginMode(),
    },
    capabilities: {
      publish: {
        available: false,
        liveEnabled: false,
        reason: explanation,
      },
      metrics: {
        available: false,
        liveEnabled: false,
        reason: "Meta metrics stay unavailable until approved permissions and real provider metrics are ready.",
      },
    },
    education: [
      ...(integrationMode === "instagram_login"
        ? [
            "Connect the Instagram professional account you want Purely to publish to.",
            "This account must be Business or Creator.",
            "Publishing still requires Meta approval and valid permissions.",
          ]
        : [
            "Each business connects its own Meta assets.",
            "Connection verifies the Meta account first.",
            "Posting and metrics stay disabled until permissions and app review are ready.",
          ]),
      "Purely will never post without your approval.",
      "Manual posting remains available now.",
    ],
  };
}

export async function getPortalMetaConnectionForPublishing(ownerId: string): Promise<{
  bundle: StoredMetaConnectionBundle | null;
  secret: StoredMetaConnectionSecret | null;
}> {
  const existing = await readMediaSetupRow(ownerId).catch(() => null);
  const current = parseMetaServiceData(existing?.dataJson);
  const bundle = getStoredBundle(current);
  const secret = bundle ? await readMetaConnectionSecret(bundle) : null;
  return { bundle, secret };
}