import { NextResponse } from "next/server";

import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { getCreditFunnelBuilderSettings, mutateCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { fetchFunnelExhibitArchetypePack, buildExhibitArchetypeSeedPrompt } from "@/lib/funnelExhibitArchetypePack.server";
import { readFunnelExhibitArchetypePack, writeFunnelExhibitArchetypePack } from "@/lib/funnelExhibitArchetypes";
import { readFunnelBrief } from "@/lib/funnelPageIntent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanText(value: unknown, max = 2400) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function GET(_req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId } = await ctx.params;
  const id = String(funnelId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id, ownerId: auth.session.user.id },
    select: { id: true, slug: true, name: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const settings = await getCreditFunnelBuilderSettings(auth.session.user.id).catch(() => ({} as Record<string, unknown>));
  const pack = readFunnelExhibitArchetypePack(settings, funnel.id);

  return NextResponse.json({
    ok: true,
    funnel,
    pack,
    seedPrompt: buildExhibitArchetypeSeedPrompt(),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId } = await ctx.params;
  const id = String(funnelId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id, ownerId: auth.session.user.id },
    select: { id: true, slug: true, name: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const settings = await getCreditFunnelBuilderSettings(auth.session.user.id).catch(() => ({} as Record<string, unknown>));
  const brief = readFunnelBrief(settings, funnel.id);
  const businessContext = await getBusinessProfileAiContext(auth.session.user.id).catch(() => "");
  const prompt = cleanText(body?.prompt, 2400);

  const { pack, promptUsed } = await fetchFunnelExhibitArchetypePack({
    prompt,
    funnelName: funnel.name,
    routeLabel: `/${funnel.slug}`,
    audience: brief?.audienceSummary,
    offer: brief?.offerSummary,
    primaryCta: "",
    brief,
    businessContext,
  });

  await mutateCreditFunnelBuilderSettings(auth.session.user.id, (current) => ({
    next: writeFunnelExhibitArchetypePack(current, funnel.id, pack),
    value: true,
  }));

  return NextResponse.json({ ok: true, funnel, pack, promptUsed });
}