import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { decryptStringV1, encryptStringV1, isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";
import type { MetaProviderStatus, PortalMetaProviderReadiness } from "@/lib/portalMetaProviderReadiness";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

const META_SERVICE_SLUG = "media-library";
const META_CONNECT_PATH = "/api/portal/integrations/meta/connect";
const META_DISCONNECT_PATH = "/api/portal/integrations/meta/disconnect";
const META_CALLBACK_PATH = "/api/portal/integrations/meta/callback";
const META_INITIAL_SCOPES = ["public_profile", "email"] as const;
const META_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const META_GRAPH_VERSION = "v23.0";

type MetaServiceData = Record<string, unknown>;

type StoredMetaConnectionSecret = {
  accessToken: string;
  tokenType: string | null;
  accessTokenExpiresAtIso: string | null;
  grantedScopes: string[];
};

type StoredMetaConnectionEnvelope = {
  version: 1;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
};

type StoredMetaConnectionBundle = {
  provider: "meta";
  status: Extract<MetaProviderStatus, "connected" | "needs_permissions" | "reconnect_required">;
  connectedMetaUserId: string | null;
  connectedMetaUserName: string | null;
  connectedMetaUserEmail: string | null;
  connectedAccountLabel: string | null;
  permissionGaps: string[];
  connectedAtIso: string;
  lastCheckedAtIso: string;
  accessTokenExpiresAtIso: string | null;
  encrypted: StoredMetaConnectionEnvelope;
};

type MetaOAuthStatePayload = {
  ownerId: string;
  memberId: string;
  portalVariant: string;
  nextPath: string;
  nonce: string;
  issuedAtMs: number;
};

type MetaUserProfile = {
  id: string | null;
  name: string | null;
  email: string | null;
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

function parseStoredBundle(raw: unknown): StoredMetaConnectionBundle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const status = normalizeString(value.status);
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
    status,
    connectedMetaUserId: normalizeString(value.connectedMetaUserId),
    connectedMetaUserName: normalizeString(value.connectedMetaUserName),
    connectedMetaUserEmail: normalizeString(value.connectedMetaUserEmail),
    connectedAccountLabel: normalizeString(value.connectedAccountLabel),
    permissionGaps: normalizeStringArray(value.permissionGaps),
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

function getMetaOauthConfig() {
  return {
    appId: String(process.env.META_APP_ID || "").trim(),
    appSecret: String(process.env.META_APP_SECRET || "").trim(),
    redirectUri: readConfiguredRedirectUrl(),
  };
}

function buildConnectedAccountLabel(profile: MetaUserProfile) {
  if (profile.name && profile.email) return `${profile.name} (${profile.email})`;
  if (profile.name) return profile.name;
  if (profile.email) return profile.email;
  if (profile.id) return `Meta user ${profile.id}`;
  return null;
}

function buildTargetAccountStatus(status: MetaProviderStatus): MetaProviderStatus {
  if (status === "disabled") return "disabled";
  if (status === "not_connected") return "not_connected";
  return "coming_soon";
}

export function getDefaultMetaSettingsPath(portalVariant?: string | null) {
  return String(portalVariant || "portal").toLowerCase() === "credit"
    ? "/credit/app/services/media-library"
    : "/portal/app/services/media-library";
}

export function buildMetaConnectHref(portalVariant?: string | null) {
  const nextPath = getDefaultMetaSettingsPath(portalVariant);
  return `${META_CONNECT_PATH}?next=${encodeURIComponent(nextPath)}`;
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
}) {
  const payload: MetaOAuthStatePayload = {
    ownerId: String(input.ownerId || "").trim(),
    memberId: String(input.memberId || "").trim(),
    portalVariant: String(input.portalVariant || "portal").trim() || "portal",
    nextPath: safeNextPath(input.nextPath, getDefaultMetaSettingsPath(input.portalVariant)),
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
      nextPath: safeNextPath(parsed.nextPath, getDefaultMetaSettingsPath(parsed.portalVariant)),
      nonce: parsed.nonce,
      issuedAtMs: parsed.issuedAtMs,
    };
  } catch {
    return null;
  }
}

export function getMetaProviderConnectUrl(input: { state: string }) {
  const config = getMetaOauthConfig();
  if (!config.appId || !config.appSecret) {
    throw new PortalMetaIntegrationError("Meta OAuth is not configured for this environment.", 500, "meta_oauth_not_configured");
  }

  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_INITIAL_SCOPES.join(","));
  return url.toString();
}

async function exchangeCodeForAccessToken(code: string) {
  const config = getMetaOauthConfig();
  if (!config.appId || !config.appSecret) {
    throw new PortalMetaIntegrationError("Meta OAuth is not configured for this environment.", 500, "meta_oauth_not_configured");
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
  };
}

async function fetchMetaUserProfile(accessToken: string): Promise<MetaUserProfile> {
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
  };
}

async function fetchPermissionGaps(accessToken: string) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" }).catch(() => null);
  const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
  const granted = new Set<string>();

  if (res?.ok && Array.isArray(body?.data)) {
    for (const entry of body.data as Array<Record<string, unknown>>) {
      const permission = normalizeString(entry.permission);
      const status = normalizeString(entry.status);
      if (permission && status === "granted") granted.add(permission);
    }
  }

  return META_INITIAL_SCOPES.filter((scope) => !granted.has(scope));
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

export async function completeMetaOauthConnection(input: { ownerId: string; code: string }) {
  if (!isPortalEncryptionConfigured()) {
    throw new PortalMetaIntegrationError("Secure integration storage is not configured on this server.", 500, "meta_encryption_missing");
  }

  const token = await exchangeCodeForAccessToken(input.code);
  const profile = await fetchMetaUserProfile(token.accessToken);
  const permissionGaps = await fetchPermissionGaps(token.accessToken);
  const nowIso = new Date().toISOString();
  const status: StoredMetaConnectionBundle["status"] = permissionGaps.length ? "needs_permissions" : "connected";

  const bundle: StoredMetaConnectionBundle = {
    provider: "meta",
    status,
    connectedMetaUserId: profile.id,
    connectedMetaUserName: profile.name,
    connectedMetaUserEmail: profile.email,
    connectedAccountLabel: buildConnectedAccountLabel(profile),
    permissionGaps,
    connectedAtIso: nowIso,
    lastCheckedAtIso: nowIso,
    accessTokenExpiresAtIso: token.accessTokenExpiresAtIso,
    encrypted: { version: 1, ciphertextB64: "", ivB64: "", authTagB64: "" },
  };

  await storeMetaConnection(input.ownerId, bundle, {
    accessToken: token.accessToken,
    tokenType: token.tokenType,
    accessTokenExpiresAtIso: token.accessTokenExpiresAtIso,
    grantedScopes: META_INITIAL_SCOPES.filter((scope) => !permissionGaps.includes(scope)),
  });

  return bundle;
}

export async function getPortalMetaProviderReadiness(
  ownerId: string,
  opts?: { portalVariant?: string | null; isOwnerSession?: boolean },
): Promise<PortalMetaProviderReadiness> {
  const config = getMetaOauthConfig();
  const oauthConfigured = Boolean(config.appId && config.appSecret);
  const encryptionConfigured = isPortalEncryptionConfigured();
  const disabledByEnv = boolFromEnv(process.env.META_PROVIDER_DISABLED);
  const isOwnerSession = Boolean(opts?.isOwnerSession);
  const existing = await readMediaSetupRow(ownerId).catch(() => null);
  const current = parseMetaServiceData(existing?.dataJson);
  const bundle = getStoredBundle(current);

  let status: MetaProviderStatus = "coming_soon";
  let permissionGaps: string[] = [];
  let connectedAccountLabel: string | null = null;
  let connectedMetaUserId: string | null = null;
  let connectedMetaUserName: string | null = null;
  let connectedMetaUserEmail: string | null = null;
  let disconnectHref: string | null = null;
  let setupMessage = "Meta direct publishing is still blocked. Manual posting remains available from Media Library.";

  if (disabledByEnv) {
    status = "disabled";
    setupMessage = "Meta connection is disabled in this environment. Manual posting remains available while the connection shell stays off.";
  } else if (!oauthConfigured) {
    status = "coming_soon";
    setupMessage = "Meta app credentials are not fully configured yet. Manual posting remains available while the connection shell is completed.";
  } else if (!encryptionConfigured) {
    status = "coming_soon";
    setupMessage = "Secure integration storage is not configured on this server yet. Manual posting remains available until secure Meta storage is ready.";
  } else if (!bundle) {
    status = "not_connected";
    setupMessage = "Connect Meta to let Purely verify your account first. Posting and metrics will stay off until the next permission step is ready.";
  } else {
    const decrypted = await readMetaConnectionSecret(bundle);
    const expiresAtMs = bundle.accessTokenExpiresAtIso ? new Date(bundle.accessTokenExpiresAtIso).getTime() : 0;
    const expired = Boolean(expiresAtMs && expiresAtMs <= Date.now());

    status = !decrypted || expired ? "reconnect_required" : bundle.status;
    permissionGaps = bundle.permissionGaps;
    connectedAccountLabel = bundle.connectedAccountLabel;
    connectedMetaUserId = bundle.connectedMetaUserId;
    connectedMetaUserName = bundle.connectedMetaUserName;
    connectedMetaUserEmail = bundle.connectedMetaUserEmail;
    disconnectHref = getMetaDisconnectHref();

    if (status === "connected") {
      setupMessage = "Meta account connected. Purely can verify your Meta account now, but posting and metrics stay disabled until the next permission step is ready.";
    } else if (status === "needs_permissions") {
      setupMessage = "Meta account connected, but the current permission set is still incomplete. Purely can verify the account now, while posting and metrics stay disabled until the next permission step is ready.";
    } else {
      setupMessage = "Your saved Meta connection needs to be reconnected before Purely can verify it again. Posting and metrics remain disabled, and manual posting stays available now.";
    }
  }

  if (!isOwnerSession) {
    setupMessage = `${setupMessage} Only the account owner can start or disconnect the Meta connection from this workspace.`;
  }

  const connectHref = buildMetaConnectHref(opts?.portalVariant);
  const canStartOAuth = isOwnerSession && oauthConfigured && encryptionConfigured && !disabledByEnv && status !== "connected";
  const actionLabel = status === "connected"
    ? "Connected"
    : status === "reconnect_required"
      ? "Reconnect Meta"
      : status === "needs_permissions"
        ? "Reconnect Meta"
        : status === "not_connected"
          ? "Connect Meta"
          : status === "disabled"
            ? "Disabled"
            : "Coming soon";
  const targetStatus = buildTargetAccountStatus(status);
  const explanation = "Connection lets Purely verify your Meta account first. Posting and metrics will be enabled after permissions and app review are ready. Manual posting remains available now.";

  return {
    provider: "meta",
    ownerScoped: true,
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
    permissionGaps,
    publishingAvailable: false,
    metricsAvailable: false,
    actionLabel,
    actionHref: canStartOAuth ? connectHref : null,
    callbackUrl: getMetaCallbackUrl(),
    setupMessage,
    explanation,
    targetAccounts: [
      {
        key: "facebook_page",
        label: "Facebook Page",
        status: targetStatus,
        connected: false,
        placeholder: true,
      },
      {
        key: "instagram_professional",
        label: "Instagram professional account",
        status: targetStatus,
        connected: false,
        placeholder: true,
      },
    ],
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
      "Each business connects its own Meta assets.",
      "Connection verifies the Meta account first.",
      "Posting and metrics stay disabled until permissions and app review are ready.",
      "Purely will never post without your approval.",
      "Manual posting remains available now.",
    ],
  };
}