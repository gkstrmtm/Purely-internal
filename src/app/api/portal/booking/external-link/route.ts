import { NextResponse } from "next/server";
import { z } from "zod";

import { getExternalBookingConfirmationSetupForOwner } from "@/lib/externalBookingConfirmation";
import { getExternalBookingProviderConnectionReadiness } from "@/lib/externalBookingProviderConnection.server";
import { listExternalBookingProviderCapabilities } from "@/lib/externalBookingProviderCapabilities";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getExternalBookingHandoffSummaryForOwner } from "@/lib/externalBookingHandoffReporting";
import {
  detectExternalBookingProvider,
  getExternalBookingLinkConfig,
  parseExternalBookingLinkConfig,
  setExternalBookingLinkConfig,
} from "@/lib/externalBookingLink";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  enabled: z.boolean().optional(),
  sourceUrl: z.string().trim().max(1500).optional(),
  offerName: z.string().trim().max(120).optional(),
  goal: z.enum(["more_bookings", "more_leads", "fewer_no_shows", "more_reviews", "more_repeat_visits"]).optional(),
  handoffMode: z.enum(["direct_book", "lead_first"]).optional(),
});

export async function GET() {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const config = await getExternalBookingLinkConfig(auth.session.user.id);
  const summary = await getExternalBookingHandoffSummaryForOwner(auth.session.user.id);
  const confirmation = await getExternalBookingConfirmationSetupForOwner(auth.session.user.id, { config });
  const providerReadiness = await getExternalBookingProviderConnectionReadiness(auth.session.user.id, config.providerKey, { config });
  return NextResponse.json({ ok: true, externalLink: config, summary, confirmation, providerReadiness, providerCapabilities: listExternalBookingProviderCapabilities() });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("booking", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const current = await getExternalBookingLinkConfig(auth.session.user.id);
  const next = parseExternalBookingLinkConfig({
    ...current,
    ...parsed.data,
  });

  if (parsed.data.sourceUrl && !next.normalizedUrl) {
    return NextResponse.json({ error: "Enter a valid booking page URL." }, { status: 400 });
  }

  const saved = await setExternalBookingLinkConfig(auth.session.user.id, next);
  const summary = await getExternalBookingHandoffSummaryForOwner(auth.session.user.id);
  const confirmation = await getExternalBookingConfirmationSetupForOwner(auth.session.user.id, { config: saved });
  const providerReadiness = await getExternalBookingProviderConnectionReadiness(auth.session.user.id, saved.providerKey, { config: saved });
  return NextResponse.json({
    ok: true,
    externalLink: saved,
    summary,
    confirmation,
    providerReadiness,
    providerCapabilities: listExternalBookingProviderCapabilities(),
    detection: detectExternalBookingProvider(saved.normalizedUrl || saved.sourceUrl),
  });
}