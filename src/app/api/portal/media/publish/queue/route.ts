import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { queuePortalMediaPublishJob } from "@/lib/portalMediaPublishing.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const queueSchema = z.object({
  mediaItemId: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = queueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();
  const memberId = String((auth.session.user as any)?.memberId || auth.session.user.id || "").trim();
  const portalVariant = String((auth.session.user as any)?.portalVariant || "portal").trim() === "credit" ? "credit" : "portal";

  const result = await queuePortalMediaPublishJob(ownerId, parsed.data.mediaItemId, {
    portalVariant,
    isOwnerSession: Boolean(ownerId && memberId === ownerId),
  });

  return NextResponse.json({
    ok: true,
    outcome: result.outcome,
    reason: result.reason,
    growthProfile: result.growthProfile,
  });
}
