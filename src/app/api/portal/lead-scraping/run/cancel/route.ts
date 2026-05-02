import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeLeadScrapeRunId, requestLeadScrapeRunCancellation } from "@/lib/leadScrapeRunControl";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  runId: z.string().trim().min(1).max(80),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("leadScraping");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const runId = normalizeLeadScrapeRunId(parsed.data.runId);
  if (!runId) {
    return NextResponse.json({ ok: false, error: "Invalid run id" }, { status: 400 });
  }

  const requested = await requestLeadScrapeRunCancellation(auth.session.user.id, runId).catch(() => false);
  if (!requested) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, runId });
}
