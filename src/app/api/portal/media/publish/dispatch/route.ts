import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { dispatchDuePortalMediaPublishJobs } from "@/lib/portalMediaPublishing.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const dispatchSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
}).optional();

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = dispatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();
  const memberId = String((auth.session.user as any)?.memberId || auth.session.user.id || "").trim();
  const portalVariant = String((auth.session.user as any)?.portalVariant || "portal").trim() === "credit" ? "credit" : "portal";

  const result = await dispatchDuePortalMediaPublishJobs({
    ownerId,
    limit: parsed.data?.limit,
    portalVariant,
    isOwnerSession: Boolean(ownerId && memberId === ownerId),
  });

  return NextResponse.json({
    ok: true,
    processedCount: result.results.length,
    jobs: result.jobs,
    results: result.results,
  });
}
