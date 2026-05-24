import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getPortalMetaProviderReadiness } from "@/lib/portalMetaIntegration.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const publishSchema = z.object({
  mediaItemId: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();
  const memberId = String((auth.session.user as any)?.memberId || auth.session.user.id || "").trim();
  const portalVariant = String((auth.session.user as any)?.portalVariant || "portal").trim() || "portal";
  const readiness = await getPortalMetaProviderReadiness(ownerId, {
    portalVariant,
    isOwnerSession: Boolean(ownerId && memberId === ownerId),
  });

  return NextResponse.json(
    {
      ok: false,
      code: "meta_provider_coming_soon",
      error: readiness.status === "connected" || readiness.status === "needs_permissions" || readiness.status === "reconnect_required"
        ? "Meta account verification is connected, but direct Facebook and Instagram publishing is still blocked. Purely will only enable posting after permissions and app review are ready. Until then, use manual posting from Media Library."
        : "Meta direct publishing is not available yet. Connect your own Facebook Page and Instagram professional account when this is enabled. Purely will never post without your approval. Until then, use manual posting from Media Library.",
      mediaItemId: parsed.data.mediaItemId,
      readiness,
    },
    { status: 409 },
  );
}