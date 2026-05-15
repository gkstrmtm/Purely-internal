import { NextResponse } from "next/server";

import { clearBookingMeetingIntegration, getBookingMeetingIntegrationStatus } from "@/lib/bookingMeetingIntegrations.server";
import type { BookingMeetingOauthProvider } from "@/lib/bookingMeetingIntegrations.shared";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseProvider(raw: string): BookingMeetingOauthProvider | null {
  return raw === "zoom" || raw === "google_meet" ? raw : null;
}

export async function DELETE(_req: Request, context: { params: Promise<{ provider: string }> }) {
  const auth = await requireClientSessionForService("booking", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const { provider: providerRaw } = await context.params;
  const provider = parseProvider(providerRaw);
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unsupported provider" }, { status: 400 });
  }

  await clearBookingMeetingIntegration(auth.session.user.id, provider);
  const integrations = await getBookingMeetingIntegrationStatus(auth.session.user.id);
  return NextResponse.json({ ok: true, integrations });
}