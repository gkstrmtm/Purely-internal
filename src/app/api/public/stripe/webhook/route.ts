import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { dbHasCreditFunnelEventTable, trackCreditFunnelEvent } from "@/lib/funnelEventTracking";
import { getStripeWebhookSigningSecretForOwner } from "@/lib/stripeIntegration.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

type StripeEventPayload = {
  id?: unknown;
  type?: unknown;
  data?: {
    object?: Record<string, unknown> | null;
  } | null;
};

type ResolvedStripeCheckoutContext = {
  ownerId: string;
  funnelId: string;
  pageId: string | null;
  checkoutSessionId: string | null;
  path: string | null;
  source: string | null;
  sessionId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  paymentStatus: string | null;
};

function cleanText(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNullableText(value: unknown, max = 240): string | null {
  const next = cleanText(value, max);
  return next || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseStripeSignatureHeader(header: string | null) {
  const value = String(header || "").trim();
  if (!value) return null;

  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of value.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    const key = String(rawKey || "").trim();
    const token = String(rawValue || "").trim();
    if (!key || !token) continue;
    if (key === "t") timestamp = Number.parseInt(token, 10);
    if (key === "v1") signatures.push(token);
  }

  if (!Number.isFinite(timestamp) || timestamp <= 0 || !signatures.length) return null;
  return { timestamp, signatures };
}

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyStripeSignature(input: { payloadRaw: string; signatureHeader: string | null; signingSecret: string }) {
  const parsed = parseStripeSignatureHeader(input.signatureHeader);
  if (!parsed) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp);
  if (ageSeconds > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const signedPayload = `${parsed.timestamp}.${input.payloadRaw}`;
  const expected = crypto.createHmac("sha256", input.signingSecret).update(signedPayload, "utf8").digest("hex");
  return parsed.signatures.some((signature) => safeEqualHex(signature, expected));
}

function eventTypeFromStripeEvent(payload: StripeEventPayload): "checkout_completed" | "checkout_failed" | null {
  const type = cleanText(payload?.type, 120);
  const object = asRecord(payload?.data?.object);
  const paymentStatus = cleanText(object?.payment_status, 80);

  if (type === "checkout.session.async_payment_succeeded") return "checkout_completed";
  if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") return "checkout_failed";
  if (type === "checkout.session.completed") {
    if (paymentStatus === "paid" || paymentStatus === "no_payment_required") return "checkout_completed";
    return null;
  }
  return null;
}

async function findStripeWebhookOwnerContext(payload: StripeEventPayload): Promise<ResolvedStripeCheckoutContext | null> {
  const object = asRecord(payload?.data?.object);
  if (!object) return null;

  const metadata = asRecord(object.metadata);
  const pageId = cleanText(metadata?.funnel_page_id ?? object.client_reference_id, 64);
  const funnelIdHint = cleanText(metadata?.funnel_id, 64);

  if (!pageId && !funnelIdHint) return null;

  if (pageId) {
    const page = await prisma.creditFunnelPage.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        funnelId: true,
        funnel: { select: { ownerId: true } },
      },
    }).catch(() => null);

    if (page?.funnel?.ownerId) {
      if (funnelIdHint && page.funnelId !== funnelIdHint) return null;
      return {
        ownerId: page.funnel.ownerId,
        funnelId: page.funnelId,
        pageId: page.id,
        checkoutSessionId: cleanNullableText(object.id, 120),
        path: cleanNullableText(metadata?.tracking_path, 400),
        source: cleanNullableText(metadata?.tracking_source, 80) || "stripe_webhook",
        sessionId: cleanNullableText(metadata?.tracking_session_id, 120),
        utmSource: cleanNullableText(metadata?.utm_source, 200),
        utmMedium: cleanNullableText(metadata?.utm_medium, 200),
        utmCampaign: cleanNullableText(metadata?.utm_campaign, 200),
        utmContent: cleanNullableText(metadata?.utm_content, 200),
        utmTerm: cleanNullableText(metadata?.utm_term, 200),
        paymentStatus: cleanNullableText(object.payment_status, 80),
      };
    }
  }

  if (!funnelIdHint) return null;
  const funnel = await prisma.creditFunnel.findUnique({
    where: { id: funnelIdHint },
    select: { id: true, ownerId: true },
  }).catch(() => null);
  if (!funnel?.ownerId) return null;

  return {
    ownerId: funnel.ownerId,
    funnelId: funnel.id,
    pageId: pageId || null,
    checkoutSessionId: cleanNullableText(object.id, 120),
    path: cleanNullableText(metadata?.tracking_path, 400),
    source: cleanNullableText(metadata?.tracking_source, 80) || "stripe_webhook",
    sessionId: cleanNullableText(metadata?.tracking_session_id, 120),
    utmSource: cleanNullableText(metadata?.utm_source, 200),
    utmMedium: cleanNullableText(metadata?.utm_medium, 200),
    utmCampaign: cleanNullableText(metadata?.utm_campaign, 200),
    utmContent: cleanNullableText(metadata?.utm_content, 200),
    utmTerm: cleanNullableText(metadata?.utm_term, 200),
    paymentStatus: cleanNullableText(object.payment_status, 80),
  };
}

async function alreadyTrackedCheckoutEvent(checkoutSessionId: string | null, eventType: "checkout_completed" | "checkout_failed") {
  if (!checkoutSessionId) return false;
  if (!(await dbHasCreditFunnelEventTable())) return false;

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: number }>>`
      SELECT 1 as "exists"
      FROM "CreditFunnelEvent"
      WHERE "checkoutSessionId" = ${checkoutSessionId}
        AND "eventType" = ${eventType}
      LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const payloadRaw = await req.text().catch(() => "");
  if (!payloadRaw) {
    return NextResponse.json({ ok: false, error: "Missing body" }, { status: 400 });
  }

  const parsedPayload = (() => {
    try {
      return JSON.parse(payloadRaw) as StripeEventPayload;
    } catch {
      return null;
    }
  })();
  if (!parsedPayload) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const resolved = await findStripeWebhookOwnerContext(parsedPayload);
  if (!resolved?.ownerId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "unmatched_event" });
  }

  const signingSecret = await getStripeWebhookSigningSecretForOwner(resolved.ownerId).catch(() => null);
  if (!signingSecret) {
    return NextResponse.json({ ok: false, error: "Stripe webhook signing secret is not configured" }, { status: 400 });
  }

  const isValid = verifyStripeSignature({
    payloadRaw,
    signatureHeader: req.headers.get("stripe-signature"),
    signingSecret,
  });
  if (!isValid) {
    return NextResponse.json({ ok: false, error: "Invalid Stripe signature" }, { status: 400 });
  }

  const eventType = eventTypeFromStripeEvent(parsedPayload);
  if (!eventType) {
    return NextResponse.json({ ok: true, ignored: true, reason: "unsupported_event" });
  }

  if (await alreadyTrackedCheckoutEvent(resolved.checkoutSessionId, eventType)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await trackCreditFunnelEvent({
    ownerId: resolved.ownerId,
    funnelId: resolved.funnelId,
    pageId: resolved.pageId,
    eventType,
    eventPath: resolved.path,
    source: resolved.source || "stripe_webhook",
    sessionId: resolved.sessionId,
    utmSource: resolved.utmSource,
    utmMedium: resolved.utmMedium,
    utmCampaign: resolved.utmCampaign,
    utmContent: resolved.utmContent,
    utmTerm: resolved.utmTerm,
    checkoutSessionId: resolved.checkoutSessionId,
    payloadJson: {
      stripeEventId: cleanNullableText(parsedPayload.id, 120),
      stripeEventType: cleanNullableText(parsedPayload.type, 120),
      paymentStatus: resolved.paymentStatus,
    },
  });

  return NextResponse.json({ ok: true });
}