import { NextResponse } from "next/server";

import { getBusinessProfileAiContext, getBusinessProfileFoundationContext } from "@/lib/businessProfileAiContext.server";
import { getCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  inferFunnelBriefProfile,
  inferFunnelPageIntentProfile,
  readFunnelBrief,
  readFunnelPageBrief,
  type FunnelFoundationBusinessContext,
  type FunnelFoundationCapabilityInputs,
} from "@/lib/funnelPageIntent";
import {
  buildFunnelFoundationMaterialHash,
  coerceStoredFunnelFoundationArtifact,
  synthesizeFunnelFoundationArtifact,
} from "@/lib/funnelFoundationArtifact.server";
import {
  applyFoundationArtifactWriteCompat,
  dbHasCreditFunnelPageFoundationArtifactColumns,
  withFoundationArtifactSelect,
} from "@/lib/funnelPageDbCompat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, max = 320) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanGoals(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const out: string[] = [];
  for (const item of value) {
    const next = cleanText(item, 120);
    if (!next || out.includes(next)) continue;
    out.push(next);
    if (out.length >= 6) break;
  }
  return out;
}

function coerceBusinessProfile(raw: unknown): FunnelFoundationBusinessContext | null {
  if (!isRecord(raw)) return null;
  const primaryGoals = cleanGoals(raw.primaryGoals);
  const next = {
    businessName: cleanText(raw.businessName, 200) || null,
    industry: cleanText(raw.industry, 160) || null,
    businessModel: cleanText(raw.businessModel, 200) || null,
    primaryGoals: primaryGoals.length ? primaryGoals : undefined,
    targetCustomer: cleanText(raw.targetCustomer, 220) || null,
    brandVoice: cleanText(raw.brandVoice, 220) || null,
    businessContext: cleanText(raw.businessContext, 1600) || null,
  };

  return next.businessName || next.industry || next.businessModel || next.primaryGoals?.length || next.targetCustomer || next.brandVoice || next.businessContext
    ? next
    : null;
}

function coerceCapabilityInputs(raw: unknown): FunnelFoundationCapabilityInputs | null {
  if (!isRecord(raw)) return null;
  const readCount = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  return {
    existingFormsCount: readCount(raw.existingFormsCount),
    bookingCalendarsCount: readCount(raw.bookingCalendarsCount),
    stripeProductsCount: readCount(raw.stripeProductsCount),
    aiAgentsCount: readCount(raw.aiAgentsCount),
    heroImageAttached: raw.heroImageAttached === true,
    heroVideoAttached: raw.heroVideoAttached === true,
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const hasFoundationArtifact = await dbHasCreditFunnelPageFoundationArtifactColumns();
  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: withFoundationArtifactSelect({
      id: true,
      slug: true,
      title: true,
      funnel: { select: { id: true, slug: true, name: true } },
    }, hasFoundationArtifact),
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const settings = await getCreditFunnelBuilderSettings(auth.session.user.id).catch(() => ({} as Record<string, unknown>));
  const effectiveBrief = inferFunnelBriefProfile({
    existing: isRecord(body?.brief) ? body?.brief : readFunnelBrief(settings, page.funnel.id),
    funnelName: page.funnel.name,
    funnelSlug: page.funnel.slug,
  });
  const effectiveIntent = inferFunnelPageIntentProfile({
    existing: isRecord(body?.intent) ? body?.intent : readFunnelPageBrief(settings, page.id),
    funnelBrief: effectiveBrief,
    funnelName: page.funnel.name,
    funnelSlug: page.funnel.slug,
    pageTitle: page.title,
    pageSlug: page.slug,
  });
  const businessProfile = coerceBusinessProfile(body?.businessProfile) ?? (await getBusinessProfileFoundationContext(auth.session.user.id).catch(() => null));
  const capabilityInputs = coerceCapabilityInputs(body?.capabilityInputs);
  const routeLabel = `/${[cleanText(page.funnel.slug, 80), cleanText(page.slug, 80)].filter(Boolean).join("/")}` || "/page";
  const businessContext = await getBusinessProfileAiContext(auth.session.user.id).catch(() => "");
  const materialHash = buildFunnelFoundationMaterialHash({
    routeLabel,
    funnelName: page.funnel.name,
    pageTitle: page.title,
    brief: effectiveBrief,
    intent: effectiveIntent,
    businessProfile,
    capabilityInputs,
    businessContext,
  });
  const storedArtifact = hasFoundationArtifact
    ? coerceStoredFunnelFoundationArtifact((page as { foundationArtifactJson?: unknown }).foundationArtifactJson)
    : null;

  if (
    hasFoundationArtifact &&
    (page as { foundationArtifactHash?: unknown }).foundationArtifactHash === materialHash &&
    storedArtifact?.materialHash === materialHash
  ) {
    return NextResponse.json({ ok: true, cached: true, foundation: storedArtifact });
  }

  const foundation = await synthesizeFunnelFoundationArtifact({
    routeLabel,
    funnelName: page.funnel.name,
    pageTitle: page.title,
    brief: effectiveBrief,
    intent: effectiveIntent,
    businessProfile,
    capabilityInputs,
    businessContext,
  });

  if (hasFoundationArtifact) {
    await prisma.creditFunnelPage.update({
      where: { id: page.id },
      data: applyFoundationArtifactWriteCompat({
      foundationArtifactHash: foundation.materialHash,
      foundationArtifactJson: foundation as any,
      }, hasFoundationArtifact),
      select: { id: true },
    });
  }

  return NextResponse.json({ ok: true, cached: false, foundation });
}