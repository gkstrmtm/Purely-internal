import { NextResponse } from "next/server";

import { completeBookingMeetingOauthConnection } from "@/lib/bookingMeetingIntegrations.server";
import type { BookingMeetingOauthProvider } from "@/lib/bookingMeetingIntegrations.shared";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseProvider(raw: string): BookingMeetingOauthProvider | null {
  return raw === "zoom" || raw === "google_meet" ? raw : null;
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
  const code = String(url.searchParams.get("code") || "").trim();
  const state = String(url.searchParams.get("state") || "").trim();
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )booking_oauth_${provider}=([^;]+)`));
  const stored = match ? JSON.parse(decodeURIComponent(match[1])) as { state?: string; nextPath?: string } : null;
  const nextPath = stored?.nextPath && String(stored.nextPath).startsWith("/") ? stored.nextPath : "/portal/app/services/booking";
  const response = NextResponse.redirect(new URL(nextPath, url.origin), { status: 302 });
  response.cookies.set({
    name: `booking_oauth_${provider}`,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: `/api/portal/booking/integrations/${provider}/callback`,
    maxAge: 0,
  });

  if (!code || !state || !stored?.state || stored.state !== state) {
    return response;
  }

  try {
    await completeBookingMeetingOauthConnection({
      ownerId: auth.session.user.id,
      provider,
      code,
      origin: url.origin,
    });
  } catch {
    return response;
  }

  return response;
}
