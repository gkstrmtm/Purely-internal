import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { generateText } from "@/lib/ai";
import { getPortalReportingSummaryForOwner } from "@/lib/portalReportingSummary.server";
import { getPortalDashboardMeta, setPortalDashboardAnalysis, type PortalDashboardAnalysis } from "@/lib/portalDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    trigger: z.string().optional(),
  })
  .strict();

function isFresh(iso: string | null | undefined, maxAgeMs: number) {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return Date.now() - d.getTime() <= maxAgeMs;
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const meta = await getPortalDashboardMeta(ownerId);
  return NextResponse.json({ ok: true, analysis: meta.analysis ?? null });
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Avoid regenerating too frequently unless explicitly triggered.
  const meta = await getPortalDashboardMeta(ownerId);
  if (meta.analysis && isFresh(meta.analysis.generatedAtIso, 12 * 60 * 60 * 1000) && parsed.data.trigger !== "force") {
    return NextResponse.json({ ok: true, analysis: meta.analysis });
  }

  const reporting7d = await getPortalReportingSummaryForOwner(ownerId, "7d");

  const system =
    "You are a crisp analytics assistant for a business automation portal. " +
    "Write a short analysis summary based ONLY on the provided metrics. " +
    "No fluff, no hype. Be specific and actionable.";

  const user =
    "Generate an analysis summary. Format:\n" +
    "- Title line\n" +
    "- 3 bullets: what happened\n" +
    "- 3 bullets: what to do next\n" +
    "- One final line: biggest bottleneck\n\n" +
    `Trigger: ${String(parsed.data.trigger || "unknown")}\n\n` +
    `Metrics JSON:\n${JSON.stringify(reporting7d, null, 2)}`;

  let text = "";
  try {
    text = (await generateText({ system, user })).trim();
  } catch (err) {
    console.error("/api/portal/dashboard/analysis: generation failed", err);
    return NextResponse.json({ error: "Unable to generate analysis" }, { status: 502 });
  }

  const analysis: PortalDashboardAnalysis = {
    text: text || "No analysis available.",
    generatedAtIso: new Date().toISOString(),
  };

  const nextMeta = await setPortalDashboardAnalysis(ownerId, analysis);
  return NextResponse.json({ ok: true, analysis: nextMeta.analysis ?? analysis });
}
