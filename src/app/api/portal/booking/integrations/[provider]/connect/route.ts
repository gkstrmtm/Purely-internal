import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { getBookingMeetingProviderConnectUrl } from "@/lib/bookingMeetingIntegrations.server";
import type { BookingMeetingOauthProvider } from "@/lib/bookingMeetingIntegrations.shared";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseProvider(raw: string): BookingMeetingOauthProvider | null {
  return raw === "zoom" || raw === "google_meet" ? raw : null;
}

function safeNextPath(raw: string | null) {
  const value = String(raw || "").trim();
  if (!value.startsWith("/")) return "/portal/app/services/booking";
  if (value.startsWith("//")) return "/portal/app/services/booking";
  return value;
}

export async function GET(req: Request, context: { params: Promise<{ provider: string }> }) {
  const auth = await requireClientSessionForService("booking", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const { provider: providerRaw } = await context.params;
  const provider = parseProvider(providerRaw);
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unsupported provider" }, { status: 400 });
  }

  const url = new URL(req.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const state = randomUUID();
  const redirectTo = getBookingMeetingProviderConnectUrl(provider, { state, origin: url.origin });
  const response = NextResponse.redirect(redirectTo, { status: 302 });
  response.cookies.set({
    name: `booking_oauth_${provider}`,
    value: JSON.stringify({ state, nextPath }),
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: `/api/portal/booking/integrations/${provider}/callback`,
    maxAge: 60 * 10,
  });
  return response;
}
