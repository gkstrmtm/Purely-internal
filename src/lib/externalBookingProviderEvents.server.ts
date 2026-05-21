import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { getExternalBookingLinkConfig, type ExternalBookingProviderKey } from "@/lib/externalBookingLink";
import { findOrCreatePortalContact, normalizeEmailKey, normalizePhoneKey } from "@/lib/portalContacts";
import { ensurePortalBookingExternalConfirmationEventsSchema } from "@/lib/portalBookingExternalConfirmationEventsSchema";
import { recordPortalContactServiceTrigger } from "@/lib/portalContactServiceTriggers";

export type ExternalBookingProviderEventStatus = "confirmed" | "canceled" | "rescheduled";

type ExternalBookingProviderEventIdentity = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

type CapturableProviderEventInput = {
  ownerId: string;
  providerKey: ExternalBookingProviderKey;
  providerLabel: string;
  providerEventId: string;
  providerEventType: string;
  externalBookingId: string | null;
  providerReference: string | null;
  status: ExternalBookingProviderEventStatus;
  providerOccurredAt: Date | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  verificationMethod: string;
  rawPayload: string;
  safeMeta: Record<string, string | null>;
  identity: ExternalBookingProviderEventIdentity;
};

export type CapturedProviderEventResult = {
  ok: true;
  deduped: boolean;
  status: ExternalBookingProviderEventStatus;
  providerEventId: string;
  externalBookingId: string | null;
  contactId: string | null;
  handoffEventId: string | null;
  confirmedAt: string;
};

function normalizeString(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeNullableString(value: unknown, max = 240): string | null {
  const next = normalizeString(value, max);
  return next || null;
}

function safeJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readNested(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
      current = current[index];
      continue;
    }
    const record = safeJsonObject(current);
    if (!record) return null;
    current = record[key];
  }
  return current;
}

function readFirstString(value: unknown, paths: string[][], max = 240): string | null {
  for (const path of paths) {
    const next = normalizeNullableString(readNested(value, path), max);
    if (next) return next;
  }
  return null;
}

function readFirstDate(value: unknown, paths: string[][]): Date | null {
  for (const path of paths) {
    const raw = normalizeNullableString(readNested(value, path), 120);
    if (!raw) continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function hashPayload(rawPayload: string): string {
  return crypto.createHash("sha256").update(rawPayload).digest("hex").slice(0, 40);
}

function base64Signature(secret: string, notificationUrl: string, requestBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${notificationUrl}${requestBody}`).digest("base64");
}

function timingSafeCompareBase64(a: string, b: string): boolean {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function verifySquareWebhookSignature(input: {
  signatureHeader: string | null;
  notificationUrl: string;
  requestBody: string;
  signingKey: string;
}): boolean {
  const signatureHeader = normalizeString(input.signatureHeader, 400);
  const signingKey = normalizeString(input.signingKey, 400);
  if (!signatureHeader || !signingKey || !input.notificationUrl || !input.requestBody) return false;
  const expected = base64Signature(signingKey, input.notificationUrl, input.requestBody);
  return timingSafeCompareBase64(expected, signatureHeader);
}

async function findExistingProviderEvent(ownerId: string, providerKey: ExternalBookingProviderKey, providerEventId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; confirmedAt: Date }>>(
    `
SELECT "id", "confirmedAt"
FROM "PortalBookingExternalConfirmationEvent"
WHERE "ownerId" = $1 AND "providerKey" = $2 AND "providerEventId" = $3
LIMIT 1;
    `,
    ownerId,
    providerKey,
    providerEventId,
  );
  return rows?.[0] ?? null;
}

async function findLatestProviderBookingSnapshot(ownerId: string, providerKey: ExternalBookingProviderKey, externalBookingId: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ bookingStatus: string | null; scheduledStartAt: Date | null; scheduledEndAt: Date | null }>
  >(
    `
SELECT "bookingStatus", "scheduledStartAt", "scheduledEndAt"
FROM "PortalBookingExternalConfirmationEvent"
WHERE "ownerId" = $1 AND "providerKey" = $2 AND "externalBookingId" = $3
ORDER BY COALESCE("providerOccurredAt", "confirmedAt") DESC, "confirmedAt" DESC
LIMIT 1;
    `,
    ownerId,
    providerKey,
    externalBookingId,
  );
  return rows?.[0] ?? null;
}

async function resolveSiteContext(ownerId: string) {
  const [site, user, config] = await Promise.all([
    prisma.portalBookingSite.findFirst({ where: { ownerId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: ownerId }, select: { clientPortalVariant: true } }).catch(() => null),
    getExternalBookingLinkConfig(ownerId).catch(() => null),
  ]);

  return {
    siteId: site?.id ? String(site.id) : null,
    portalVariant:
      user?.clientPortalVariant === "CREDIT" ? "CREDIT" : user?.clientPortalVariant === "PORTAL" ? "PORTAL" : null,
    externalUrlHost: (() => {
      const raw = String(config?.normalizedUrl || config?.sourceUrl || "").trim();
      if (!raw) return "";
      try {
        return new URL(raw).host.toLowerCase();
      } catch {
        return "";
      }
    })(),
  };
}

async function resolveContactId(ownerId: string, identity: ExternalBookingProviderEventIdentity): Promise<string | null> {
  const email = identity.email ? normalizeEmailKey(identity.email) : null;
  const phoneNorm = identity.phone ? normalizePhoneKey(identity.phone) : { phone: null, phoneKey: null };
  const name = normalizeString(identity.name, 80) || email || phoneNorm.phone || "";
  if (!name || (!email && !phoneNorm.phone)) return null;
  return findOrCreatePortalContact({ ownerId, name, email, phone: phoneNorm.phone }).catch(() => null);
}

async function resolveHandoffEventId(ownerId: string, providerKey: ExternalBookingProviderKey, contactId: string | null) {
  if (!contactId) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
SELECT "id"
FROM "PortalBookingExternalLinkEvent"
WHERE "ownerId" = $1 AND "providerKey" = $2 AND "contactId" = $3
ORDER BY "clickedAt" DESC
LIMIT 1;
    `,
    ownerId,
    providerKey,
    contactId,
  );
  return rows?.[0]?.id ? String(rows[0].id) : null;
}

export async function captureVerifiedExternalBookingProviderEvent(
  input: CapturableProviderEventInput,
): Promise<CapturedProviderEventResult> {
  await ensurePortalBookingExternalConfirmationEventsSchema().catch(() => null);

  const duplicate = await findExistingProviderEvent(input.ownerId, input.providerKey, input.providerEventId).catch(() => null);
  if (duplicate?.id) {
    return {
      ok: true,
      deduped: true,
      status: input.status,
      providerEventId: input.providerEventId,
      externalBookingId: input.externalBookingId,
      contactId: null,
      handoffEventId: null,
      confirmedAt: new Date(duplicate.confirmedAt).toISOString(),
    };
  }

  const context = await resolveSiteContext(input.ownerId);
  const contactId = await resolveContactId(input.ownerId, input.identity).catch(() => null);
  const handoffEventId = await resolveHandoffEventId(input.ownerId, input.providerKey, contactId).catch(() => null);
  const payloadHash = hashPayload(input.rawPayload);
  const safeMeta = JSON.stringify(
    Object.fromEntries(Object.entries(input.safeMeta).filter(([, value]) => Boolean(value)).slice(0, 20)),
  );

  const rows = await prisma.$queryRawUnsafe<Array<{ confirmedAt: Date }>>(
    `
INSERT INTO "PortalBookingExternalConfirmationEvent" (
  "id",
  "ownerId",
  "siteId",
  "contactId",
  "handoffEventId",
  "portalVariant",
  "confirmationKind",
  "bookingStatus",
  "providerKey",
  "providerLabel",
  "externalUrlHost",
  "providerEventId",
  "providerEventType",
  "externalBookingId",
  "providerReference",
  "confirmationTokenHash",
  "payloadHash",
  "verificationMethod",
  "metaJson",
  "scheduledStartAt",
  "scheduledEndAt",
  "providerOccurredAt"
) VALUES (
  $1, $2, $3, $4, $5, $6::"ClientPortalVariant", 'provider_webhook', $7, $8, $9, $10, $11, $12, $13, $14, '', $15, $16, $17::jsonb, $18, $19, $20
)
RETURNING "confirmedAt";
    `,
    crypto.randomUUID(),
    input.ownerId,
    context.siteId,
    contactId,
    handoffEventId,
    context.portalVariant,
    input.status,
    input.providerKey,
    input.providerLabel,
    context.externalUrlHost,
    input.providerEventId,
    input.providerEventType,
    input.externalBookingId,
    input.providerReference,
    payloadHash,
    input.verificationMethod,
    safeMeta === "{}" ? null : safeMeta,
    input.scheduledStartAt,
    input.scheduledEndAt,
    input.providerOccurredAt,
  );

  if (contactId && input.status === "confirmed") {
    await recordPortalContactServiceTrigger({ ownerId: input.ownerId, contactId, serviceSlug: "booking-external-provider-confirmed" }).catch(() => null);
  }

  return {
    ok: true,
    deduped: false,
    status: input.status,
    providerEventId: input.providerEventId,
    externalBookingId: input.externalBookingId,
    contactId,
    handoffEventId,
    confirmedAt: rows?.[0]?.confirmedAt ? new Date(rows[0].confirmedAt).toISOString() : new Date().toISOString(),
  };
}

export async function normalizeSquareBookingWebhookEvent(input: {
  ownerId: string;
  payload: unknown;
  rawPayload: string;
}): Promise<CapturableProviderEventInput | null> {
  const eventId = readFirstString(input.payload, [["event_id"], ["eventId"], ["id"]], 160);
  const eventType = readFirstString(input.payload, [["type"], ["event_type"]], 160);
  if (!eventId || !eventType || !/^booking\.(created|updated)$/i.test(eventType)) return null;

  const bookingRoot =
    readNested(input.payload, ["data", "object", "booking"]) ??
    readNested(input.payload, ["data", "object"]) ??
    readNested(input.payload, ["data", "booking"]) ??
    readNested(input.payload, ["object", "booking"]) ??
    readNested(input.payload, ["object"]);
  const externalBookingId = readFirstString(
    bookingRoot,
    [["id"], ["booking_id"], ["bookingId"]],
    160,
  ) ?? readFirstString(input.payload, [["data", "id"]], 160);
  const providerOccurredAt = readFirstDate(input.payload, [["created_at"], ["createdAt"], ["data", "created_at"], ["data", "createdAt"]]);
  const scheduledStartAt = readFirstDate(
    bookingRoot,
    [["start_at"], ["startAt"], ["appointment_segments", "0", "start_at"], ["appointmentSegments", "0", "startAt"]],
  );
  const scheduledEndAt = readFirstDate(
    bookingRoot,
    [["end_at"], ["endAt"], ["appointment_segments", "0", "end_at"], ["appointmentSegments", "0", "endAt"]],
  );
  const statusRaw = readFirstString(bookingRoot, [["status"], ["booking_status"], ["state"]], 80) ?? "";
  const normalizedStatus = statusRaw.toLowerCase();
  const previous = externalBookingId
    ? await findLatestProviderBookingSnapshot(input.ownerId, "square", externalBookingId).catch(() => null)
    : null;
  const status: ExternalBookingProviderEventStatus =
    /^booking\.created$/i.test(eventType)
      ? "confirmed"
      : /(cancel|declin|no_show)/i.test(normalizedStatus)
        ? "canceled"
        : previous?.scheduledStartAt && scheduledStartAt && previous.scheduledStartAt.getTime() !== scheduledStartAt.getTime()
          ? "rescheduled"
          : previous?.scheduledEndAt && scheduledEndAt && previous.scheduledEndAt.getTime() !== scheduledEndAt.getTime()
            ? "rescheduled"
            : "confirmed";

  const customerRoot =
    readNested(bookingRoot, ["customer_details"]) ??
    readNested(bookingRoot, ["customerDetails"]) ??
    readNested(bookingRoot, ["customer"]) ??
    readNested(input.payload, ["data", "object", "customer"]) ??
    readNested(input.payload, ["data", "object", "customer_details"]);
  const name =
    readFirstString(customerRoot, [["name"], ["full_name"], ["fullName"]], 80) ||
    [
      readFirstString(customerRoot, [["given_name"], ["givenName"], ["first_name"], ["firstName"]], 40),
      readFirstString(customerRoot, [["family_name"], ["familyName"], ["last_name"], ["lastName"]], 40),
    ]
      .filter(Boolean)
      .join(" ") ||
    null;
  const email = readFirstString(customerRoot, [["email_address"], ["emailAddress"], ["email"]], 120);
  const phone = readFirstString(customerRoot, [["phone_number"], ["phoneNumber"], ["phone"]], 40);
  const providerReference = externalBookingId || eventId;
  const safeMeta: Record<string, string | null> = {
    eventType,
    squareStatus: statusRaw || null,
    squareCustomerId: readFirstString(bookingRoot, [["customer_id"], ["customerId"]], 160),
    squareLocationId: readFirstString(bookingRoot, [["location_id"], ["locationId"]], 160),
  };

  return {
    ownerId: input.ownerId,
    providerKey: "square",
    providerLabel: "Square Appointments",
    providerEventId: eventId,
    providerEventType: eventType,
    externalBookingId,
    providerReference,
    status,
    providerOccurredAt,
    scheduledStartAt,
    scheduledEndAt,
    verificationMethod: "square_signature",
    rawPayload: input.rawPayload,
    safeMeta,
    identity: {
      name,
      email,
      phone,
    },
  };
}