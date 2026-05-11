import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { decryptStringV1, encryptStringV1, isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";
import { getAppBaseUrl } from "@/lib/portalNotifications";
import type { BookingMeetingIntegrationStatus, BookingMeetingOauthProvider } from "@/lib/bookingMeetingIntegrations.shared";

const BOOKING_SERVICE_SLUG = "booking";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

type StoredBookingMeetingConnection = {
  provider: BookingMeetingOauthProvider;
  refreshToken: string;
  accessToken?: string | null;
  accessTokenExpiresAt?: string | null;
  connectedEmail?: string | null;
  connectedAtIso?: string | null;
};

type StoredBookingMeetingEnvelope = {
  version: 1;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
  connectedEmail?: string | null;
  connectedAtIso?: string | null;
};

type BookingServiceData = Record<string, unknown>;

export class BookingMeetingIntegrationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "BookingMeetingIntegrationError";
    this.statusCode = statusCode;
  }
}

function providerConfig(provider: BookingMeetingOauthProvider) {
  if (provider === "zoom") {
    return {
      clientId: String(process.env.ZOOM_CLIENT_ID || "").trim(),
      clientSecret: String(process.env.ZOOM_CLIENT_SECRET || "").trim(),
    };
  }

  return {
    clientId: String(process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  };
}

function isProviderConfigured(provider: BookingMeetingOauthProvider) {
  const config = providerConfig(provider);
  return Boolean(config.clientId && config.clientSecret);
}

function parseBookingServiceData(raw: unknown): BookingServiceData {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? ({ ...(raw as Record<string, unknown>) } as BookingServiceData) : {};
}

function parseEnvelope(raw: unknown): StoredBookingMeetingEnvelope | null {
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
    connectedEmail: typeof value.connectedEmail === "string" ? value.connectedEmail : null,
    connectedAtIso: typeof value.connectedAtIso === "string" ? value.connectedAtIso : null,
  };
}

function getEnvelopeForProvider(data: BookingServiceData, provider: BookingMeetingOauthProvider) {
  const rec = data.meetingProviderAuth;
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  return parseEnvelope((rec as Record<string, unknown>)[provider]);
}

async function readBookingSetupRow(ownerId: string) {
  return prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: BOOKING_SERVICE_SLUG } },
    select: { dataJson: true },
  });
}

async function updateBookingSetupData(ownerId: string, updater: (current: BookingServiceData) => BookingServiceData) {
  const existing = await readBookingSetupRow(ownerId);
  const current = parseBookingServiceData(existing?.dataJson);
  const next = updater(current);
  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: BOOKING_SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: BOOKING_SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: next as Prisma.InputJsonValue,
    },
    update: { status: "COMPLETE", dataJson: next as Prisma.InputJsonValue },
  });
}

export async function getBookingMeetingIntegrationStatus(ownerId: string): Promise<BookingMeetingIntegrationStatus> {
  const encryptionConfigured = isPortalEncryptionConfigured();
  const existing = await readBookingSetupRow(ownerId).catch(() => null);
  const current = parseBookingServiceData(existing?.dataJson);
  const zoom = getEnvelopeForProvider(current, "zoom");
  const googleMeet = getEnvelopeForProvider(current, "google_meet");

  return {
    encryptionConfigured,
    providers: {
      zoom: {
        connected: Boolean(zoom),
        connectedEmail: zoom?.connectedEmail ?? null,
        connectedAtIso: zoom?.connectedAtIso ?? null,
        oauthConfigured: isProviderConfigured("zoom"),
      },
      google_meet: {
        connected: Boolean(googleMeet),
        connectedEmail: googleMeet?.connectedEmail ?? null,
        connectedAtIso: googleMeet?.connectedAtIso ?? null,
        oauthConfigured: isProviderConfigured("google_meet"),
      },
    },
  };
}

async function storeProviderConnection(
  ownerId: string,
  provider: BookingMeetingOauthProvider,
  connection: StoredBookingMeetingConnection,
) {
  if (!isPortalEncryptionConfigured()) {
    throw new BookingMeetingIntegrationError("Secure integration storage is not configured on this server.", 500);
  }

  const encrypted = encryptStringV1(JSON.stringify(connection));
  const envelope: StoredBookingMeetingEnvelope = {
    version: 1,
    ciphertextB64: encrypted.ciphertextB64,
    ivB64: encrypted.ivB64,
    authTagB64: encrypted.authTagB64,
    connectedEmail: connection.connectedEmail ?? null,
    connectedAtIso: connection.connectedAtIso ?? new Date().toISOString(),
  };

  await updateBookingSetupData(ownerId, (current) => {
    const auth = current.meetingProviderAuth && typeof current.meetingProviderAuth === "object" && !Array.isArray(current.meetingProviderAuth)
      ? { ...(current.meetingProviderAuth as Record<string, unknown>) }
      : {};
    auth[provider] = envelope;
    return { ...current, meetingProviderAuth: auth };
  });
}

export async function clearBookingMeetingIntegration(ownerId: string, provider: BookingMeetingOauthProvider) {
  await updateBookingSetupData(ownerId, (current) => {
    const auth = current.meetingProviderAuth && typeof current.meetingProviderAuth === "object" && !Array.isArray(current.meetingProviderAuth)
      ? { ...(current.meetingProviderAuth as Record<string, unknown>) }
      : {};
    delete auth[provider];
    return { ...current, meetingProviderAuth: auth };
  });
}

async function readProviderConnection(ownerId: string, provider: BookingMeetingOauthProvider): Promise<StoredBookingMeetingConnection | null> {
  const existing = await readBookingSetupRow(ownerId).catch(() => null);
  const current = parseBookingServiceData(existing?.dataJson);
  const envelope = getEnvelopeForProvider(current, provider);
  if (!envelope) return null;

  const decrypted = decryptStringV1({
    version: 1,
    ciphertextB64: envelope.ciphertextB64,
    ivB64: envelope.ivB64,
    authTagB64: envelope.authTagB64,
  });

  if (!decrypted) return null;
  const parsed = JSON.parse(decrypted) as StoredBookingMeetingConnection | null;
  if (!parsed?.refreshToken) return null;
  return parsed;
}

function buildGoogleRedirectUri(origin?: string) {
  return `${String(origin || getAppBaseUrl()).replace(/\/$/, "")}/api/portal/booking/integrations/google_meet/callback`;
}

function buildZoomRedirectUri(origin?: string) {
  return `${String(origin || getAppBaseUrl()).replace(/\/$/, "")}/api/portal/booking/integrations/zoom/callback`;
}

export function getBookingMeetingProviderConnectUrl(provider: BookingMeetingOauthProvider, opts: { state: string; origin?: string }) {
  const config = providerConfig(provider);
  if (!config.clientId || !config.clientSecret) {
    throw new BookingMeetingIntegrationError(`OAuth is not configured for ${provider}.`, 500);
  }

  if (provider === "zoom") {
    const redirectUri = buildZoomRedirectUri(opts.origin);
    const url = new URL("https://zoom.us/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", opts.state);
    return url.toString();
  }

  const redirectUri = buildGoogleRedirectUri(opts.origin);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", opts.state);
  return url.toString();
}

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<StoredBookingMeetingConnection> {
  const config = providerConfig("google_meet");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => null)) as any;
  if (!tokenRes.ok || !tokenBody?.access_token || !tokenBody?.refresh_token) {
    throw new BookingMeetingIntegrationError(tokenBody?.error_description || "Could not connect Google Meet.");
  }

  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const profileBody = (await profileRes.json().catch(() => null)) as any;

  return {
    provider: "google_meet",
    refreshToken: tokenBody.refresh_token,
    accessToken: tokenBody.access_token,
    accessTokenExpiresAt: tokenBody.expires_in ? new Date(Date.now() + Number(tokenBody.expires_in) * 1000).toISOString() : null,
    connectedEmail: typeof profileBody?.email === "string" ? profileBody.email : null,
    connectedAtIso: new Date().toISOString(),
  };
}

async function exchangeZoomCode(code: string, redirectUri: string): Promise<StoredBookingMeetingConnection> {
  const config = providerConfig("zoom");
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const tokenUrl = new URL("https://zoom.us/oauth/token");
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  const tokenRes = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  const tokenBody = (await tokenRes.json().catch(() => null)) as any;
  if (!tokenRes.ok || !tokenBody?.access_token || !tokenBody?.refresh_token) {
    throw new BookingMeetingIntegrationError(tokenBody?.reason || tokenBody?.message || "Could not connect Zoom.");
  }

  const profileRes = await fetch("https://api.zoom.us/v2/users/me", {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const profileBody = (await profileRes.json().catch(() => null)) as any;

  return {
    provider: "zoom",
    refreshToken: tokenBody.refresh_token,
    accessToken: tokenBody.access_token,
    accessTokenExpiresAt: tokenBody.expires_in ? new Date(Date.now() + Number(tokenBody.expires_in) * 1000).toISOString() : null,
    connectedEmail: typeof profileBody?.email === "string" ? profileBody.email : null,
    connectedAtIso: new Date().toISOString(),
  };
}

export async function completeBookingMeetingOauthConnection(opts: {
  ownerId: string;
  provider: BookingMeetingOauthProvider;
  code: string;
  origin?: string;
}) {
  const redirectUri = opts.provider === "zoom" ? buildZoomRedirectUri(opts.origin) : buildGoogleRedirectUri(opts.origin);
  const connection = opts.provider === "zoom" ? await exchangeZoomCode(opts.code, redirectUri) : await exchangeGoogleCode(opts.code, redirectUri);
  await storeProviderConnection(opts.ownerId, opts.provider, connection);
  return getBookingMeetingIntegrationStatus(opts.ownerId);
}

async function refreshGoogleConnection(ownerId: string, connection: StoredBookingMeetingConnection) {
  const config = providerConfig("google_meet");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => null)) as any;
  if (!tokenRes.ok || !tokenBody?.access_token) {
    throw new BookingMeetingIntegrationError(tokenBody?.error_description || "Could not refresh Google Meet connection.");
  }

  const next: StoredBookingMeetingConnection = {
    ...connection,
    accessToken: tokenBody.access_token,
    accessTokenExpiresAt: tokenBody.expires_in ? new Date(Date.now() + Number(tokenBody.expires_in) * 1000).toISOString() : null,
    refreshToken: tokenBody.refresh_token || connection.refreshToken,
  };
  await storeProviderConnection(ownerId, "google_meet", next);
  return next;
}

async function refreshZoomConnection(ownerId: string, connection: StoredBookingMeetingConnection) {
  const config = providerConfig("zoom");
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const tokenUrl = new URL("https://zoom.us/oauth/token");
  tokenUrl.searchParams.set("grant_type", "refresh_token");
  tokenUrl.searchParams.set("refresh_token", connection.refreshToken);
  const tokenRes = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  const tokenBody = (await tokenRes.json().catch(() => null)) as any;
  if (!tokenRes.ok || !tokenBody?.access_token) {
    throw new BookingMeetingIntegrationError(tokenBody?.reason || tokenBody?.message || "Could not refresh Zoom connection.");
  }

  const next: StoredBookingMeetingConnection = {
    ...connection,
    accessToken: tokenBody.access_token,
    accessTokenExpiresAt: tokenBody.expires_in ? new Date(Date.now() + Number(tokenBody.expires_in) * 1000).toISOString() : null,
    refreshToken: tokenBody.refresh_token || connection.refreshToken,
  };
  await storeProviderConnection(ownerId, "zoom", next);
  return next;
}

async function getFreshAccessToken(ownerId: string, provider: BookingMeetingOauthProvider) {
  const connection = await readProviderConnection(ownerId, provider);
  if (!connection) {
    throw new BookingMeetingIntegrationError(
      provider === "zoom" ? "Connect your Zoom account before using Zoom meetings." : "Connect your Google account before using Google Meet.",
    );
  }

  const expiresAt = connection.accessTokenExpiresAt ? new Date(connection.accessTokenExpiresAt).getTime() : 0;
  if (connection.accessToken && expiresAt > Date.now() + 60_000) {
    return connection.accessToken;
  }

  const refreshed = provider === "zoom"
    ? await refreshZoomConnection(ownerId, connection)
    : await refreshGoogleConnection(ownerId, connection);
  if (!refreshed.accessToken) {
    throw new BookingMeetingIntegrationError("Connected account did not return an access token.");
  }
  return refreshed.accessToken;
}

export async function createNativeBookingMeeting(opts: {
  ownerId: string;
  provider: Extract<BookingMeetingOauthProvider, "zoom" | "google_meet">;
  title: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  attendeeName: string;
}) {
  if (opts.provider === "zoom") {
    const accessToken = await getFreshAccessToken(opts.ownerId, "zoom");
    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        topic: opts.title,
        type: 2,
        start_time: opts.startAt.toISOString(),
        duration: Math.max(15, Math.ceil((opts.endAt.getTime() - opts.startAt.getTime()) / 60000)),
        timezone: opts.timeZone,
        agenda: `Booked by ${opts.attendeeName}`,
        settings: {
          join_before_host: false,
          waiting_room: true,
        },
      }),
    });
    const body = (await res.json().catch(() => null)) as any;
    if (!res.ok || typeof body?.join_url !== "string") {
      throw new BookingMeetingIntegrationError(body?.message || "Zoom could not create the meeting.");
    }
    return { joinUrl: body.join_url as string };
  }

  const accessToken = await getFreshAccessToken(opts.ownerId, "google_meet");
  const requestId = randomUUID();
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      summary: opts.title,
      description: `Booked by ${opts.attendeeName}`,
      start: { dateTime: opts.startAt.toISOString(), timeZone: opts.timeZone },
      end: { dateTime: opts.endAt.toISOString(), timeZone: opts.timeZone },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
  });
  const body = (await res.json().catch(() => null)) as any;
  const entryPoint = Array.isArray(body?.conferenceData?.entryPoints)
    ? body.conferenceData.entryPoints.find((entry: any) => typeof entry?.uri === "string")
    : null;
  const joinUrl = typeof body?.hangoutLink === "string" ? body.hangoutLink : typeof entryPoint?.uri === "string" ? entryPoint.uri : null;
  if (!res.ok || !joinUrl) {
    throw new BookingMeetingIntegrationError(body?.error?.message || "Google Meet could not create the meeting.");
  }
  return { joinUrl };
}
