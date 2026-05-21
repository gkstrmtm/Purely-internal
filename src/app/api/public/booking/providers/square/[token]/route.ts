import { NextResponse } from "next/server";

import { findOwnerByExternalBookingProviderWebhookToken, readExternalBookingProviderSigningKey } from "@/lib/externalBookingProviderConnection.server";
import {
  captureVerifiedExternalBookingProviderEvent,
  normalizeSquareBookingWebhookEvent,
  verifySquareWebhookSignature,
} from "@/lib/externalBookingProviderEvents.server";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const owner = await findOwnerByExternalBookingProviderWebhookToken("square", token);
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Unknown provider webhook" }, { status: 404 });
  }

  if (!owner.connection.connected) {
    return NextResponse.json(
      { ok: false, error: owner.connection.blocker || "Provider confirmation is not connected." },
      { status: 503 },
    );
  }

  const signingKey = await readExternalBookingProviderSigningKey(owner.ownerId, "square");
  if (!signingKey) {
    return NextResponse.json({ ok: false, error: "Provider signing key is unavailable." }, { status: 503 });
  }

  const rawPayload = await req.text();
  const notificationUrl = toPurelyHostedUrl(`/api/public/booking/providers/square/${encodeURIComponent(token)}`);
  const signatureHeader = req.headers.get("x-square-hmacsha256-signature");
  if (!verifySquareWebhookSignature({ signatureHeader, notificationUrl, requestBody: rawPayload, signingKey })) {
    return NextResponse.json({ ok: false, error: "Invalid Square signature" }, { status: 403 });
  }

  const payload = rawPayload
    ? (() => {
        try {
          return JSON.parse(rawPayload);
        } catch {
          return null;
        }
      })()
    : null;
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Invalid Square payload" }, { status: 400 });
  }
  const normalized = await normalizeSquareBookingWebhookEvent({ ownerId: owner.ownerId, payload, rawPayload });
  if (!normalized) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
  }

  const result = await captureVerifiedExternalBookingProviderEvent(normalized);
  return NextResponse.json({ ok: true, result });
}