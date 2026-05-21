import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getExternalBookingProviderConnectionReadiness,
  updateExternalBookingProviderConnection,
} from "@/lib/externalBookingProviderConnection.server";
import type { ExternalBookingProviderKey } from "@/lib/externalBookingLink";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  signingKey: z.string().trim().max(240).optional().nullable(),
  clearSigningKey: z.boolean().optional(),
  regenerateWebhookToken: z.boolean().optional(),
});

function parseProvider(raw: string): ExternalBookingProviderKey | null {
  return raw === "square" || raw === "calendly" || raw === "acuity" || raw === "glossgenius" || raw === "booksy" || raw === "fresha"
    ? raw
    : null;
}

export async function GET(_req: Request, context: { params: Promise<{ provider: string }> }) {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const { provider: providerRaw } = await context.params;
  const provider = parseProvider(providerRaw);
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unsupported provider" }, { status: 400 });
  }

  const readiness = await getExternalBookingProviderConnectionReadiness(auth.session.user.id, provider);
  return NextResponse.json({ ok: true, readiness });
}

export async function PUT(req: Request, context: { params: Promise<{ provider: string }> }) {
  const auth = await requireClientSessionForService("booking", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const { provider: providerRaw } = await context.params;
  const provider = parseProvider(providerRaw);
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unsupported provider" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const readiness = await updateExternalBookingProviderConnection(auth.session.user.id, provider, parsed.data);
    return NextResponse.json({ ok: true, readiness });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update provider connection.";
    const status = /missing portal_encryption_master_key/i.test(message) ? 503 : /unsupported external booking provider/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}