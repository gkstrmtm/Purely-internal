import { NextResponse } from "next/server";

import { generateTextWithImages } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  readFunnelExhibitArchetypePack,
  selectRelevantFunnelExhibitArchetypes,
} from "@/lib/funnelExhibitArchetypes";
import {
  buildFunnelPageRouteLabel,
  inferFunnelBriefProfile,
  inferFunnelPageIntentProfile,
  readFunnelBrief,
  readFunnelPageBrief,
} from "@/lib/funnelPageIntent";
import { assessFunnelSceneQuality, buildFragmentSceneAnatomy } from "@/lib/funnelSceneQuality";
import { resolveFunnelShellFrame } from "@/lib/funnelShellFrames";
import { buildFunnelVisualWhyBlock } from "@/lib/funnelVisualWhy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type NormalizedVisualReviewRequest = {
  funnelId: string;
  pageId: string;
  prompt: string;
  html: string;
  css: string;
  surface: "structure" | "source";
  previewImageDataUrl?: string;
  intentProfile?: Record<string, unknown>;
  funnelBrief?: Record<string, unknown>;
};

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanStringList(value: unknown, maxItems: number, maxLen: number) {
  if (!Array.isArray(value)) return [] as string[];
  const out: string[] = [];
  for (const item of value) {
    const next = cleanString(item, maxLen);
    if (!next || out.includes(next)) continue;
    out.push(next);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeVisualReviewBody(raw: unknown): NormalizedVisualReviewRequest {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const intentProfile =
    record.intentProfile && typeof record.intentProfile === "object" && !Array.isArray(record.intentProfile)
      ? (record.intentProfile as Record<string, unknown>)
      : undefined;
  const funnelBrief =
    record.funnelBrief && typeof record.funnelBrief === "object" && !Array.isArray(record.funnelBrief)
      ? (record.funnelBrief as Record<string, unknown>)
      : undefined;

  return {
    funnelId: cleanString(record.funnelId, 200),
    pageId: cleanString(record.pageId, 200),
    prompt: cleanString(record.prompt, 8000),
    html: typeof record.html === "string" ? record.html : "",
    css: typeof record.css === "string" ? record.css : "",
    surface: record.surface === "source" ? "source" : "structure",
    ...(typeof record.previewImageDataUrl === "string" && /^data:image\//i.test(record.previewImageDataUrl.trim())
      ? { previewImageDataUrl: record.previewImageDataUrl.trim().slice(0, 8_000_000) }
      : null),
    ...(intentProfile ? { intentProfile } : null),
    ...(funnelBrief ? { funnelBrief } : null),
  };
}

function extractFirstJsonObject(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (!objectMatch?.[0]) return null;
  try {
    return JSON.parse(objectMatch[0]);
  } catch {
    return null;
  }
}

function normalizePreviewCritique(raw: unknown) {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    renderAdequate: record.renderAdequate === true,
    summary: cleanString(record.summary, 280),
    warnings: cleanStringList(record.warnings, 3, 220),
    strengths: cleanStringList(record.strengths, 2, 220),
  };
}

function parseScenePlanItems(value: unknown) {
  return String(value || "")
    .split(/\n|->|\||,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function countPatternMatches(value: string, pattern: RegExp) {
  return (String(value || "").match(pattern) || []).length;
}

function isNarrowRepairPrompt(prompt: string) {
  const text = String(prompt || "");
  return /(fix|stop|keep|move|reduce|tighten|correct|repair).*(overlap|padding|button|header|spacing|margin|cover|collision)|overlap with the header|keep the button inside|stop it from covering/i.test(
    text,
  );
}

function buildSceneWatchouts(input: {
  prompt: string;
  pageType: string;
  html: string;
  anatomy: ReturnType<typeof buildFragmentSceneAnatomy>;
  quality: ReturnType<typeof assessFunnelSceneQuality>;
  visualWhyBlock: string;
}) {
  if (isNarrowRepairPrompt(input.prompt)) {
    return [] as string[];
  }

  const warnings: string[] = [];
  const premiumTone = /premium|character|editorial|refined|elevated|distinct|high-trust|intentional|less basic|flat/i.test(
    input.prompt,
  );
  const hasContextualVisualCue = /<img\b|<picture\b|<video\b|dashboard|workflow|process|quote|testimonial|logo|case-study|metric|stat/i.test(
    input.html,
  );
  const usesSinglePath = ["booking", "application", "lead-capture"].includes(input.pageType);

  for (const check of input.quality.pageQualityChecks) {
    if (check.tone === "good") continue;
    if (check.key === "opening-frame") {
      warnings.push("The first screen still needs one dominant decision cluster so the promise, CTA, and trust cue land in a single scan.");
      continue;
    }
    if (check.key === "hierarchy-contrast") {
      warnings.push("The hierarchy still reads flatter than it should; group related content harder and let contrast shifts do more of the priority work.");
      continue;
    }
    if (check.key === "section-rhythm") {
      warnings.push("The scroll path still needs stronger section rhythm so the page stops feeling like one continuous run of content.");
      continue;
    }
    if (check.key === "proof-staging") {
      warnings.push("Proof is still under-staged; give the first serious ask an adjacent trust surface instead of leaving reassurance buried downstream.");
      continue;
    }
    if (check.key === "cta-placement") {
      warnings.push("The conversion spine is still thin; repeat the ask at clearer structural beats instead of relying on a single action moment.");
      continue;
    }
    if (check.key === "composition-system") {
      warnings.push("The composition is still too thin to feel intentional; add stronger modular containers before layering on more polish.");
    }
  }

  if (premiumTone && !hasContextualVisualCue) {
    warnings.push("The surface still needs a context-rich visual or proof frame; premium tone will not land through decoration alone.");
  }
  if (usesSinglePath && input.anatomy.sections >= 2 && input.anatomy.layoutBlocks >= 3 && input.anatomy.actions <= 1) {
    warnings.push("The reading path is clearer now, but the booking flow still needs a calmer single-column close with reassurance stacked directly around the ask.");
  }
  if (premiumTone && input.anatomy.layoutBlocks <= 1 && /restrained-character/i.test(input.visualWhyBlock)) {
    warnings.push("Character is still doing too little work; introduce one restrained contrast beat instead of keeping every band at the same visual temperature.");
  }

  return Array.from(new Set(warnings)).slice(0, 4);
}

function buildSceneStrengths(input: {
  anatomy: ReturnType<typeof buildFragmentSceneAnatomy>;
  quality: ReturnType<typeof assessFunnelSceneQuality>;
}) {
  const strengths: string[] = [];
  if (input.quality.openingFrameResolved) {
    strengths.push("The opening frame has enough structure to read as a deliberate first-screen moment.");
  }
  if (input.quality.proofStagingResolved) {
    strengths.push("The page has enough proof structure to support a visible trust moment near the ask.");
  }
  if (input.quality.actionPlacementResolved) {
    strengths.push("The action path has a usable conversion spine instead of relying on one isolated CTA.");
  }
  if (input.anatomy.media > 0) {
    strengths.push("The surface has at least one contextual media cue to help explain the offer in use.");
  }
  return strengths.slice(0, 3);
}

function buildReviewSummary(warnings: string[], strengths: string[], surface: "structure" | "source") {
  if (!warnings.length) {
    return `Background visual review cleared the current ${surface} pass without a dominant design warning.`;
  }
  const first = warnings[0].replace(/[.]+$/g, "");
  const second = warnings[1] ? ` ${warnings[1].replace(/[.]+$/g, "")}.` : ".";
  const strengthLead = strengths[0] ? ` ${strengths[0]}` : "";
  return `Background visual review flagged ${first.toLowerCase()}${second}${strengthLead}`.trim();
}

async function runPreviewImageCritique(input: {
  prompt: string;
  surface: "structure" | "source";
  pageType: string;
  routeLabel: string;
  shellFrameLabel: string;
  visualWhyBlock: string;
  sceneWarnings: string[];
  sceneStrengths: string[];
  previewImageDataUrl: string;
}) {
  const system = [
    "You review screenshots of funnel pages after an AI generation pass.",
    "Return strict JSON only with this shape: {\"renderAdequate\":boolean,\"summary\":string,\"warnings\":string[],\"strengths\":string[]}",
    "Use concise, concrete design language grounded in what is visibly true in the screenshot.",
    "Do not echo the user's prompt.",
    "Warnings should describe visible hierarchy, proof, spacing, overlap, CTA support, or visual character problems.",
    "Strengths should only mention visibly resolved qualities.",
    "If the screenshot is blank, mostly blank, clearly failed, placeholder-heavy, error-like, or not visually usable for design critique, set renderAdequate to false and return an empty summary, warnings, and strengths.",
    "Maximum 3 warnings and 2 strengths.",
  ].join("\n");

  const user = [
    `Surface: ${input.surface}`,
    `Page type: ${input.pageType}`,
    `Route: ${input.routeLabel}`,
    `Shell posture: ${input.shellFrameLabel}`,
    `Original request: ${input.prompt}`,
    input.sceneWarnings.length ? `Current structural watchouts: ${input.sceneWarnings.join(" | ")}` : "Current structural watchouts: none",
    input.sceneStrengths.length ? `Current structural strengths: ${input.sceneStrengths.join(" | ")}` : "Current structural strengths: none",
    input.visualWhyBlock ? `Visual why guidance:\n${input.visualWhyBlock}` : "",
    "Review the screenshot and refine the watchouts based on what is visually present right now.",
    "If the screenshot looks materially stronger than the structural watchouts imply, say so in strengths and drop weak warnings.",
    "If the screenshot does not show a meaningful rendered funnel surface yet, set renderAdequate to false instead of guessing.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await generateTextWithImages({
    system,
    user,
    imageUrls: [input.previewImageDataUrl],
    temperature: 0.2,
  });

  return normalizePreviewCritique(extractFirstJsonObject(raw));
}

export async function POST(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    const authError = "error" in auth && typeof auth.error === "string" ? auth.error : "Unauthorized";
    return NextResponse.json({ ok: false, error: authError }, { status: auth.status });
  }

  const body = normalizeVisualReviewBody(await req.json().catch(() => null));
  if (!body.funnelId || !body.pageId || !body.prompt) {
    return NextResponse.json({ ok: false, error: "Missing required review fields" }, { status: 400 });
  }

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: body.pageId, funnelId: body.funnelId, funnel: { ownerId: auth.session.user.id } },
    select: {
      id: true,
      slug: true,
      title: true,
      funnel: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!page) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
    .catch(() => null);

  const funnelBrief = inferFunnelBriefProfile({
    existing: body.funnelBrief || readFunnelBrief(settings?.dataJson ?? null, page.funnel.id),
    funnelName: page.funnel.name,
    funnelSlug: page.funnel.slug,
  });
  const intentProfile = inferFunnelPageIntentProfile({
    existing: body.intentProfile || readFunnelPageBrief(settings?.dataJson ?? null, page.id),
    prompt: body.prompt,
    funnelBrief,
    funnelName: page.funnel.name,
    funnelSlug: page.funnel.slug,
    pageTitle: page.title,
    pageSlug: page.slug,
  });
  const shellFrame = resolveFunnelShellFrame({
    frameId: intentProfile.shellFrameId,
    pageType: intentProfile.pageType,
    formStrategy: intentProfile.formStrategy,
  });
  const routeLabel = buildFunnelPageRouteLabel(page.funnel.slug, page.slug);
  const storedExhibitArchetypePack = readFunnelExhibitArchetypePack(settings?.dataJson ?? null, page.funnel.id);
  const relevantArchetypes = selectRelevantFunnelExhibitArchetypes(storedExhibitArchetypePack, {
    pageType: intentProfile.pageType,
    prompt: body.prompt,
    routeLabel,
    pageTitle: page.title,
  });
  const anatomy = buildFragmentSceneAnatomy(body.html, body.css);
  const quality = assessFunnelSceneQuality({
    pageAnatomy: anatomy,
    proofResolved: Boolean(shellFrame?.proofModel && shellFrame.proofModel !== "Not resolved yet."),
    ctaResolved: countPatternMatches(body.html, /<(a|button|form|input|textarea|select)\b/gi) >= 1,
    sectionPlanItems: parseScenePlanItems(intentProfile.sectionPlan || shellFrame?.sectionPlan || ""),
    proofModel: shellFrame?.proofModel,
  });
  const visualWhyBlock = buildFunnelVisualWhyBlock({
    pageType: intentProfile.pageType,
    prompt: body.prompt,
    shellFrame,
    archetypes: relevantArchetypes,
  });
  const warnings = buildSceneWatchouts({
    prompt: body.prompt,
    pageType: intentProfile.pageType,
    html: body.html,
    anatomy,
    quality,
    visualWhyBlock,
  });
  const strengths = buildSceneStrengths({ anatomy, quality });
  let mergedWarnings = warnings;
  let mergedStrengths = strengths;
  let summary = buildReviewSummary(mergedWarnings, mergedStrengths, body.surface);
  let visualReviewed = false;
  const hasRenderableSurface = Boolean(String(body.html || "").trim());

  if (body.previewImageDataUrl && hasRenderableSurface && !isNarrowRepairPrompt(body.prompt)) {
    try {
      const visualCritique = await runPreviewImageCritique({
        prompt: body.prompt,
        surface: body.surface,
        pageType: intentProfile.pageType,
        routeLabel,
        shellFrameLabel: shellFrame?.label || "Not resolved",
        visualWhyBlock,
        sceneWarnings: warnings,
        sceneStrengths: strengths,
        previewImageDataUrl: body.previewImageDataUrl,
      });
      if (visualCritique.renderAdequate) {
        mergedWarnings = Array.from(new Set([...visualCritique.warnings, ...warnings])).slice(0, 4);
        mergedStrengths = Array.from(new Set([...visualCritique.strengths, ...strengths])).slice(0, 3);
        summary = visualCritique.summary || buildReviewSummary(mergedWarnings, mergedStrengths, body.surface);
        visualReviewed = Boolean(visualCritique.summary || visualCritique.warnings.length || visualCritique.strengths.length);
      } else {
        visualReviewed = false;
      }
    } catch {
      visualReviewed = false;
    }
  }

  return NextResponse.json({
    ok: true,
    summary,
    warnings: mergedWarnings,
    strengths: mergedStrengths,
    visualReviewed,
    scene: {
      dominantIssue: quality.dominantIssue,
      structuralPriorities: quality.structuralPriorities,
    },
  });
}