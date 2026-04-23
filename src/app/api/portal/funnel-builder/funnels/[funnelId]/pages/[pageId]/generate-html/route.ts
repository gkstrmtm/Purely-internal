import { NextResponse } from "next/server";

import { getCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText, generateTextWithImages } from "@/lib/ai";
import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { synthesizeFunnelGenerationPrompt } from "@/lib/funnelPromptSynthesizer";
import { readFunnelBookingRouting, resolveFunnelBookingCalendarId } from "@/lib/funnelBookingRouting";
import {
  buildFunnelBriefPromptBlock,
  buildFunnelPageIntentPromptBlock,
  buildFunnelPageRouteLabel,
  extractFunnelPageIntentProfile,
  inferFunnelBriefProfile,
  inferFunnelPageIntentProfile,
  readFunnelBrief,
  readFunnelPageBrief,
  stripFunnelPageIntentMessages,
} from "@/lib/funnelPageIntent";
import { resolveFunnelShellFrame } from "@/lib/funnelShellFrames";
import {
  applyDraftHtmlWriteCompat,
  dbHasCreditFunnelPageDraftHtmlColumn,
  normalizeDraftHtml,
  withDraftHtmlSelect,
} from "@/lib/funnelPageDbCompat";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";
import { blocksToCustomHtmlDocument, escapeHtml } from "@/lib/funnelBlocksToCustomHtmlDocument";
import {
  buildFunnelExhibitArchetypeBlock,
  readFunnelExhibitArchetypePack,
  selectRelevantFunnelExhibitArchetypes,
} from "@/lib/funnelExhibitArchetypes";
import {
  createFunnelPageDraftUpdate,
  createFunnelPageMirroredHtmlUpdate,
  getFunnelPageCurrentHtml,
} from "@/lib/funnelPageState";
import { assessFunnelSceneQuality, buildFragmentSceneAnatomy } from "@/lib/funnelSceneQuality";
import { buildFunnelVisualWhyBlock } from "@/lib/funnelVisualWhy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampText(s: string, maxLen: number) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "\n<!-- truncated -->";
}

function extractHtml(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const fenced = text.match(/```html\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const anyFence = text.match(/```\s*([\s\S]*?)\s*```/);
  if (anyFence?.[1]) return anyFence[1].trim();

  return text;
}

function extractHtmlAndChangelog(raw: string): { html: string; changelog: Record<string, unknown> | null } {
  const text = String(raw ?? "").trim();
  if (!text) return { html: "", changelog: null };

  const htmlFenced = text.match(/```html\s*([\s\S]*?)\s*```/i);
  const html = htmlFenced?.[1]
    ? htmlFenced[1].trim()
    : (() => {
        const anyFence = text.match(/```\s*([\s\S]*?)\s*```/);
        return anyFence?.[1] ? anyFence[1].trim() : text;
      })();

  // Look for a JSON changelog block that appears AFTER the HTML fence
  let changelog: Record<string, unknown> | null = null;
  const afterHtml = htmlFenced ? text.slice(text.indexOf(htmlFenced[0]) + htmlFenced[0].length) : "";
  if (afterHtml) {
    const jsonFenced = afterHtml.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonFenced?.[1]) {
      try {
        const parsed = JSON.parse(jsonFenced[1].trim());
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !("question" in parsed)) {
          changelog = parsed as Record<string, unknown>;
        }
      } catch {
        // ignore parse failures
      }
    }
  }

  return { html, changelog };
}

function extractJson(raw: string): unknown {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ? fenced[1].trim() : "";
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function extractAiQuestion(raw: string): string | null {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const q = typeof (parsed as any).question === "string" ? String((parsed as any).question).trim() : "";
  if (!q) return null;
  return q.slice(0, 800);
}

function extractJsonObjectRecord(raw: string): Record<string, unknown> | null {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function buildGenerationPlanPrompt(input: {
  wantsBookingPage: boolean;
  pageTitle: string;
  funnelName: string;
  currentHtmlBlock: string;
  pageSectionsBlock: string;
  selectedRegionBlock: string;
  recentIterationMemoryBlock: string;
  businessContextBlock: string;
  bookingRuntimeBlock: string;
  stripeProductsBlock: string;
  contextBlock: string;
  contextMediaBlock: string;
  attachmentsBlock: string;
  exhibitPlannerContractBlock: string;
  strategicPrompt: string;
  pageEditContextBlock: string;
  prompt: string;
}) {
  return [
    input.businessContextBlock,
    input.bookingRuntimeBlock,
    input.stripeProductsBlock,
    input.pageEditContextBlock,
    `Funnel: ${input.funnelName}`,
    `Page: ${input.pageTitle}`,
    input.currentHtmlBlock,
    input.pageSectionsBlock,
    input.selectedRegionBlock,
    input.recentIterationMemoryBlock,
    "PLAN_TASK:",
    "Return only one ```json block describing the page plan before any HTML is written.",
    "The JSON must follow this shape:",
    "{",
    '  "summary": "one sentence about the intended upgrade",',
    '  "openingPosture": "attached-proof-rail | proof-strip-under-cta | single-column-cluster",',
    '  "heroApproach": "how the opening frame should work",',
    '  "openingCluster": { "promise": "...", "qualifier": "...", "primaryCta": "...", "adjacentProof": "...", "supportRole": "proof rail | proof strip | reassurance stack" },',
    '  "ctaSystem": { "dominantCta": "...", "secondaryAction": "omit | subdued-text-link | soft-secondary", "repeatMoments": ["hero", "handoff"] },',
    '  "proofStrategy": "where proof lands relative to the CTA and handoff",',
    '  "bookingHandoff": { "sectionType": "embedded booking section or direct handoff", "reassurance": "...", "repeatProof": "..." },',
    '  "contentDiscipline": ["what to omit so the page stays tight and CTA-dominant"],',
    '  "foundationRules": ["specific non-negotiable visual-system or layout rules to obey"],',
    '  "referenceAnchors": ["relevant design-system or component anchors to emulate structurally"],',
    '  "antiPatterns": ["specific design mistakes the page must avoid"] ,',
    '  "visualSystem": ["3-6 short bullets about layout, hierarchy, mood, and media treatment"],',
    '  "sections": [{ "id": "hero", "goal": "...", "mustInclude": ["..."] }],',
    '  "risks": ["short list of likely failure modes to avoid"]',
    "}",
    input.wantsBookingPage
      ? "For booking pages, the plan must explicitly place proof beside the first CTA and again immediately before or inside the booking section. The openingPosture, openingCluster, and ctaSystem are a contract, not a suggestion. Prefer one dominant CTA above the fold and omit secondary actions unless they are truly necessary."
      : "",
    input.exhibitPlannerContractBlock,
    input.exhibitPlannerContractBlock
      ? "If EXHIBIT_PLANNER_CONTRACT is present, translate it into explicit foundationRules, referenceAnchors, and antiPatterns entries instead of burying it in prose."
      : "",
    "Do not return HTML in this step.",
    "",
    "DIRECTION_RULE:",
    "Follow the strategic build brief below and do not mirror the user's wording back verbatim.",
    "",
    "STRATEGIC_BUILD_BRIEF:",
    input.strategicPrompt,
    input.contextBlock,
    input.contextMediaBlock,
    input.attachmentsBlock,
    "",
    "USER_REQUEST:",
    input.prompt,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildExhibitPlannerContractBlock(input: {
  source?: string | null;
  designProfileId?: string | null;
  categories?: string[] | null;
  guidance?: string | null;
} | null) {
  if (!input) return "";

  const guidanceLines = String(input.guidance || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  const foundationRules = guidanceLines.filter((line) => /^Exhibit (foundation rules|CTA rules|input rules|commerce rules|form-flow rules|anti-patterns):/i.test(line));
  const referenceAnchors = guidanceLines.filter((line) => /^Exhibit reference anchors:/i.test(line));
  const carryForward = guidanceLines.filter((line) => /^(Selected shell frame:|Frame posture:|Narrative shell:|Composition order:|Relevant funnel archetypes:)/i.test(line));

  if (!foundationRules.length && !referenceAnchors.length && !carryForward.length && !(input.categories || []).length) {
    return "";
  }

  return [
    "EXHIBIT_PLANNER_CONTRACT:",
    input.source ? `- Advisory source: ${String(input.source).trim()}` : "",
    input.designProfileId ? `- Design profile: ${String(input.designProfileId).trim()}` : "",
    input.categories?.length ? `- Suggested categories: ${input.categories.join(", ")}` : "",
    foundationRules.length ? "- Foundation rules:" : "",
    ...foundationRules.map((line) => `  - ${line.replace(/^Exhibit [^:]+:\s*/i, "")}`),
    referenceAnchors.length ? "- Reference anchors:" : "",
    ...referenceAnchors.map((line) => `  - ${line.replace(/^Exhibit reference anchors:\s*/i, "")}`),
    carryForward.length ? "- Carry-forward context:" : "",
    ...carryForward.map((line) => `  - ${line}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizePortalHostedPaths(html: string): string {
  let out = String(html || "");
  if (!out) return out;

  // Public funnels/forms/booking should never be under /portal on hosted pages.
  out = out
    .replace(/\b\/portal\/forms\//gi, "/forms/")
    .replace(/\b\/portal\/f\//gi, "/f/")
    .replace(/\b\/portal\/book\//gi, "/book/")
    .replace(/\b\/api\/public\/portal\//gi, "/api/public/");

  return out;
}

function sanitizeGeneratedHtmlLinks(html: string): string {
  let out = String(html || "");
  if (!out) return out;

  out = out
    .replace(/https?:\/\/(?:www\.)?(?:example\.com|yourdomain\.com|placeholder\.com|test\.com)([^"'\s>]*)/gi, "https://purelyautomation.com$1")
    .replace(/href=(['"])\s*javascript:[^'"]*\1/gi, 'href="https://purelyautomation.com"')
    .replace(/href=(['"])\s*(?:#|)\s*\1/gi, 'href="https://purelyautomation.com"');

  return out;
}

const DECORATIVE_HERO_DATA_URL = (() => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" fill="none">',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="1600" y2="900" gradientUnits="userSpaceOnUse">',
    '<stop stop-color="#0F172A"/>',
    '<stop offset="0.55" stop-color="#1D4ED8"/>',
    '<stop offset="1" stop-color="#38BDF8"/>',
    '</linearGradient>',
    '<radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(380 240) rotate(31) scale(380 280)">',
    '<stop stop-color="#F8FAFC" stop-opacity="0.32"/>',
    '<stop offset="1" stop-color="#F8FAFC" stop-opacity="0"/>',
    '</radialGradient>',
    '<radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1160 660) rotate(18) scale(420 300)">',
    '<stop stop-color="#BFDBFE" stop-opacity="0.28"/>',
    '<stop offset="1" stop-color="#BFDBFE" stop-opacity="0"/>',
    '</radialGradient>',
    '</defs>',
    '<rect width="1600" height="900" fill="url(#bg)"/>',
    '<circle cx="380" cy="240" r="300" fill="url(#glowA)"/>',
    '<circle cx="1160" cy="660" r="320" fill="url(#glowB)"/>',
    '<path d="M0 710C154 654 329 622 520 622C742 622 936 696 1116 728C1276 756 1437 749 1600 690V900H0V710Z" fill="rgba(15,23,42,0.34)"/>',
    '</svg>',
  ].join("");
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
})();

function sanitizeGeneratedHtmlVisualAssets(html: string): string {
  let out = String(html || "");
  if (!out) return out;

  const placeholderUrlPattern = /((?:https?:\/\/[^)'"\s]+\/)?(?:hero-image|placeholder|stock-photo|dummy-image|your-image|replace-me)[^)'"\s]*)/i;

  out = out.replace(/url\((['"]?)([^)'"\s]+)\1\)/gi, (full, _quote, url) => {
    return placeholderUrlPattern.test(String(url || "")) ? `url("${DECORATIVE_HERO_DATA_URL}")` : full;
  });

  out = out.replace(/(<img\b[^>]*\bsrc=)(['"])([^'"]+)(\2)/gi, (full, prefix, quote, url, suffix) => {
    return placeholderUrlPattern.test(String(url || "")) ? `${prefix}${quote}${DECORATIVE_HERO_DATA_URL}${suffix}` : full;
  });

  return out;
}

function extractQualityText(html: string): string {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractBodyHtml(html: string) {
  const text = String(html || "");
  const match = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match?.[1] ? match[1] : text;
}

function findFirstPatternIndex(value: string, patterns: RegExp[]) {
  const haystack = String(value || "");
  let minIndex = -1;
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (!match || typeof match.index !== "number") continue;
    if (minIndex === -1 || match.index < minIndex) minIndex = match.index;
  }
  return minIndex;
}

function hasProofSurface(fragment: string) {
  const html = String(fragment || "");
  const text = extractQualityText(html);
  const proofKeywordSignals = /\b(testimonial|testimonials|case stud|review|reviews|trusted by|results?|client stories|client outcomes?|proof|credibility|authority|social proof|outcomes?)\b/i.test(text);
  const proofContainerSignals = /<(div|section|aside|ul)\b[^>]*(class|id)=["'][^"']*(proof|testimonial|review|results?|outcomes?|stats?|metrics?|logos?|trust|credibility)[^"']*["'][^>]*>/i.test(html);
  const proofStatSignals =
    countPatternMatches(text, /\b\d{1,3}%\b/g) >= 1 ||
    countPatternMatches(text, /\b\d+\s*(min|minute|minutes|hour|hours|day|days|week|weeks|x)\b/gi) >= 2;
  return proofKeywordSignals || proofContainerSignals || proofStatSignals;
}

function countPatternMatches(value: string, pattern: RegExp) {
  return (String(value || "").match(pattern) || []).length;
}

function parseScenePlanItems(value: unknown) {
  return String(value || "")
    .split(/\n|->|\||,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function analyzeGeneratedSceneQuality(
  html: string,
  input: { sectionPlan?: string | null; proofModel?: string | null },
) {
  const pageAnatomy = buildFragmentSceneAnatomy(html, "");
  return assessFunnelSceneQuality({
    pageAnatomy,
    proofResolved: hasProofSurface(extractBodyHtml(html)),
    ctaResolved: /<(a|button|form|input|textarea|select)\b/i.test(html),
    sectionPlanItems: parseScenePlanItems(input.sectionPlan || ""),
    proofModel: input.proofModel || undefined,
  });
}

function buildSceneRepairBlock(
  html: string,
  input: { sectionPlan?: string | null; proofModel?: string | null },
) {
  const quality = analyzeGeneratedSceneQuality(html, input);
  return [
    "SCENE_REPAIR_DIAGNOSIS:",
    `- Dominant issue: ${quality.dominantIssue.title}. ${quality.dominantIssue.detail}`,
    "- Structural priorities:",
    ...quality.structuralPriorities.slice(0, 3).map((item) => `  - ${item.title}: ${item.detail}`),
  ].join("\n");
}

function hasBookingClusterFailure(issues: string[]) {
  return issues.some((issue) =>
    /(first screen|first serious ask|trust cue|adjacent trust surface|proof is still under-staged|decision cluster|booking handoff|hero and booking block|middle support beat)/i.test(
      issue,
    ),
  );
}

function hasBookingGenericOutputFailure(issues: string[]) {
  return issues.some((issue) =>
    /generic starter template|generic enterprise filler|invented or generic proof|placeholder faq scaffolding|ornamental fact clutter|CTA dominance is diluted/i.test(
      issue,
    ),
  );
}

function readPlanString(record: Record<string, unknown> | null, key: string, fallback = "") {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function readPlanObject(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickFallbackAudienceCopy(value: string, fallback: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  if (text.length < 28 && /[:.]$/.test(text)) return fallback;
  if (
    /^(create|design|build|rebuild|transform|make|keep|place|use|lead|pair|put|move|rewrite|restage|attach|combine|merge|tighten|turn|frame|clarify|pressure-test|include|cut)\b/i.test(
      text,
    )
  ) {
    return fallback;
  }
  if (
    /\b(hero section|booking section|proof block|proof element|cta|layout|page|opening cluster|handoff section|hero|booking handoff)\b/i.test(text) &&
    /\b(create|design|build|transform|make|keep|place|use|lead|pair|put|move|rewrite|restage|attach|combine|merge|tighten|turn|frame|include|cut)\b/i.test(text)
  ) {
    return fallback;
  }
  return text;
}

function buildBookingFallbackHtmlFromPlan(input: {
  funnelName: string;
  pageTitle: string;
  prompt: string;
  primaryCta: string;
  bookingHref: string;
  bookingSectionId: string;
  generationPlan: Record<string, unknown> | null;
}) {
  const openingCluster = readPlanObject(input.generationPlan, "openingCluster");
  const ctaSystem = readPlanObject(input.generationPlan, "ctaSystem");
  const bookingHandoff = readPlanObject(input.generationPlan, "bookingHandoff");
  const promiseText = pickFallbackAudienceCopy(
    readPlanString(openingCluster, "promise", "Book your consultation"),
    "Book your consultation",
  );
  const qualifier = pickFallbackAudienceCopy(
    readPlanString(openingCluster, "qualifier", "Private working session for operators who need the next move clear"),
    "Private working session for operators who need the next move clear",
  );
  const adjacentProof = pickFallbackAudienceCopy(
    readPlanString(openingCluster, "adjacentProof", ""),
    "A structured consultation with a clear recommendation, visible tradeoffs, and enough decision support to act without a second vague discovery call.",
  );
  const supportRole = readPlanString(openingCluster, "supportRole", "proof rail");
  const summary = pickFallbackAudienceCopy(
    readPlanString(input.generationPlan, "summary", ""),
    "A premium consultation page that moves from fit and proof into one decisive booking handoff.",
  );
  const heroApproach = pickFallbackAudienceCopy(
    readPlanString(input.generationPlan, "heroApproach", ""),
    "Lead with the decision the visitor is trying to make, keep the consultation visibly valuable, and attach reassurance to the first booking action.",
  );
  const proofStrategy = pickFallbackAudienceCopy(
    readPlanString(input.generationPlan, "proofStrategy", ""),
    "Keep proof beside the first CTA, then restage reassurance again inside the booking handoff so the page never asks in a vacuum.",
  );
  const handoffType = readPlanString(bookingHandoff, "sectionType", "direct booking handoff");
  const handoffReassurance = pickFallbackAudienceCopy(
    readPlanString(bookingHandoff, "reassurance", ""),
    "You leave knowing what to do next, what to ignore, and whether implementation support actually makes sense right now.",
  );
  const handoffProof = pickFallbackAudienceCopy(
    readPlanString(bookingHandoff, "repeatProof", ""),
    "Proof and reassurance stay attached to the handoff so the booking step feels earned instead of premature.",
  );
  const ctaText = readPlanString(ctaSystem, "dominantCta", input.primaryCta || "Book a call");
  const bookingHref = input.bookingHref || `#${input.bookingSectionId}`;
  const supportLabel = /proof\s+(rail|strip)/i.test(supportRole) ? "Decision support" : supportRole || "Decision support";
  const handoffLead = /embedded booking section/i.test(handoffType)
    ? "The booking section stays embedded and low-friction."
    : /direct booking handoff/i.test(handoffType)
      ? "The booking path stays direct and low-friction."
      : `${handoffType.charAt(0).toUpperCase()}${handoffType.slice(1)}.`;
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${escapeHtml(input.pageTitle || input.funnelName || "Booking page")}</title>`,
    "  <style>",
    "    :root { color-scheme: light; --bg: #f5f1ea; --ink: #172033; --muted: #5b6472; --panel: rgba(255, 253, 250, 0.88); --panel-strong: #fffdfa; --line: rgba(23, 32, 51, 0.12); --accent: #1f5eff; --accent-ink: #ffffff; --warm: #efe5d8; --shadow: 0 24px 70px rgba(18, 26, 41, 0.12); }",
    "    * { box-sizing: border-box; }",
    "    body { margin: 0; font-family: 'Inter', 'Segoe UI', sans-serif; background: radial-gradient(circle at top, #fbf8f2 0%, var(--bg) 48%, #ece1d1 100%); color: var(--ink); }",
    "    h1, h2, h3 { font-family: 'Space Grotesk', 'Segoe UI', sans-serif; }",
    "    a { color: inherit; text-decoration: none; }",
    "    .page { max-width: 1120px; margin: 0 auto; padding: 32px 20px 88px; }",
    "    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 8px 0 24px; color: var(--muted); font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }",
    "    .hero { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(300px, 0.82fr); gap: 24px; align-items: stretch; }",
    "    .hero-copy, .hero-proof, .band, .details, .fit-grid, .booking { background: var(--panel); backdrop-filter: blur(10px); border: 1px solid var(--line); border-radius: 28px; box-shadow: var(--shadow); }",
    "    .hero-copy { padding: 38px; }",
    "    .eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: var(--warm); color: #6e5130; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; }",
    "    h1 { margin: 18px 0 14px; font-size: clamp(2.8rem, 5vw, 4.8rem); line-height: 0.95; letter-spacing: -0.04em; max-width: 10ch; }",
    "    .lede { margin: 0; font-size: 18px; line-height: 1.7; color: var(--muted); max-width: 62ch; }",
    "    .cta-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 28px; align-items: center; }",
    "    .cta-primary { min-height: 54px; padding: 0 26px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; letter-spacing: 0.01em; background: var(--accent); color: var(--accent-ink); box-shadow: 0 16px 32px rgba(31, 94, 255, 0.22); }",
    "    .micro-proof { margin-top: 22px; padding: 18px 20px; border-radius: 22px; background: linear-gradient(135deg, rgba(31, 94, 255, 0.16), rgba(255,255,255,0.96)); border: 1px solid rgba(31, 94, 255, 0.2); box-shadow: 0 18px 34px rgba(31, 94, 255, 0.12); }",
    "    .micro-proof strong { display: block; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }",
    "    .hero-proof { padding: 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; background: linear-gradient(160deg, #152033 0%, #233b63 100%); color: #eef4ff; border-color: rgba(21, 32, 51, 0.18); }",
    "    .hero-proof-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(238, 244, 255, 0.72); font-weight: 700; }",
    "    .hero-proof-quote { font-size: 24px; line-height: 1.3; letter-spacing: -0.03em; color: #ffffff; }",
    "    .hero-proof-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }",
    "    .hero-proof-list li { padding: 14px 16px; border-radius: 18px; background: rgba(255, 255, 255, 0.09); border: 1px solid rgba(255, 255, 255, 0.12); color: rgba(238, 244, 255, 0.86); }",
    "    .band { margin-top: 22px; padding: 18px 22px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }",
    "    .band-card { padding: 14px 16px; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(245,248,255,0.82)); border: 1px solid rgba(31, 94, 255, 0.12); box-shadow: 0 10px 26px rgba(18, 26, 41, 0.08); }",
    "    .band-card strong { display: block; margin-bottom: 6px; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; }",
    "    .details, .fit-grid, .booking { margin-top: 22px; padding: 28px; }",
    "    .section-kicker { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; margin-bottom: 10px; }",
    "    h2 { margin: 0 0 12px; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.02; letter-spacing: -0.03em; }",
    "    .detail-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }",
    "    .detail-step { padding: 18px 18px 20px; border-radius: 20px; background: rgba(23, 32, 51, 0.04); border: 1px solid rgba(23, 32, 51, 0.06); }",
    "    .detail-step strong { display: block; margin: 12px 0 8px; font-size: 15px; }",
    "    .detail-step-index { width: 42px; height: 42px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: rgba(31, 94, 255, 0.12); color: #173d9f; font-weight: 800; }",
    "    .fit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }",
    "    .fit-card { padding: 20px 22px; border-radius: 22px; background: rgba(255,255,255,0.74); border: 1px solid var(--line); }",
    "    .fit-card ul { margin: 14px 0 0; padding-left: 18px; color: var(--muted); line-height: 1.75; }",
    "    .booking { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); gap: 20px; align-items: start; }",
    "    .booking-panel { padding: 20px; border-radius: 22px; background: linear-gradient(180deg, rgba(31, 94, 255, 0.08), rgba(255,255,255,0.86)); border: 1px solid rgba(31, 94, 255, 0.14); }",
    "    .booking-note { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; line-height: 1.65; }",
    "    @media (max-width: 900px) { .hero, .booking, .band, .detail-list, .fit-grid { grid-template-columns: 1fr; } .hero-copy, .hero-proof, .details, .fit-grid, .booking { padding: 22px; } h1 { max-width: 100%; } }",
    "  </style>",
    "</head>",
    "<body>",
    '  <main class="page">',
    '    <div class="topbar"><span>' + escapeHtml(input.funnelName || "Consultation funnel") + '</span><span>private consultation</span></div>',
    '    <section class="hero">',
    '      <div class="hero-copy">',
    '        <div class="eyebrow">' + escapeHtml(qualifier) + '</div>',
    '        <h1>' + escapeHtml(promiseText) + '</h1>',
    '        <p class="lede">' + escapeHtml(heroApproach || summary) + '</p>',
    '        <div class="cta-row">',
    '          <a class="cta-primary" href="' + escapeHtml(bookingHref) + '">' + escapeHtml(ctaText) + '</a>',
    "        </div>",
    '        <div class="micro-proof"><strong>' + escapeHtml(supportLabel) + '</strong>' + escapeHtml(adjacentProof) + '</div>',
    "      </div>",
    '      <aside class="hero-proof">',
    '        <div class="hero-proof-label">Why this is worth booking</div>',
    '        <div class="hero-proof-quote">' + escapeHtml(summary) + '</div>',
    '        <ul class="hero-proof-list">',
    '          <li><strong>Decision quality</strong>The page keeps the consultation, the trust cue, and the booking action in the same opening read so the ask never feels detached.</li>',
    '          <li><strong>Proof strategy</strong>' + escapeHtml(proofStrategy) + '</li>',
    '          <li><strong>What the session produces</strong>' + escapeHtml(handoffReassurance) + '</li>',
    "        </ul>",
    "      </aside>",
    "    </section>",
    '    <section class="band" aria-label="Proof strip">',
    '      <div class="band-card"><strong>Best used when</strong>You are weighing a real automation decision, not casually browsing ideas you may or may not act on.</div>',
    '      <div class="band-card"><strong>What you leave with</strong>A clearer recommendation, a tighter sense of fit, and a next move you can explain internally.</div>',
    '      <div class="band-card"><strong>Proof at the ask</strong>' + escapeHtml(handoffProof) + '</div>',
    "    </section>",
    '    <section class="details" id="details">',
    '      <div class="section-kicker">What the consultation actually does</div>',
    '      <h2>One decisive path from pressure to recommendation</h2>',
    '      <p class="lede">' + escapeHtml(summary) + '</p>',
    '      <div class="detail-list">',
    '        <div class="detail-step"><div class="detail-step-index">1</div><strong>Clarify the real decision</strong><div>The session starts with the live constraint, the current workflow, and the choice that actually matters now.</div></div>',
    '        <div class="detail-step"><div class="detail-step-index">2</div><strong>Pressure-test the path</strong><div>Tradeoffs, timing, delivery risk, and implementation posture get translated into something concrete instead of abstract automation talk.</div></div>',
    '        <div class="detail-step"><div class="detail-step-index">3</div><strong>Leave with a next move</strong><div>You leave with a recommendation, a clearer sense of fit, and a next step that can survive internal scrutiny.</div></div>',
    "      </div>",
    "    </section>",
    '    <section class="fit-grid" aria-label="Fit and expectations">',
    '      <div class="fit-card"><div class="section-kicker">Best fit</div><h2 style="font-size:clamp(1.6rem,3vw,2.2rem);">This works best for teams who need clarity fast</h2><ul><li>You are deciding what to automate, what to leave alone, or what to tackle first.</li><li>You want the recommendation to feel grounded in workflow reality, not generic automation language.</li><li>You want the booking step to lead to a useful working session, not a vague sales call.</li></ul></div>',
    '      <div class="fit-card"><div class="section-kicker">Session posture</div><h2 style="font-size:clamp(1.6rem,3vw,2.2rem);">The handoff stays calm, specific, and credible</h2><ul><li>The page keeps proof close to the ask so trust does not disappear when the booking section arrives.</li><li>The consultation is framed as a decision tool, not as ornamental discovery theater.</li><li>The CTA stays dominant without turning the page into a noisy hard-sell.</li></ul></div>',
    "    </section>",
    '    <section class="booking" id="' + escapeHtml(input.bookingSectionId) + '">',
    '      <div>',
    '        <div class="section-kicker">Booking handoff</div>',
    '        <h2>Book the consultation while the case for it is still visible</h2>',
    '        <p class="lede">' + escapeHtml(handoffLead + " " + handoffReassurance) + '</p>',
    '        <div class="micro-proof"><strong>Reassurance at the handoff</strong>' + escapeHtml(handoffProof) + '</div>',
    "      </div>",
    '      <div class="booking-panel">',
    '        <div class="hero-proof-label">Primary booking path</div>',
    '        <p style="margin:12px 0 18px;color:var(--muted);">Choose a time that works, confirm the call, and move into the session with the context already anchored.</p>',
    '        <a class="cta-primary" href="' + escapeHtml(bookingHref) + '">' + escapeHtml(ctaText) + '</a>',
    '        <div class="booking-note">The page keeps proof, expectations, and the booking ask tied together so the handoff feels like the next logical move, not an abrupt leap.</div>',
    "      </div>",
    "    </section>",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function hasGenericVisualSystem(html: string) {
  const text = String(html || "");
  const usesBasicFontStack =
    /font-family\s*:\s*(?:(?:['"]?(?:segoe ui|tahoma|geneva|verdana|arial|helvetica neue|helvetica)['"]?)\s*,\s*)+(?:['"]?(?:sans-serif|system-ui)['"]?)\s*[;}]/i.test(
      text,
    ) || /font-family\s*:\s*['"]?(?:segoe ui|tahoma|geneva|verdana|arial|helvetica neue|helvetica|sans-serif|system-ui)['"]?\s*[;}]/i.test(text);
  const usesViewportHeroShell = /height\s*:\s*(?:55|60|65|70|75|80)vh\s*[;}]/i.test(text);
  const hasFlatHeroShell =
    /<(section|div|header)\b[^>]*(class|id)=["'][^"']*hero[^"']*["'][^>]*>/i.test(text) &&
    /display\s*:\s*flex/i.test(text) &&
    /text-align\s*:\s*center/i.test(text) &&
    !/grid-template-columns\s*:/i.test(text);
  const usesCenteredHeroCardShell =
    hasFlatHeroShell &&
    /max-width\s*:\s*(?:720|760|800|840|880)px\s*[;}]/i.test(text) &&
    /margin\s*:\s*(?:20|24|32|40)px\s+auto\s*[;}]/i.test(text);
  const structuredLayoutSignals = countPatternMatches(
    text,
    /(max-width\s*:|margin\s*:\s*0\s+auto|display\s*:\s*grid|grid-template-columns\s*:|gap\s*:\s*\d+px|box-shadow\s*:|border-radius\s*:\s*(?:1[6-9]|[2-9]\d)px|linear-gradient\s*\()/gi,
  );
  const flatBackgroundSignals = countPatternMatches(text, /background(?:-color)?\s*:\s*#[0-9a-f]{3,6}\s*[;}]/gi);
  const layeredSurfaceSignals = countPatternMatches(text, /(linear-gradient\s*\(|radial-gradient\s*\(|backdrop-filter\s*:|box-shadow\s*:|border\s*:\s*1px\s+solid\s+rgba\()/gi);
  const containedSectionSignals = countPatternMatches(
    text,
    /<(section|div|aside)\b[^>]*(class|id)=["'][^"']*(hero|proof|testimonial|results?|benefits?|faq|cta|panel|card|band|wrap|container)[^"']*["'][^>]*>/gi,
  );
  const premiumTypographySignals = countPatternMatches(
    text,
    /(letter-spacing\s*:|text-transform\s*:\s*uppercase|font-size\s*:\s*clamp\(|font-weight\s*:\s*(?:500|600|700|800)|line-height\s*:\s*1\.[1-4])/gi,
  );
  const containedLayoutSignals = countPatternMatches(
    text,
    /(max-width\s*:\s*(?:960|1040|1080|1120|1160|1200|1240|1280)px|padding\s*:\s*(?:64|72|80|88|96)px|border-radius\s*:\s*(?:20|24|28|32|36|40)px)/gi,
  );
  const starterTemplateSignals =
    (usesBasicFontStack ? 1 : 0) +
    (usesViewportHeroShell ? 1 : 0) +
    (flatBackgroundSignals >= 3 ? 1 : 0) +
    (containedSectionSignals < 5 ? 1 : 0) +
    (structuredLayoutSignals < 6 ? 1 : 0) +
    (premiumTypographySignals < 4 ? 1 : 0) +
    (containedLayoutSignals < 3 ? 1 : 0);

  return (
    starterTemplateSignals >= 4 ||
    (usesBasicFontStack && structuredLayoutSignals < 6 && flatBackgroundSignals >= 2 && containedSectionSignals < 5) ||
    (usesBasicFontStack && hasFlatHeroShell && layeredSurfaceSignals < 4) ||
    (hasFlatHeroShell && flatBackgroundSignals >= 3 && structuredLayoutSignals < 7) ||
    (usesCenteredHeroCardShell && flatBackgroundSignals >= 2 && premiumTypographySignals < 5)
  );
}

function assessGeneratedPageQuality(
  html: string,
  input: { pageType: string; primaryCta?: string | null; sectionPlan?: string | null; proofModel?: string | null },
) {
  const bodyHtml = extractBodyHtml(html);
  const text = extractQualityText(html);
  const bodyText = extractQualityText(bodyHtml);
  const issues: string[] = [];
  const majorSectionCount = countPatternMatches(bodyHtml, /<section\b/gi);
  const semanticSectionCount = countPatternMatches(html, /<(section|main|article|header|footer|aside)\b/gi);
  const thematicContainerCount = countPatternMatches(
    html,
    /<(div|section|aside)\b[^>]*(class|id)=["'][^"']*(hero|proof|testimonial|results|outcomes?|stats?|metrics?|benefits?|features?|faq|cta|band|panel|card|comparison|process|steps?|timeline|logos?|trust)[^"']*["'][^>]*>/gi,
  );
  const sectionCount = semanticSectionCount + Math.min(4, thematicContainerCount);
  const headingCount = countPatternMatches(html, /<h[1-6]\b/gi);
  const ctaLinkCount = (html.match(/<a\b[^>]*href=/gi) || []).length;
  const bookingHref = /href=["'][^"']*\/book\/[^"']*["']/i.test(html);
  const bookingAnchor = /id=["'][^"']*(book|schedule|calendar|appointment)[^"']*["']/i.test(html);
  const bookingSignals = /\b(book|booking|schedule|scheduled|appointment|calendar|consultation|strategy call|book a call)\b/i.test(bodyText);
  const proofSignals = hasProofSurface(bodyHtml);
  const firstCtaIndex = findFirstPatternIndex(bodyHtml, [
    /<(a|button)\b[^>]*(class|id)=["'][^"']*(cta|button|book|schedule|consult)[^"']*["'][^>]*>/i,
    /<(a|button)\b[^>]*>\s*(book a call|book now|schedule|schedule now|schedule a call|request a consultation)\s*<\/(a|button)>/i,
    /href=["'][^"']*\/book\/[^"']*["']/i,
  ]);
  const bookingMarkerIndex = findFirstPatternIndex(bodyHtml, [
    /<(section|div|aside)\b[^>]*(class|id)=["'][^"']*(book|booking|schedule|calendar|appointment)[^"']*["'][^>]*>/i,
    /href=["'][^"']*\/book\/[^"']*["']/i,
    />\s*(book a call|book now|schedule|schedule now|schedule a call|request a consultation)\s*</i,
  ]);
  const openingSlice = bodyHtml.slice(0, Math.max(1100, Math.floor(bodyHtml.length * 0.18)));
  const openingActionCount = countPatternMatches(openingSlice, /<(a|button)\b/gi);
  const clutterCardCount = countPatternMatches(
    html,
    /<(div|article|li)\b[^>]*(class|id)=["'][^"']*(card|item|tile|fact|stat|metric|feature|benefit|faq)[^"']*["'][^>]*>/gi,
  );
  const clutterSurfaceCount = countPatternMatches(
    html,
    /<(section|div|aside)\b[^>]*(class|id)=["'][^"']*(faq|features?|benefits?|stats?|metrics?|comparison|steps?|timeline|process)[^"']*["'][^>]*>/gi,
  );
  const hasFaqSurface = /<(section|div|article|details)\b[^>]*(class|id)=["'][^"']*faq[^"']*["'][^>]*>/i.test(html);
  const firstCtaWindow =
    firstCtaIndex >= 0
      ? bodyHtml.slice(Math.max(0, firstCtaIndex - 420), Math.min(bodyHtml.length, firstCtaIndex + 950))
      : openingSlice;
  const immediateCtaWindow =
    firstCtaIndex >= 0
      ? bodyHtml.slice(Math.max(0, firstCtaIndex - 220), Math.min(bodyHtml.length, firstCtaIndex + 420))
      : openingSlice.slice(0, Math.min(openingSlice.length, 640));
  const bookingWindow =
    bookingMarkerIndex >= 0
      ? bodyHtml.slice(Math.max(0, bookingMarkerIndex - 520), Math.min(bodyHtml.length, bookingMarkerIndex + 1100))
      : bodyHtml.slice(Math.max(0, bodyHtml.length - 2000));
  const immediateProofResolved = hasProofSurface(immediateCtaWindow);
  const openingProofResolved = hasProofSurface(firstCtaWindow);
  const bookingProofResolved = hasProofSurface(bookingWindow);
  const genericVisualSystem = hasGenericVisualSystem(html);
  const sceneQuality = analyzeGeneratedSceneQuality(html, input);
  const placeholderAssetSignals =
    /\b(hero-image|placeholder|stock-photo|dummy-image|your-image|replace-me)\b/i.test(html) ||
    /url\((['"]?)(?:https?:\/\/[^)'"\s]+\/)?(?:hero-image|placeholder|stock-photo|dummy-image|your-image|replace-me)[^)'"\s]*\1\)/i.test(html);
  const webinarSignals = /\b(webinar|register|registration|reserve your seat|save your seat|join the session|join us live)\b/i.test(text);
  const agendaSignals = /\b(agenda|what you'll learn|what you will learn|what we'?ll cover|what we will cover|speaker|host|session breakdown)\b/i.test(text);
  const wrongDomainSignals = /\b(funeral|memorial|obituary|obituaries|cremation|cemetery|burial|grief|grieving|graveside|hospice|remembrance)\b/i.test(text);
  const genericEnterpriseCopySignals =
    countPatternMatches(text, /\b(transform your operations|elevate your business efficiency|tailored automation strategy|streamline your operations|unlock efficiency|optimize your business)\b/gi) +
    countPatternMatches(text, /\b(your trusted partner in automation strategy|your queries answered|have questions\? we've got answers)\b/gi);
  const genericTrustClaimSignals = /\btrusted by over \d+\s+(businesses|brands|companies)\b/i.test(text);
  const specificProofSignals = /\b(testimonial|case stud|client stories|client outcomes?|review|results?|saved \d+|increased|reduced|founder|ceo|director|team at)\b/i.test(text);
  const placeholderFaqScaffold =
    /<!--\s*add faq items here\s*-->/i.test(html) ||
    (hasFaqSurface && /\byour queries answered\b/i.test(text) && !/<(details|dt|dd)\b/i.test(html));
  const hasCenteredSingleColumnBookingHero =
    /<(section|div|header)\b[^>]*(class|id)=["'][^"']*hero[^"']*["'][^>]*>/i.test(bodyHtml) &&
    /display\s*:\s*flex/i.test(html) &&
    /flex-direction\s*:\s*column/i.test(html) &&
    /text-align\s*:\s*center/i.test(html) &&
    !/grid-template-columns\s*:/i.test(html) &&
    !/<aside\b/i.test(bodyHtml) &&
    !/(class|id)=["'][^"']*hero-proof[^"']*["']/i.test(bodyHtml);
  const hasDedicatedMidPageSupportBeat = /(class|id)=["'][^"']*(details|process|fit|outcomes?|benefits?|results?|testimonials?|proof-strip|band|comparison|faq)[^"']*["']/i.test(bodyHtml);

  if (wrongDomainSignals) {
    issues.push("Remove wrong-domain language or themes that do not belong on this page.");
  }

  if (placeholderAssetSignals) {
    issues.push("Replace placeholder or guessed hero imagery with a deliberate non-placeholder visual treatment.");
  }

  const thinText = text.length < 520;
  const thinStructure = sectionCount < 3 && headingCount < 3;
  if (thinText && thinStructure) {
    issues.push("The page is still too thin. Add a fuller conversion structure with multiple real sections.");
  }

  if (
    genericVisualSystem &&
    (input.pageType === "booking" || input.pageType === "sales" || input.pageType === "lead-capture" || input.pageType === "landing")
  ) {
    issues.push("The page still reads like a generic starter template. Rebuild the visual system with stronger typography, contained sections, calmer premium surfaces, and a more intentional hero-to-proof composition.");
  }

  if (input.pageType === "booking") {
    if (majorSectionCount < 3 && !hasDedicatedMidPageSupportBeat) {
      issues.push("Booking pages need more than a hero and booking block. Add a real middle support beat for fit, process, outcomes, or proof before the handoff.");
    }
    if (hasCenteredSingleColumnBookingHero) {
      issues.push("Booking pages should not rely on a centered single-column hero shell. Use a stronger decision cluster with an attached proof panel or split composition tied to the booking CTA.");
    }
    if (/<(section|div|header)\b[^>]*(class|id)=["'][^"']*hero[^"']*["'][^>]*>/i.test(html) && /text-align\s*:\s*center/i.test(html) && /max-width\s*:\s*(?:720|760|800|840|880)px\s*[;}]/i.test(html)) {
      issues.push("Booking pages should not rely on a centered single-column hero card. Use a stronger decision cluster with adjacent proof or a split composition tied to the booking CTA.");
    }
    if (!bookingSignals || (!bookingHref && !bookingAnchor && ctaLinkCount < 2)) {
      issues.push("Booking pages need a clear scheduling path with real booking CTA treatment, not generic buttons.");
    }
    if (!proofSignals) {
      issues.push("Booking pages need proof near the conversion path so the visitor trusts the handoff.");
    } else if (!immediateProofResolved) {
      issues.push("Booking pages need a trust cue directly adjacent to the first serious CTA, not just somewhere else in the opening layout.");
    } else if (!openingProofResolved || !bookingProofResolved) {
      issues.push("Booking pages need proof staged beside the first CTA and again near the scheduling handoff, not scattered far away.");
    }
    if (openingActionCount > 1 && /see how|learn more|view details|explore|details/i.test(openingSlice)) {
      issues.push("CTA dominance is diluted in the first screen. Keep one dominant above-the-fold action and demote or remove secondary prompts.");
    }
    if (genericEnterpriseCopySignals >= 2) {
      issues.push("The page still leans on generic enterprise filler instead of specific stakes, outcomes, and offer language for this booking flow.");
    }
    if (genericTrustClaimSignals && !specificProofSignals) {
      issues.push("The proof still reads invented or generic. Replace unsupported trust claims with a concrete testimonial, outcome, or truthful credibility mechanism.");
    }
    if (placeholderFaqScaffold) {
      issues.push("The FAQ output is still placeholder FAQ scaffolding. Replace it with real objection handling or cut it entirely.");
    }
    if ((hasFaqSurface && clutterCardCount >= 8) || (clutterSurfaceCount >= 5 && clutterCardCount >= 10)) {
      issues.push("The page is drifting into ornamental fact clutter. Cut low-value cards, FAQs, and micro-panels so the CTA path stays tight.");
    }
  }

  for (const check of sceneQuality.pageQualityChecks) {
    if (check.tone === "good") continue;
    if (check.key === "opening-frame") {
      issues.push("The first screen still needs one dominant decision cluster so the promise, CTA, and trust cue land in a single scan.");
      continue;
    }
    if (check.key === "hierarchy-contrast") {
      issues.push("The hierarchy still reads flatter than it should; group related content harder and let contrast shifts do more of the priority work.");
      continue;
    }
    if (check.key === "section-rhythm") {
      issues.push("The scroll path still needs stronger section rhythm so the page stops feeling like one continuous run of content.");
      continue;
    }
    if (check.key === "proof-staging") {
      issues.push("Proof is still under-staged; give the first serious ask an adjacent trust surface instead of leaving reassurance buried downstream.");
      continue;
    }
    if (check.key === "cta-placement") {
      issues.push("The conversion spine is still thin; repeat the ask at clearer structural beats instead of relying on one isolated action moment.");
      continue;
    }
    if (check.key === "composition-system") {
      issues.push("The composition is still too thin to feel intentional; add stronger modular containers before layering on more polish.");
    }
  }

  if (input.pageType === "webinar") {
    if (!webinarSignals) {
      issues.push("Webinar pages need an obvious registration or reserve-your-seat path.");
    }
    if (!agendaSignals) {
      issues.push("Webinar pages need agenda, speaker, or what-you'll-learn framing before the registration ask.");
    }
  }

  if (input.primaryCta && !text.includes(String(input.primaryCta).trim().toLowerCase()) && ctaLinkCount === 0) {
    issues.push(`Include the primary CTA path '${String(input.primaryCta).trim()}' in the page structure.`);
  }

  return Array.from(new Set(issues));
}

function newBlockId(prefix = "b"): string {
  const g: any = globalThis as any;
  const uuid = typeof g.crypto?.randomUUID === "function" ? String(g.crypto.randomUUID()) : "";
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function detectInteractiveIntent(text: string): {
  wantsShop: boolean;
  wantsCart: boolean;
  wantsCheckout: boolean;
  wantsCalendar: boolean;
  wantsChatbot: boolean;
  any: boolean;
} {
  const s = String(text || "").toLowerCase();
  const embedVerb = /(add|insert|embed|connect|wire|hook up|place|drop in|include|use my|set up|attach)/;
  const shopNoun = /(shop|store|product|products|buy now|buy\b|cart|checkout|stripe|payment link|price id)/;
  const calendarNoun = /(calendar|scheduler|schedule|appointment|booking widget|booking calendar|calendar embed|book a meeting|book a call)/;
  const chatbotNoun = /(chatbot|chat bot|live chat|website chat|chat widget)/;
  const pricingOnly = /\bpricing\b/.test(s) && !shopNoun.test(s.replace(/pricing/g, ""));
  const wantsShop = !pricingOnly && (embedVerb.test(s) && shopNoun.test(s) || /\b(add to cart|checkout|payment link|stripe checkout)\b/.test(s));
  const wantsCart = /\b(add to cart|cart)\b/.test(s) && (embedVerb.test(s) || /\bcheckout\b/.test(s));
  const wantsCheckout = /\b(checkout|purchase|pay now|stripe checkout)\b/.test(s) && (embedVerb.test(s) || /\bstripe\b/.test(s));
  const wantsCalendar = (embedVerb.test(s) && calendarNoun.test(s)) || /\bembed my calendar\b/.test(s);
  const wantsChatbot = (embedVerb.test(s) && chatbotNoun.test(s)) || /\bembed my chatbot\b/.test(s);
  const any = wantsShop || wantsCart || wantsCheckout || wantsCalendar || wantsChatbot;
  return { wantsShop, wantsCart, wantsCheckout, wantsCalendar, wantsChatbot, any };
}

function detectLocalStyleFixIntent(text: string): boolean {
  const s = String(text || "").toLowerCase();
  return /\b(contrast|readability|readable|legible|visibility|visible|hard to read|can'?t read|text isn'?t showing|text not showing|too light|too dark|washed out)\b/.test(s);
}

function detectExplicitBrandStylingIntent(text: string): boolean {
  const s = String(text || "").toLowerCase();
  return /\b(brand|branding|brand colors?|palette|rebrand|use our colors|match the brand|apply brand|brand refresh|match our style)\b/.test(s);
}

const vagueImprovementIntentPattern = new RegExp(
  [
    "\\bfix (this|it|that|the (page|design|button|buttons|colors?|text|header|nav|link|looks?|styling))",
    "make (this|it|the page) (better|good|great|look good|nicer|cleaner|more professional)",
    "improve (this|it|the (page|design|look|appearance|styling))",
    "clean(?: this|\\s+the page|\\s+it)? up",
    "looks? (bad|off|wrong|ugly|terrible|awful|amateurish|unprofessional|weird|broken|poor)",
    "this (looks? bad|is off|is wrong|is broken|is bad|needs? work|isn'?t right|doesn'?t look right)",
    "polish (this|it|the page)?",
    "just fix (it|this|everything)",
    "everything is (off|wrong|broken)",
    "what'?s wrong with (the|this|it)",
    "\\bupgrade\\b.*\\b(page|design|look)",
    "\\b(overhaul|revamp)\\b",
  ].join("|"),
  "i",
);

function detectVagueImprovementIntent(text: string): boolean {
  const s = String(text || "").toLowerCase();
  // Catches: "fix this", "make this better", "improve", "clean this up", "looks bad",
  // "polish", "this is off", "fix the buttons", "fix the colors", "this looks wrong",
  // "make it look good", "upgrade", "the design is bad", "fix the design", etc.
  return vagueImprovementIntentPattern.test(s);
}

function splitBusinessProfileContext(raw: string): { guidance: string; styling: string } {
  const text = String(raw || "").trim();
  if (!text) return { guidance: "", styling: "" };

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const guidanceLines: string[] = [];
  const stylingLines: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("- ")) continue;
    if (/^-\s*Brand\s+(primary|secondary|accent|text|font)/i.test(line)) {
      stylingLines.push(line);
      continue;
    }
    guidanceLines.push(line);
  }

  return {
    guidance: guidanceLines.length
      ? [
          "BUSINESS_PROFILE_GUIDANCE (business and audience context only; do not treat this as automatic styling instructions):",
          ...guidanceLines,
        ].join("\n")
      : "",
    styling: stylingLines.length
      ? [
          "BUSINESS_BRAND_STYLE (optional styling guidance; use only if the user clearly asks for branding or redesign and the result improves readability):",
          ...stylingLines,
        ].join("\n")
      : "",
  };
}

function buildAiResultMeta(opts: {
  mode: "question" | "interactive-blocks" | "html-update";
  hadCurrentHtml: boolean;
  wantsDesignRedesign: boolean;
  contextKeyCount: number;
  contextMediaCount: number;
  changelog?: Record<string, unknown> | null;
}) {
  const warnings: string[] = [];

  if (opts.contextKeyCount === 0 && opts.contextMediaCount === 0) {
    warnings.push("No extra context was attached, so this run relied on the current page and saved business profile only.");
  }

  if (!opts.hadCurrentHtml && opts.mode === "html-update") {
    warnings.push("This run started from a fresh page document, so layout and offer detail may still need tightening.");
  }

  if (opts.hadCurrentHtml && opts.wantsDesignRedesign && opts.mode === "html-update") {
    warnings.push("This was treated as a full redesign of the page HTML, not a small in-place patch.");
  }

  const fallbackSummary =
    opts.mode === "question"
      ? "AI needs one missing detail before it can safely change the page."
      : opts.mode === "interactive-blocks"
        ? "Inserted working builder blocks for the requested interactive features and refreshed the page HTML snapshot."
        : opts.hadCurrentHtml
          ? opts.wantsDesignRedesign
            ? "Reworked the current page into a fuller conversion-focused HTML document."
            : "Updated the current page HTML from your prompt."
          : "Generated a new hosted page HTML document from your prompt.";

  const changelogSummary =
    opts.changelog && typeof opts.changelog.summary === "string" && opts.changelog.summary.trim()
      ? String(opts.changelog.summary).trim().slice(0, 400)
      : null;

  const summary = changelogSummary ?? fallbackSummary;

  return {
    summary,
    warnings,
    at: new Date().toISOString(),
    ...(opts.changelog ? { changelog: opts.changelog } : {}),
  };
}

function buildShellFramePromptBlock(frame: ReturnType<typeof resolveFunnelShellFrame>) {
  if (!frame) return "";

  return [
    `SHELL_FRAME: ${frame.label}`,
    `- Summary: ${frame.summary}`,
    `- Shell concept: ${frame.shellConcept}`,
    `- Section plan: ${frame.sectionPlan}`,
    `- Visual tone: ${frame.visualTone}`,
    `- Proof model: ${frame.proofModel}`,
    `- CTA rhythm: ${frame.ctaRhythm}`,
    `- Brand use: ${frame.brandUse}`,
    "- Design directives:",
    ...frame.designDirectives.map((directive) => `  - ${directive}`),
  ].join("\n");
}

function normalizeAgentId(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  const cleaned = s.slice(0, 120);
  if (!cleaned.startsWith("agent_")) return "";
  return cleaned;
}

async function getOwnerChatAgentIds(ownerId: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    const clean = normalizeAgentId(id);
    if (!clean) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  const receptionist = await getAiReceptionistServiceData(ownerId).catch(() => null);
  if (receptionist) {
    push(receptionist.settings.chatAgentId);
  }

  const campaigns = await prisma.portalAiOutboundCallCampaign
    .findMany({
      where: { ownerId },
      select: { chatAgentId: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    })
    .catch(() => [] as Array<{ chatAgentId: string | null }>);

  for (const c of campaigns) {
    if (c?.chatAgentId) push(c.chatAgentId);
  }

  return out.slice(0, 50);
}

function buildInteractiveBlocks(opts: {
  funnelName: string;
  pageTitle: string;
  ownerId: string;
  stripeProducts: Array<{
    id: string;
    name: string;
    description: string | null;
    images: string[];
    defaultPriceId: string;
    unitAmount: number | null;
    currency: string;
  }>;
  calendarId?: string;
  chatAgentId?: string;
  intent: ReturnType<typeof detectInteractiveIntent>;
}): CreditFunnelBlock[] {
  const blocks: CreditFunnelBlock[] = [];

  blocks.push({ id: newBlockId("page"), type: "page", props: {} });

  blocks.push({
    id: newBlockId("header"),
    type: "headerNav",
    props: {
      sticky: true,
      transparent: false,
      items: [],
    },
  });

  blocks.push({
    id: newBlockId("hero"),
    type: "section",
    props: {
      children: [
        {
          id: newBlockId("h1"),
          type: "heading",
          props: { text: opts.pageTitle || opts.funnelName || "Welcome", level: 1 },
        },
        {
          id: newBlockId("p"),
          type: "paragraph",
          props: {
            text:
              "Explore what we offer below. Add items to your cart, checkout securely, or book a time to talk. You can do it all on this page.",
          },
        },
        {
          id: newBlockId("cart"),
          type: "cartButton",
          props: { text: "Cart" },
        },
      ],
    },
  });

  if (opts.intent.wantsShop || opts.intent.wantsCart || opts.intent.wantsCheckout) {
    const purchasable = opts.stripeProducts
      .filter((p) => p && p.defaultPriceId)
      .slice(0, 6);

    if (purchasable.length) {
      blocks.push({
        id: newBlockId("shopSection"),
        type: "section",
        props: {
          children: [
            {
              id: newBlockId("shopH"),
              type: "heading",
              props: { text: "Shop", level: 2 },
            },
            {
              id: newBlockId("shopCols"),
              type: "columns",
              props: {
                gapPx: 18,
                stackOnMobile: true,
                columns: purchasable.slice(0, 3).map((p) => {
                  const children: CreditFunnelBlock[] = [];
                  const img = p.images?.[0] ? String(p.images[0]).trim() : "";
                  if (img) {
                    children.push({
                      id: newBlockId("img"),
                      type: "image",
                      props: { src: img, alt: p.name || "Product" },
                    });
                  }

                  children.push({
                    id: newBlockId("name"),
                    type: "heading",
                    props: { text: p.name, level: 3 },
                  });

                  if (p.description) {
                    children.push({
                      id: newBlockId("desc"),
                      type: "paragraph",
                      props: { text: String(p.description).slice(0, 320) },
                    });
                  }

                  children.push({
                    id: newBlockId("add"),
                    type: "addToCartButton",
                    props: {
                      priceId: p.defaultPriceId,
                      quantity: 1,
                      productName: p.name,
                      ...(p.description ? { productDescription: String(p.description).slice(0, 320) } : {}),
                      text: "Add to cart",
                    },
                  });

                  children.push({
                    id: newBlockId("buy"),
                    type: "salesCheckoutButton",
                    props: {
                      priceId: p.defaultPriceId,
                      quantity: 1,
                      productName: p.name,
                      ...(p.description ? { productDescription: String(p.description).slice(0, 320) } : {}),
                      text: "Buy now",
                    },
                  });

                  return { markdown: "", children };
                }),
              },
            },
          ],
        },
      });
    }
  }

  if (opts.intent.wantsCalendar && opts.calendarId) {
    blocks.push({
      id: newBlockId("calSection"),
      type: "section",
      props: {
        children: [
          { id: newBlockId("calH"), type: "heading", props: { text: "Book a time", level: 2 } },
          {
            id: newBlockId("calEmbed"),
            type: "calendarEmbed",
            props: { calendarId: opts.calendarId, height: 760 },
          },
        ],
      },
    });
  }

  if (opts.intent.wantsChatbot && opts.chatAgentId) {
    blocks.push({
      id: newBlockId("chatbot"),
      type: "chatbot",
      props: {
        agentId: opts.chatAgentId,
        launcherStyle: "bubble",
        placementX: "right",
        placementY: "bottom",
      },
    });
  }

  return blocks;
}

function buildChangelogAssistantMessage(changelog: Record<string, unknown>): string {
  const parts: string[] = [];

  if (typeof changelog.summary === "string" && changelog.summary.trim()) {
    parts.push(changelog.summary.trim());
  }

  const changes = Array.isArray(changelog.changes) ? changelog.changes : [];
  if (changes.length) {
    const lines = changes
      .slice(0, 5)
      .map((c: any) => {
        if (!c || typeof c !== "object") return null;
        const section = typeof c.section === "string" ? c.section.trim() : "";
        const what = typeof c.what === "string" ? c.what.trim() : "";
        const why = typeof c.why === "string" ? c.why.trim() : "";
        if (!section && !what) return null;
        return why ? `**${section}**: ${what} — ${why}` : `**${section}**: ${what}`;
      })
      .filter(Boolean) as string[];
    if (lines.length) parts.push(`\n${lines.join("\n")}`);
  }

  const notes = Array.isArray(changelog.conversionNotes) ? changelog.conversionNotes : [];
  if (notes.length) {
    const noteLines = notes
      .slice(0, 3)
      .map((n: any) => (typeof n === "string" ? `- ${n.trim()}` : null))
      .filter(Boolean) as string[];
    if (noteLines.length) parts.push(`\nFunnel notes:\n${noteLines.join("\n")}`);
  }

  return parts.join("").trim().slice(0, 1200) || "Page updated. Preview it and let me know what to change next.";
}

async function generatePageUpdatedAssistantText(opts: { pageTitle?: string; funnelName?: string }) {
  const payload = {
    pageTitle: String(opts.pageTitle || "").trim().slice(0, 160) || null,
    funnelName: String(opts.funnelName || "").trim().slice(0, 160) || null,
  };

  const system =
    "You are an assistant inside a funnel builder. The page has just been updated. Write a short, friendly confirmation message that invites the user to preview the page and tell you what to tweak next. Do not claim you can see their preview. Keep it to 1-3 sentences.";

  try {
    return String(await generateText({ system, user: `Context (JSON):\n${JSON.stringify(payload, null, 2)}` })).trim();
  } catch {
    return "";
  }
}

type AiAttachment = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

type ContextMedia = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

function coerceAttachments(raw: unknown): AiAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AiAttachment[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const url = typeof (it as any).url === "string" ? (it as any).url.trim() : "";
    if (!url) continue;
    const fileName = typeof (it as any).fileName === "string" ? (it as any).fileName.trim() : undefined;
    const mimeType = typeof (it as any).mimeType === "string" ? (it as any).mimeType.trim() : undefined;
    out.push({ url, fileName, mimeType });
    if (out.length >= 12) break;
  }
  return out;
}

function coerceContextMedia(raw: unknown): ContextMedia[] {
  if (!Array.isArray(raw)) return [];
  const out: ContextMedia[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const url = typeof (it as any).url === "string" ? (it as any).url.trim() : "";
    if (!url) continue;
    const fileName = typeof (it as any).fileName === "string" ? (it as any).fileName.trim() : undefined;
    const mimeType = typeof (it as any).mimeType === "string" ? (it as any).mimeType.trim() : undefined;
    out.push({ url, fileName, mimeType });
    if (out.length >= 24) break;
  }
  return out;
}

type StripePrice = {
  id: string;
  unit_amount: number | null;
  currency: string;
  type?: string;
  recurring?: unknown;
};

type StripeProduct = {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  active: boolean;
  default_price?: StripePrice | string | null;
};

type StripeList<T> = { data: T[] };

async function getStripeProductsForOwner(ownerId: string) {
  const secretKey = await getStripeSecretKeyForOwner(ownerId).catch(() => null);
  if (!secretKey) return { ok: false as const, products: [] as Array<{ id: string; name: string; description: string | null; images: string[]; defaultPriceId: string; unitAmount: number | null; currency: string }> };

  const list = await stripeGetWithKey<StripeList<StripeProduct>>(secretKey, "/v1/products", {
    limit: 100,
    active: true,
    "expand[]": ["data.default_price"],
  }).catch(() => null);

  const products = Array.isArray(list?.data)
    ? list!.data
        .filter((p) => p && typeof p === "object" && (p as any).active)
        .map((p) => {
          const dp = p.default_price && typeof p.default_price === "object" ? (p.default_price as StripePrice) : null;
          return {
            id: String(p.id || "").trim(),
            name: String(p.name || "").trim(),
            description: p.description ? String(p.description) : null,
            images: Array.isArray(p.images) ? p.images.map((s) => String(s)).filter(Boolean).slice(0, 4) : [],
            defaultPriceId: dp?.id ? String(dp.id).trim() : "",
            unitAmount: typeof dp?.unit_amount === "number" ? dp.unit_amount : null,
            currency: String(dp?.currency || "usd").toLowerCase() || "usd",
          };
        })
        .filter((p) => p.id && p.name)
    : [];

  return { ok: true as const, products };
}

function toAbsoluteUrl(req: Request, url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin = new URL(req.url).origin;
  return new URL(u, origin).toString();
}

function coerceContextKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    out.push(s.slice(0, 80));
    if (out.length >= 30) break;
  }
  return out;
}

function buildCondensedAiHistory(rawHistory: unknown, maxMessages = 6, maxCharsPerMessage = 500) {
  if (!Array.isArray(rawHistory)) return [] as Array<{ role: "user" | "assistant"; content: string }>;

  return rawHistory
    .slice(-maxMessages)
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = (message as any).role === "assistant" ? "assistant" : "user";
      const content = String((message as any).content || "").replace(/\s+/g, " ").trim().slice(0, maxCharsPerMessage);
      if (!content) return null;
      return { role, content };
    })
    .filter((message): message is { role: "user" | "assistant"; content: string } => Boolean(message));
}

function buildRecentIterationMemory(rawHistory: unknown, maxItems = 4) {
  if (!Array.isArray(rawHistory)) return "";

  const items = rawHistory
    .slice(-8)
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = (message as any).role === "assistant" ? "assistant" : "user";
      const content = String((message as any).content || "").replace(/\s+/g, " ").trim().slice(0, 280);
      if (!content) return null;
      return `${role === "assistant" ? "- Last applied change or learned note" : "- Recent user direction"}: ${content}`;
    })
    .filter(Boolean) as string[];

  return items.length
    ? ["RECENT_ITERATION_MEMORY:", ...items.slice(-maxItems), ""].join("\n")
    : "";
}

function buildRecentIterationNotes(rawHistory: unknown, maxItems = 4) {
  if (!Array.isArray(rawHistory)) return [] as string[];

  return rawHistory
    .slice(-8)
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = (message as any).role === "assistant" ? "assistant" : "user";
      const content = String((message as any).content || "").replace(/\s+/g, " ").trim().slice(0, 220);
      if (!content) return null;
      return `${role === "assistant" ? "Last applied change or learned note" : "Recent user direction"}: ${content}`;
    })
    .filter((item): item is string => Boolean(item))
    .slice(-maxItems);
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const basePath = auth.variant === "credit" ? "/credit" : "";

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });

  const currentHtmlFromClient = typeof body?.currentHtml === "string" ? body.currentHtml : null;
  const wasBlocksExport = body?.wasBlocksExport === true;
  const selectedRegion =
    body?.selectedRegion && typeof body.selectedRegion === "object"
      ? {
          key: typeof body.selectedRegion.key === "string" ? body.selectedRegion.key.trim().slice(0, 120) : "",
          label: typeof body.selectedRegion.label === "string" ? body.selectedRegion.label.trim().slice(0, 120) : "",
          summary: typeof body.selectedRegion.summary === "string" ? body.selectedRegion.summary.trim().slice(0, 240) : "",
          html: typeof body.selectedRegion.html === "string" ? body.selectedRegion.html : "",
        }
      : null;
  const attachments = coerceAttachments(body?.attachments);
  const contextKeys = coerceContextKeys(body?.contextKeys);
  const contextMedia = coerceContextMedia(body?.contextMedia);
  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();
  const allRegions: Array<{ key: string; label: string; summary: string }> = Array.isArray(body?.allRegions)
    ? (body.allRegions as any[])
        .filter((r) => r && typeof r === "object" && typeof r.key === "string" && r.key.trim())
        .slice(0, 12)
        .map((r) => ({
          key: String(r.key).trim().slice(0, 120),
          label: String(r.label || r.key).trim().slice(0, 120),
          summary: String(r.summary || "").trim().slice(0, 240),
        }))
    : [];

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: withDraftHtmlSelect({
      id: true,
      slug: true,
      title: true,
      editorMode: true,
      blocksJson: true,
      customChatJson: true,
      customHtml: true,
      funnel: { select: { id: true, slug: true, name: true } },
    }, hasDraftHtml),
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const normalizedPage = normalizeDraftHtml(page);
  const ownerId = auth.session.user.id;
  const settingsPromise = getCreditFunnelBuilderSettings(ownerId).catch(() => ({} as Record<string, unknown>));
  const businessContextPromise = getBusinessProfileAiContext(ownerId).catch(() => "");
  const stripeProductsPromise = getStripeProductsForOwner(ownerId).catch(() => ({ ok: false as const, products: [] as any[] }));
  const bookingCalendarsPromise = getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] as any[] }));
  const bookingSitePromise = prisma.portalBookingSite
    .findUnique({
      where: { ownerId },
      select: {
        slug: true,
        enabled: true,
        title: true,
        description: true,
        durationMinutes: true,
        timeZone: true,
      },
    })
    .catch(() => null);
  const [settings, businessContext, bookingCalendars, bookingSite] = await Promise.all([
    settingsPromise,
    businessContextPromise,
    bookingCalendarsPromise,
    bookingSitePromise,
  ]);
  const effectiveFunnelBrief = inferFunnelBriefProfile({
    existing: body?.funnelBrief || readFunnelBrief(settings, normalizedPage.funnel.id),
    funnelName: normalizedPage.funnel.name,
    funnelSlug: normalizedPage.funnel.slug,
  });
  const effectiveIntentProfile = inferFunnelPageIntentProfile({
    existing:
      body?.intentProfile ||
      readFunnelPageBrief(settings, normalizedPage.id) ||
      extractFunnelPageIntentProfile(normalizedPage.customChatJson),
    prompt,
    funnelBrief: effectiveFunnelBrief,
    funnelName: normalizedPage.funnel.name,
    funnelSlug: normalizedPage.funnel.slug,
    pageTitle: normalizedPage.title,
    pageSlug: normalizedPage.slug,
  });
  const routeLabel = buildFunnelPageRouteLabel(normalizedPage.funnel.slug, normalizedPage.slug);
  const shellFrame = resolveFunnelShellFrame({
    pageType: effectiveIntentProfile.pageType,
    formStrategy: effectiveIntentProfile.formStrategy,
  });
  const shellFrameBlock = buildShellFramePromptBlock(shellFrame);
  const storedExhibitArchetypePack = readFunnelExhibitArchetypePack(settings, normalizedPage.funnel.id);
  const relevantArchetypes = selectRelevantFunnelExhibitArchetypes(storedExhibitArchetypePack, {
    pageType: effectiveIntentProfile.pageType,
    prompt,
    routeLabel,
    pageTitle: normalizedPage.title,
  });
  const exhibitArchetypeBlock = buildFunnelExhibitArchetypeBlock(storedExhibitArchetypePack, {
    pageType: effectiveIntentProfile.pageType,
    prompt,
    routeLabel,
    pageTitle: normalizedPage.title,
  });
  const visualWhyBlock = buildFunnelVisualWhyBlock({
    pageType: effectiveIntentProfile.pageType,
    prompt,
    shellFrame,
    archetypes: relevantArchetypes,
  });
  const strategicBusinessContext = [businessContext, exhibitArchetypeBlock].filter(Boolean).join("\n\n");
  const enabledBookingCalendars = Array.isArray((bookingCalendars as any)?.calendars)
    ? ((bookingCalendars as any).calendars as any[])
        .filter((calendar) => calendar && typeof calendar === "object" && String(calendar.id || "").trim() && calendar.enabled !== false)
        .slice(0, 12)
    : [];
  const selectedBookingRouting = readFunnelBookingRouting(settings ?? null, funnelId);
  const defaultBookingCalendarId = resolveFunnelBookingCalendarId(settings ?? null, funnelId, enabledBookingCalendars);
  const defaultBookingCalendar = enabledBookingCalendars.find((calendar) => String(calendar?.id || "").trim() === defaultBookingCalendarId) ?? null;
  const bookingSiteSlug = typeof (bookingSite as any)?.slug === "string" ? String((bookingSite as any).slug).trim() : "";
  const defaultBookingPublicUrl =
    bookingSiteSlug && defaultBookingCalendarId
      ? `${basePath}/book/${encodeURIComponent(bookingSiteSlug)}/c/${encodeURIComponent(defaultBookingCalendarId)}`
      : bookingSiteSlug
        ? `${basePath}/book/${encodeURIComponent(bookingSiteSlug)}`
        : "";
  const effectiveCurrentHtml =
    (currentHtmlFromClient && currentHtmlFromClient.trim() ? currentHtmlFromClient : getFunnelPageCurrentHtml(page)).trim();
  const wantsDesignRedesign = /\b(hero|proof strip|credibility strip|benefits?|testimonials?|cta|call to action|layout|redesign|premium|modern|landing page|sales page)\b/i.test(prompt);
  const prevChat = stripFunnelPageIntentMessages<Record<string, unknown>>(normalizedPage.customChatJson);
  const aiHistory = buildCondensedAiHistory(prevChat);
  const recentIterationNotes = buildRecentIterationNotes(prevChat);

  const promptStrategyPromise = synthesizeFunnelGenerationPrompt({
    surface: "page-html",
    requestPrompt: prompt,
    routeLabel,
    funnelName: normalizedPage.funnel.name,
    pageTitle: normalizedPage.title,
    businessContext: strategicBusinessContext,
    funnelBrief: effectiveFunnelBrief,
    intentProfile: effectiveIntentProfile,
    currentHtml: effectiveCurrentHtml,
    selectedRegion: selectedRegion
      ? {
          label: selectedRegion.label,
          summary: selectedRegion.summary,
        }
      : null,
    contextKeys,
    contextMedia,
    recentChatHistory: aiHistory,
    recentIterationMemory: recentIterationNotes,
  });

  const intent = detectInteractiveIntent(prompt);
  if (intent.any) {
    const [promptStrategy, stripeProducts] = await Promise.all([promptStrategyPromise, stripeProductsPromise]);
    const strategicPrompt = promptStrategy.prompt;
    const enabledCalendars = enabledBookingCalendars;
    const calendarId = resolveFunnelBookingCalendarId(settings ?? null, funnelId, enabledCalendars).slice(0, 50);

    const agentIds = await getOwnerChatAgentIds(ownerId).catch(() => [] as string[]);
    const chatAgentId = agentIds[0] ? String(agentIds[0]).trim() : "";

    const purchasable = stripeProducts.ok
      ? (stripeProducts.products as any[]).filter((p) => p && typeof p === "object" && String((p as any).defaultPriceId || "").trim())
      : [];

    const missingShop = (intent.wantsShop || intent.wantsCart || intent.wantsCheckout) && purchasable.length === 0;
    const missingCalendar = intent.wantsCalendar && !calendarId;
    const missingChatbot = intent.wantsChatbot && !chatAgentId;

    if (missingShop || missingCalendar || missingChatbot) {
      const parts: string[] = [];
      if (missingShop) parts.push("I can add a working Shop/Cart/Checkout, but I don't see any Stripe products with default prices yet. Do you want to connect Stripe and add products first?");
      if (missingCalendar) parts.push("I can embed a working booking calendar, but you don't have any booking calendars configured yet. Which calendar should I use (or should I create one in Booking settings first)?");
      if (missingChatbot) parts.push("I can add a working chatbot widget, but I don't see an ElevenLabs chat agent ID for this account yet. What agent ID should I use?");
      const question = parts[0] ? parts[0].slice(0, 800) : "Which interactive block should I add (shop, calendar, or chatbot)?";

      const prevChat = Array.isArray(normalizedPage.customChatJson) ? (normalizedPage.customChatJson as any[]) : [];
      const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };
      const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
      const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

      const updated = await prisma.creditFunnelPage.update({
        where: { id: page.id },
        data: {
          customChatJson: nextChat,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          editorMode: true,
          blocksJson: true,
          customHtml: true,
          customChatJson: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({
        ok: true,
        question,
        aiResult: buildAiResultMeta({
          mode: "question",
          hadCurrentHtml: Boolean(effectiveCurrentHtml),
          wantsDesignRedesign,
          contextKeyCount: contextKeys.length,
          contextMediaCount: contextMedia.length,
        }),
        page: updated,
      });
    }

    const blocks = buildInteractiveBlocks({
      funnelName: normalizedPage.funnel.name,
      pageTitle: normalizedPage.title,
      ownerId,
      stripeProducts: stripeProducts.ok ? (stripeProducts.products as any) : [],
      ...(calendarId ? { calendarId } : {}),
      ...(chatAgentId ? { chatAgentId } : {}),
      intent,
    });

    const prevChat = Array.isArray(normalizedPage.customChatJson) ? (normalizedPage.customChatJson as any[]) : [];
    const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };
    const assistantMsg = {
      role: "assistant",
      content:
        "Done. I inserted real Funnel Builder blocks for the interactive parts (shop/cart/checkout/calendar/chatbot) so everything works in preview and on the hosted page. I also generated a full Custom code HTML snapshot of the page so you can switch to Custom code and keep the preview.",
      at: new Date().toISOString(),
    };
    const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

    const htmlSnapshot = blocksToCustomHtmlDocument({
      blocks,
      pageId: normalizedPage.id,
      ownerId,
      bookingSiteSlug: bookingSiteSlug || undefined,
      defaultBookingCalendarId: defaultBookingCalendarId || undefined,
      basePath,
      title: normalizedPage.title || normalizedPage.funnel.name || "Funnel page",
    });

    const updated = await prisma.creditFunnelPage.update({
      where: { id: normalizedPage.id },
      data: applyDraftHtmlWriteCompat({
        editorMode: "BLOCKS",
        blocksJson: blocks as any,
        ...createFunnelPageMirroredHtmlUpdate(htmlSnapshot),
        customChatJson: nextChat,
      }, hasDraftHtml),
      select: withDraftHtmlSelect({
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        blocksJson: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      }, hasDraftHtml),
    });

    return NextResponse.json({
      ok: true,
      aiResult: buildAiResultMeta({
        mode: "interactive-blocks",
        hadCurrentHtml: Boolean(effectiveCurrentHtml),
        wantsDesignRedesign,
        contextKeyCount: contextKeys.length,
        contextMediaCount: contextMedia.length,
      }),
      page: normalizeDraftHtml(updated),
    });
  }

  const formsPromise = prisma.creditForm.findMany({
    where: { ownerId: auth.session.user.id },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    select: { slug: true, name: true, status: true },
  });
  const [promptStrategy, stripeProducts, forms] = await Promise.all([promptStrategyPromise, stripeProductsPromise, formsPromise]);
  const strategicPrompt = promptStrategy.prompt;
  const exhibitPlannerContractBlock = buildExhibitPlannerContractBlock(promptStrategy.exhibitAdvisory);
  const wantsBookingPage = effectiveIntentProfile.pageType === "booking" || effectiveIntentProfile.formStrategy === "booking";
  const bookingRuntimeBlock = [
    "BOOKING_RUNTIME:",
    wantsBookingPage
      ? "- This page should behave like a real native booking page, not just a marketing page with a generic CTA."
      : "- Booking runtime is available if you need a scheduling handoff.",
    `- Booking site configured: ${bookingSite ? "yes" : "no"}`,
    bookingSiteSlug ? `- Booking site slug: ${bookingSiteSlug}` : "",
    bookingSite?.enabled === true ? "- Booking site status: enabled" : bookingSite ? "- Booking site status: disabled" : "",
    bookingSite?.title ? `- Booking site title: ${String(bookingSite.title).trim()}` : "",
    bookingSite?.description ? `- Booking site description: ${String(bookingSite.description).trim()}` : "",
    typeof bookingSite?.durationMinutes === "number" ? `- Default meeting length: ${bookingSite.durationMinutes} minutes` : "",
    bookingSite?.timeZone ? `- Booking timezone: ${String(bookingSite.timeZone).trim()}` : "",
    `- Enabled calendars: ${enabledBookingCalendars.length}`,
    selectedBookingRouting?.calendarId ? `- Funnel-selected calendar id: ${selectedBookingRouting.calendarId}` : "",
    defaultBookingCalendarId ? `- Default calendar id for this first draft: ${defaultBookingCalendarId}` : "",
    defaultBookingCalendar?.title ? `- Default calendar title: ${String(defaultBookingCalendar.title).trim()}` : "",
    defaultBookingCalendar?.description ? `- Default calendar description: ${String(defaultBookingCalendar.description).trim()}` : "",
    defaultBookingCalendar?.meetingLocation ? `- Meeting location: ${String(defaultBookingCalendar.meetingLocation).trim()}` : "",
    defaultBookingCalendar?.meetingDetails ? `- Meeting details: ${String(defaultBookingCalendar.meetingDetails).trim()}` : "",
    defaultBookingPublicUrl ? `- Native booking URL for the default calendar: ${defaultBookingPublicUrl}` : "",
    wantsBookingPage
      ? "- First-draft booking rule: include an above-the-fold CTA and a dedicated booking section. The page should guide visitors from promise and proof into scheduling, not bury scheduling as a footer afterthought."
      : "",
    wantsBookingPage
      ? "- Hero proof rule: place at least one concrete proof surface directly beside or immediately below the primary hero CTA. Do not make the visitor scroll past a long generic benefits stack before seeing evidence."
      : "",
    wantsBookingPage
      ? "- Booking trust rule: put another proof surface directly above or inside the booking section so the handoff into scheduling feels earned, not abrupt."
      : "",
    wantsBookingPage && defaultBookingPublicUrl
      ? "- Use the provided native booking URL for the real scheduling handoff. Prefer a dedicated booking section with an embedded native scheduling widget in the first take; fall back to a direct booking link only if the layout would clearly work better that way."
      : wantsBookingPage
        ? "- No live calendar URL is currently available. Still reserve a truthful booking section and explain the scheduling handoff clearly instead of pretending the booking step is already embedded."
        : "",
    wantsBookingPage
      ? "- Do not invent a separate long intake form when the native booking flow can already collect contact details and notes."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const baseSystem = [
    "You generate a single self-contained HTML document for a marketing funnel page for the user's business.",
    "If the request is ambiguous or missing key details, ask ONE concise follow-up question instead of guessing.",
    "Return EITHER:",
    "- If you have enough information: a ```html fenced block containing the full HTML document,",
    "  optionally followed (on a new line, after the closing ```) by a ```json fenced block with a structured change log (see CHANGE_LOG below).",
    "- If ONE critical detail is missing: only a ```json fenced block: { \"question\": \"...\" }",
    "OUTPUT ORDER when producing HTML: HTML fence first, then JSON change log second. Never output the JSON change log without the HTML fence preceding it.",
    "Do NOT output any other text.",
    "CHANGE_LOG (include only when editing an existing page — omit on first-time generation):",
    "  ```json",
    "  {",
    "    \"summary\": \"One sentence (<120 chars) describing the highest-value user-facing change. Prefer conversion or hierarchy outcomes over generic spacing/color mentions.\",",
    "    \"changes\": [{ \"section\": \"...\", \"what\": \"...\", \"why\": \"...\" }],",
    "    \"preserved\": [\"List any tracking scripts/pixels preserved (GTM, Meta Pixel, GA4, etc.)\"],",
    "    \"conversionNotes\": [\"One note per funnel friction point addressed or still present\"]",
    "  }",
    "  ```",
    "Keep each change log item under 120 chars. Only list sections you actually touched.",
    "Constraints:",
    "- Use plain HTML + inline <style>. No UI framework CDNs (React, Vue, Bootstrap CSS, etc.).",
    "- Analytics and tracking scripts (Google Tag Manager, Meta Pixel, GA4, Segment, custom dataLayer pushes) ARE allowed. Preserve them if present in CURRENT_HTML. Include them if the user requests tracking.",
    "- Mobile-first, modern, clean styling.",
    "- Keep the page naturally scrollable. Do not lock the page into viewport-height wrappers, body overflow hidden, or fake app-shell chrome unless the user explicitly asks for it.",
    "- Avoid hardcoded device-width assumptions. Do not build around fixed 390px/430px phone shells or other narrow viewport hacks.",
    "- Prefer normal document flow over fragile absolute or fixed positioning for major sections.",
    "- Use relative links (no /portal/* links).",
    "- Every CTA href must be real and usable. Never output placeholder URLs, example.com links, javascript: links, or empty '#'-only buttons.",
    "Integration:",
    `- This page will be hosted at: ${basePath}/f/${page.funnel.slug}`,
    `- Hosted forms are at: ${basePath}/forms/{formSlug}`,
    `- Form submissions happen via POST /api/public${basePath}/forms/{formSlug}/submit (handled by our hosted form pages)`,
    `- If you need a form, link to ${basePath}/forms/{formSlug} with a clear CTA button.`,
    "Rules:",
    "- Do not invent form slugs. Only reference a form if the user explicitly asks to embed/link a form, or if they clearly asked for a lead-capture form.",
    "- If the user asks for a shop/store, use STRIPE_PRODUCTS if available.",
    "- If STRIPE_PRODUCTS is present, do NOT ask what products they sell.",
    "- If STRIPE_PRODUCTS is empty and the user asks for a shop/store, ask ONE question: whether they want to connect Stripe or describe their products.",
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Output rules:",
    "- Include <meta name=\"viewport\"> and a <title>.",
    "- Avoid placeholder braces like {{var}} unless asked.",
    "- Avoid lorem ipsum, generic 'your company' copy, and weak filler sections.",
    "- Avoid stock UI font stacks and starter-template typography such as Arial, Helvetica, Segoe UI, Tahoma, Geneva, Verdana, or bare sans-serif-only styling unless the page already uses them intentionally and the user asked to preserve that exact system.",
    "- If no real image asset is available, do not invent placeholder hero image URLs or fake stock-image paths. Use an intentional layout, gradient, illustration-free composition, or uploaded asset instead.",
    "- If a baseline shell concept and section plan are provided, use them as the starting architecture for the first draft and for later retakes unless the user explicitly asks to replace that shell.",
    "- Recommendation-first behavior: synthesize the strongest coherent foundation from BUSINESS_PROFILE, FUNNEL_BRIEF, INTENT_PROFILE, route cues, and the user's request before falling back to questions.",
    "- Ask a question only when the ambiguity would materially change the page architecture, offer framing, CTA path, or required platform wiring.",
    "- For service funnels, booking pages, consultation offers, or pages where pricing can be defined later, generate the strongest first draft you can without stopping to ask about pricing, packages, or exact offer tiers.",
    "- Phrases like 'book a call', 'pricing later', 'we can refine the offer later', or 'figure out pricing later' are not reasons to stop and ask an ecommerce or calendar wiring question unless the user explicitly asked for a real embedded checkout, cart, or calendar widget.",
    "- For booking or consultation pages, the first take must place a real scheduling path in the architecture: hero CTA, trust sequence, and a dedicated booking section. Do not leave the page as generic copy with dead booking buttons.",
    "- If BOOKING_RUNTIME provides a native booking URL or default calendar, use that concrete runtime for the initial draft instead of placeholder links.",
    "- On booking pages, guide the visitor top-to-bottom into scheduling. If you use an in-page booking section, anchor the hero CTA into that section so the path feels intentional.",
    "- For booking pages with a native booking URL, an in-page anchor alone is not enough. Include at least one real booking link or embedded booking element that points to the provided runtime.",
    "- On the first take of a booking page, prefer embedding the native booking flow inside the booking section so the visitor can schedule without leaving the page unless the requested design clearly calls for a cleaner outbound handoff.",
    "- On booking pages, pair the first CTA with visible proof in the hero or the very next band: a testimonial excerpt, quantified result, trusted-by strip, or outcomes panel.",
    "- On booking pages, do not stack all trust-building proof below a long narrative section run. The visitor should see evidence before and at the booking handoff.",
    "- On booking pages, do not use a centered single-column hero card as the main above-the-fold structure. Use a split composition, attached proof panel, or another decision cluster that keeps the CTA and trust cue in one scan.",
    "- FUNNEL_BRIEF, PAGE_INTENT, shell concept, and section plan are working guidance, not frozen truth.",
    "- When editing an existing page, CURRENT_HTML, the newest user instruction, RECENT_ITERATION_MEMORY, and concrete runtime blocks are fresher than older saved foundation text.",
    "- If older saved direction conflicts with the current page or the latest clearer context, update the stale direction instead of preserving it mechanically.",
  ];

  const hasCurrentHtml = Boolean(effectiveCurrentHtml);
  const hasSelectedRegion = Boolean(selectedRegion?.html && selectedRegion.html.trim());
  const wantsLocalStyleFix = detectLocalStyleFixIntent(prompt);
  const wantsVagueImprovement = detectVagueImprovementIntent(prompt);
  const explicitBrandStylingIntent = detectExplicitBrandStylingIntent(prompt);
  // Short ambiguous prompts (<= 7 words, no clear redesign keywords, existing HTML present) → design quality audit
  const isAmbiguousShortPrompt = hasCurrentHtml && !wantsDesignRedesign && !wantsLocalStyleFix && !wantsVagueImprovement && prompt.split(/\s+/).filter(Boolean).length <= 7 && /^(fix|clean|improve|make|update|tweak|adjust|tighten|freshen|sharpen|help|do something|do it|do this|try|go|make it|can you|can we)/i.test(prompt);
  // Design-quality audit: triggered by any request that says "fix this" / "improve" / contrast issues
  // without explicitly asking for a full structural redesign. Fires a comprehensive design audit pass.
  const wantsDesignQualityAudit = (wantsLocalStyleFix || wantsVagueImprovement || isAmbiguousShortPrompt) && !wantsDesignRedesign;
  const allowBrandStyling = !wantsDesignQualityAudit && (wantsDesignRedesign || explicitBrandStylingIntent);
  const profileContext = splitBusinessProfileContext(businessContext);

  const system = [
    ...baseSystem,
    "When editing an existing page, treat CURRENT_HTML as the primary visual reference and preserve its overall visual system unless the user explicitly asks for broader redesign.",
    "If the user asks to fix contrast, readability, or visibility, solve that with the smallest effective local style changes first. Prefer changing text color, overlays, local backgrounds, borders, or section-specific styles before changing the whole page palette.",
    "Do not apply stored brand colors or fonts to the entire page, major section backgrounds, or core UI surfaces unless the user clearly asks for branding or redesign and that choice improves readability.",
    hasCurrentHtml
      ? wasBlocksExport
        ? "Redesign mode: You will be given CURRENT_HTML auto-scaffolded from a block builder. Treat it only as a content and structure reference — ignore its default styling. Create a NEW, polished, fully-designed landing page from scratch that satisfies the user's request. Return the FULL HTML document."
        : hasSelectedRegion
          ? wantsDesignQualityAudit
            ? "Region design-quality mode: You will be given CURRENT_HTML and SELECTED_REGION_HTML. Perform a design quality audit on SELECTED_REGION_HTML: fix ALL contrast failures, harmonize any colors that clash with the dominant page palette, make invisible or near-invisible text and elements legible, and ensure every CTA has clear contrast and a palette-compatible color. Preserve the region's layout and content. Return the FULL updated HTML document."
            : wantsDesignRedesign
            ? "Region redesign mode: You will be given CURRENT_HTML and SELECTED_REGION_HTML. Focus the redesign on SELECTED_REGION_HTML, keep the rest of CURRENT_HTML intact except for small supporting adjustments, and return the FULL updated HTML document."
            : "Region editing mode: You will be given CURRENT_HTML and SELECTED_REGION_HTML. Apply the user's request to SELECTED_REGION_HTML while preserving the rest of CURRENT_HTML unless a small surrounding adjustment is required. Return the FULL updated HTML document."
        : wantsDesignQualityAudit
          ? "Design-quality mode: You will be given CURRENT_HTML. Perform a full design quality audit on the entire page. Fix ALL of the following issues you find: (1) any text/background combination with contrast below WCAG AA 4.5:1 for normal text or 3:1 for large text, (2) any button or CTA whose color clashes with the dominant page palette — identify the dominant palette and harmonize outliers, (3) any nav, header, label, link, or decorative text that is near-invisible due to low opacity, near-matching color, or missing color declaration, (4) any interactive element whose label has poor contrast against its own background. Preserve the page's layout, structure, content, and identity. Do not change copy, layout, or section order. Return the FULL updated HTML document."
        : wantsDesignRedesign
          ? "Redesign mode: You will be given CURRENT_HTML. Replace simplistic placeholder markup with a materially improved, polished landing page that fully satisfies the requested sections. Return the FULL updated HTML document."
          : "Editing mode: You will be given CURRENT_HTML. Apply the user's instruction as a minimal, precise change to CURRENT_HTML. Return the FULL updated HTML document."
      : "Generation mode: Create a new HTML document from the user's instruction.",
    wasBlocksExport || wantsDesignRedesign
      ? "For design or redesign requests, produce a complete landing page with strong hierarchy, multiple clear sections, persuasive non-placeholder copy, polished spacing, and clear CTA treatment."
      : "",
    hasCurrentHtml
      ? [
          "FUNNEL_PRECISION_RULES — apply to every edit regardless of scope:",
          "- ABOVE THE FOLD: headline + subheadline + primary CTA must all be visible without scrolling at 375px viewport width. If the current page fails this, fix it silently.",
          "- CTA DENSITY: one dominant CTA per viewport section. Repeat at logical decision points (after proof, after benefits, after objection handling). Never bury the only CTA below the fold.",
          "- SOCIAL PROOF PLACEMENT: testimonials, star ratings, and trust badges belong adjacent to the primary CTA or form, not only at the bottom.",
          "- FORM FRICTION: minimize required fields; every field must have a visible <label> (not placeholder-only); group related fields; use a single clear submit CTA.",
          "- TRACKING PRESERVATION: if CURRENT_HTML contains any GTM container script, Meta Pixel <script>/<noscript>, GA4 gtag(), or custom analytics event listeners, preserve them verbatim in the updated HTML.",
          "- SEMANTIC STRUCTURE: one <h1> per page; logical h2/h3 hierarchy for sections; meaningful <alt> text on images; no duplicate IDs.",
          "- PAGE SPEED SIGNALS: prefer system fonts or Google Fonts loaded with <link rel=\"preconnect\">; avoid large base64 data URIs for images; inline only critical CSS, not entire stylesheets.",
          "- MOBILE LEGIBILITY: minimum 16px body font on mobile; tap targets ≥ 44px; no horizontal overflow.",
        ].join("\n")
      : "",
  ].join("\n");

  const recentIterationMemoryBlock = buildRecentIterationMemory(prevChat);
  const attachmentsBlock = attachments.length
    ? [
        "",
        "ATTACHMENTS:",
        ...attachments.map((a) => {
          const name = a.fileName ? ` ${a.fileName}` : "";
          const mime = a.mimeType ? ` (${a.mimeType})` : "";
          const url = toAbsoluteUrl(req, a.url);
          return `- ${name}${mime}: ${url}`.trim();
        }),
        "",
      ].join("\n")
    : "";

  const contextBlock = contextKeys.length
    ? [
        "",
        "SELECTED_CONTEXT (use these elements if relevant):",
        ...contextKeys.map((k) => `- ${k}`),
        "",
      ].join("\n")
    : "";

  const contextMediaBlock = contextMedia.length
    ? [
        "",
        "SELECTED_MEDIA (use these assets if relevant):",
        ...contextMedia.map((m) => {
          const name = m.fileName ? ` ${m.fileName}` : "";
          const mime = m.mimeType ? ` (${m.mimeType})` : "";
          const url = toAbsoluteUrl(req, m.url);
          return `- ${name}${mime}: ${url}`.trim();
        }),
        "",
      ].join("\n")
    : "";

  const stripeProductsBlock = stripeProducts.ok && stripeProducts.products.length
    ? [
        "",
        "STRIPE_PRODUCTS (already connected; do not ask what they sell):",
        ...stripeProducts.products.slice(0, 60).map((p: any) => {
          const price = p.defaultPriceId ? ` default_price=${p.defaultPriceId}` : "";
          const amt = typeof p.unitAmount === "number" ? ` ${p.unitAmount} ${p.currency}` : "";
          return `- ${p.name} (product=${p.id}${price}${amt})`;
        }),
        "",
      ].join("\n")
    : "\n\nSTRIPE_PRODUCTS: (none found or Stripe not connected)\n";

  const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };

  let html = "";
  let question: string | null = null;
  let changelog: Record<string, unknown> | null = null;
  let generationPlan: Record<string, unknown> | null = null;
  try {
    const currentHtmlBlock = hasCurrentHtml
      ? [
          "CURRENT_HTML:",
          "```html",
          clampText(effectiveCurrentHtml, 24000),
          "```",
          "",
        ].join("\n")
      : "";
    const selectedRegionBlock = hasSelectedRegion
      ? [
          "SELECTED_REGION:",
          `- Label: ${selectedRegion?.label || "Region"}`,
          selectedRegion?.summary ? `- Summary: ${selectedRegion.summary}` : "",
          "```html",
          clampText(selectedRegion?.html || "", 12000),
          "```",
          "",
          "If the request is local to this region, make the change there and preserve the rest of the page.",
          "",
        ].filter(Boolean).join("\n")
      : "";

    const pageSectionsBlock = allRegions.length
      ? [
          "PAGE_SECTIONS (detected sections in the current page, for context):",
          ...allRegions.map((r) => `- ${r.label}${r.summary ? `: ${r.summary}` : ""}`),
          "",
        ].join("\n")
      : "";

    const imageUrls = [
      ...attachments
        .filter((a) => String(a.mimeType || "").toLowerCase().startsWith("image/"))
        .map((a) => toAbsoluteUrl(req, a.url)),
      ...contextMedia
        .filter((m) => String(m.mimeType || "").toLowerCase().startsWith("image/"))
        .map((m) => toAbsoluteUrl(req, m.url)),
    ]
      .filter(Boolean)
      .slice(0, 8);

    const pageEditContextBlock = [
      "PAGE_EDIT_CONTEXT:",
      "- CURRENT_HTML is the primary source of truth for the page's current visual system.",
      "- Saved brief, intent, shell, and section-plan notes are draft guidance only. If they lag behind the current page or newer runtime context, update them mentally for this run instead of obeying stale assumptions.",
      wantsDesignQualityAudit
        ? "- This is a design quality audit run. Fix ALL contrast failures, color clashes, and invisible elements across the whole page. Do not change layout, structure, or copy."
        : wantsDesignRedesign
        ? "- This is a full redesign request. Produce a materially improved page with strong hierarchy, polished sections, and conversion-focused copy."
        : "- Keep the current styling, layout, and copy unless the request clearly asks for redesign or rebranding. Make only the changes needed to satisfy the user's instruction.",
      allowBrandStyling
        ? "- Business brand styling may be used selectively where it clearly improves the requested result without hurting readability."
        : "- Stored business brand colors are not active styling instructions for this run. Judge color choices by what works for the existing page, not by stored brand values.",
    ].join("\n");

    const businessContextBlock = [
      profileContext.guidance,
      buildFunnelBriefPromptBlock(effectiveFunnelBrief),
      buildFunnelPageIntentPromptBlock(effectiveIntentProfile, routeLabel),
      shellFrameBlock,
      visualWhyBlock,
      exhibitArchetypeBlock,
      allowBrandStyling ? profileContext.styling : "",
    ].filter(Boolean).join("\n\n");

    const userText = [
      businessContextBlock,
      bookingRuntimeBlock,
      stripeProductsBlock,
      pageEditContextBlock,
      `Funnel: ${normalizedPage.funnel.name} (slug: ${normalizedPage.funnel.slug})`,
      `Page: ${normalizedPage.title} (slug: ${normalizedPage.slug})`,
      wantsDesignQualityAudit
        ? [
            "DESIGN_QUALITY_CHECKLIST (audit every item before writing output):",
            "1. CONTRAST — Find every text/background pair. Fix any combination where the contrast ratio is below 4.5:1 for body text or 3:1 for headings/large text. This includes nav links, button labels, placeholder text, captions, and secondary/tertiary copy.",
            "2. COLOR HARMONY — Identify the dominant palette from the existing page (e.g. if the hero and section backgrounds are warm brown/burgundy/earthy tones, that is the palette). Any buttons, links, or interactive elements using sharply contrasting hue families (e.g. bright purple buttons on a warm-tone page) must be replaced with a harmonious alternative that still has strong contrast and serves as a clear CTA.",
            "3. INVISIBLE ELEMENTS — Find any nav items, header content, link text, labels, or decorative text that is near-invisible due to zero opacity, white-on-white, very light gray on white, or undeclared color inheriting a near-invisible ancestor color. Make every piece of UI text fully legible.",
            "4. CTA LEGIBILITY — Every button and CTA must clearly read. Fix button text color if it does not contrast against the button's own background. Fix button background if it does not stand out enough from the section behind it.",
            "5. SECTION BACKGROUNDS — Any section that currently has no background differentiation and uses default page background, where a subtle contrast would help structure the page, should receive a light background tint consistent with the existing palette.",
            "Apply all of the above silently. Do not explain the changes in comments. Just return the fixed page.",
          ].join("\n")
        : wantsDesignRedesign
        ? [
            "DESIGN_BRIEF:",
            "- Treat this as a real conversion-focused redesign, not a placeholder patch.",
            "- Replace generic filler copy with concrete, persuasive copy tailored to the request and business context.",
            "- Include a strong hero, proof or credibility strip, benefits section, testimonial section, objection-handling section, and multiple clear CTAs.",
            wantsBookingPage
              ? "- Because this is a booking page, put proof adjacent to the hero CTA and again at the booking handoff. Do not leave all testimonials or results for the lower half of the page."
              : "",
            "- Use modern visual hierarchy, section backgrounds, cards, spacing, contrast, and polished buttons so the page feels intentionally designed.",
            "- Use business brand colors or fonts only where they fit the specific page and improve readability. Do not turn the whole page into a brand-color wash by default.",
            "- Make the above-the-fold section immediately credible and conversion-focused.",
            "- Ensure every CTA is clickable and points to a real destination.",
          ].filter(Boolean).join("\n")
        : "",
      "",
      currentHtmlBlock,
      pageSectionsBlock,
      selectedRegionBlock,
      recentIterationMemoryBlock,
      "DIRECTION_RULE:",
      "Follow the strategic build brief below and do not mirror the user's wording back verbatim.",
      "",
      "STRATEGIC_BUILD_BRIEF:",
      strategicPrompt,
      contextBlock,
      contextMediaBlock,
      attachmentsBlock,
    ].join("\n");

    const planSystem = [
      ...baseSystem,
      "You are the planning pass for funnel page generation.",
      "Do not write HTML in this pass.",
      "Return only one fenced ```json block that describes the intended page structure, proof placement, visual system, and risks.",
      "The plan should be concrete enough that another model call could build the page without improvising generic filler.",
    ].join("\n");

    const planUserText = buildGenerationPlanPrompt({
      wantsBookingPage,
      pageTitle: `${normalizedPage.title} (slug: ${normalizedPage.slug})`,
      funnelName: `${normalizedPage.funnel.name} (slug: ${normalizedPage.funnel.slug})`,
      currentHtmlBlock,
      pageSectionsBlock,
      selectedRegionBlock,
      recentIterationMemoryBlock,
      businessContextBlock,
      bookingRuntimeBlock,
      stripeProductsBlock,
      contextBlock,
      contextMediaBlock,
      attachmentsBlock,
      exhibitPlannerContractBlock,
      strategicPrompt,
      pageEditContextBlock,
      prompt,
    });

    const planRaw = imageUrls.length
      ? await generateTextWithImages({ system: planSystem, user: planUserText, imageUrls, history: aiHistory })
      : await generateText({ system: planSystem, user: planUserText, history: aiHistory });

    generationPlan = extractJsonObjectRecord(planRaw);

    const generationPlanBlock = generationPlan
      ? [
          "GENERATION_PLAN:",
          "```json",
          JSON.stringify(generationPlan, null, 2),
          "```",
          "",
          "Treat this plan as a hard scaffold for the next build step. Do not collapse back into generic template markup.",
          "Honor the openingPosture, openingCluster, and bookingHandoff fields as a layout contract.",
          wantsBookingPage
            ? "In particular, keep the first screen as one dominant decision cluster: promise, fit qualifier, primary CTA, and adjacent proof in one scan. Do not separate proof into a later beat."
            : "",
          "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const generationUserText = [userText, "", generationPlanBlock].filter(Boolean).join("\n");

    const aiRaw = imageUrls.length
      ? await generateTextWithImages({ system, user: generationUserText, imageUrls, history: aiHistory })
      : await generateText({ system, user: generationUserText, history: aiHistory });

    question = extractAiQuestion(aiRaw);
    if (!question) {
      const extracted = extractHtmlAndChangelog(aiRaw);
      html = sanitizeGeneratedHtmlVisualAssets(extracted.html);
      changelog = extracted.changelog;

      const firstPassIssues = assessGeneratedPageQuality(html, {
        pageType: effectiveIntentProfile.pageType,
        primaryCta: effectiveIntentProfile.primaryCta,
        sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
        proofModel: shellFrame?.proofModel || null,
      });

      if (html && firstPassIssues.length) {
        const repairUserText = [
          generationUserText,
          "",
          "FIRST_PASS_HTML:",
          "```html",
          clampText(html, 24000),
          "```",
          "",
          "VALIDATION_REPAIR_REQUIRED:",
          ...firstPassIssues.map((issue) => `- ${issue}`),
          "",
          buildSceneRepairBlock(html, {
            sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
            proofModel: shellFrame?.proofModel || null,
          }),
          "",
          generationPlanBlock,
          "",
          effectiveIntentProfile.pageType === "booking"
            ? "BOOKING_REPAIR_RULES: resolve booking issues by pairing the main CTA with visible proof in or immediately after the hero, and keep another proof surface directly above or inside the booking section. Prefer moving proof closer to the handoff over adding generic filler copy."
            : "",
          effectiveIntentProfile.pageType === "booking"
            ? "BOOKING_REPAIR_RULES: if the first screen fails, rewrite the opening cluster and booking handoff against the plan contract instead of preserving a weak hero. Keep one dominant text-and-CTA column and make any secondary zone a compact proof rail or reassurance strip."
            : "",
          "VISUAL_REPAIR_RULES: if the page still looks like a generic starter template, rebuild the hero, section containers, typography, and proof surfaces so the result feels deliberate and premium. Avoid stock UI font stacks such as Arial, Helvetica, Segoe UI, Tahoma, Geneva, Verdana, flat full-width color bands, viewport-height hero shells, and bare CTA rows with little containment.",
          "VISUAL_REPAIR_RULES: use contained layouts with max-width wrappers, premium typography choices, layered surfaces or cards, and a proof module visually attached to the first serious CTA.",
          "VISUAL_REPAIR_RULES: for booking pages, do not keep or recreate a centered single-column hero card. Recompose the first screen so the promise, CTA, and trust cue land together.",
          "VISUAL_REPAIR_RULES: do not keep the prior structure if it still reads like a stock starter page. Replace the weak hero and surrounding sections with a stronger composition instead of only restyling colors.",
          "",
          "Repair the page so every validation issue is resolved. Return only a full ```html document, optionally followed by the JSON change log.",
        ].filter(Boolean).join("\n");

        const repairRaw = imageUrls.length
          ? await generateTextWithImages({ system, user: repairUserText, imageUrls, history: aiHistory })
          : await generateText({ system, user: repairUserText, history: aiHistory });

        const repaired = extractHtmlAndChangelog(repairRaw);
        if (repaired.html) {
          html = sanitizeGeneratedHtmlVisualAssets(repaired.html);
          changelog = repaired.changelog ?? changelog;
        }

        const rescueIssues = assessGeneratedPageQuality(html, {
          pageType: effectiveIntentProfile.pageType,
          primaryCta: effectiveIntentProfile.primaryCta,
          sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
          proofModel: shellFrame?.proofModel || null,
        });

        if (html && effectiveIntentProfile.pageType === "booking" && hasBookingClusterFailure(rescueIssues)) {
          const focusedBookingRepairUserText = [
            generationUserText,
            "",
            "CURRENT_FAILED_BOOKING_HTML:",
            "```html",
            clampText(html, 24000),
            "```",
            "",
            "FOCUSED_BOOKING_CLUSTER_REPAIR:",
            ...rescueIssues.map((issue) => `- ${issue}`),
            "",
            buildSceneRepairBlock(html, {
              sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
              proofModel: shellFrame?.proofModel || null,
            }),
            "",
            generationPlanBlock,
            "",
            "FOCUSED_BOOKING_CLUSTER_RULES:",
            "- Rewrite the opening cluster and booking handoff only. Keep any middle sections that are already structurally usable.",
            "- The first screen must read in one scan: promise, fit qualifier, primary CTA, and adjacent proof inside the same zone or attached proof rail.",
            "- Do not leave proof as a later standalone section. Attach it directly to the hero CTA cluster, then repeat reassurance immediately above or inside the booking section.",
            "- Keep one dominant text-and-CTA column. Any secondary area must be a compact proof rail, proof strip, or reassurance stack, not decorative filler.",
            "- Return only a full ```html document, optionally followed by the JSON change log.",
          ].join("\n");

          const focusedBookingRepairRaw = imageUrls.length
            ? await generateTextWithImages({ system, user: focusedBookingRepairUserText, imageUrls, history: aiHistory })
            : await generateText({ system, user: focusedBookingRepairUserText, history: aiHistory });

          const focusedBookingRepair = extractHtmlAndChangelog(focusedBookingRepairRaw);
          if (focusedBookingRepair.html) {
            html = sanitizeGeneratedHtmlVisualAssets(focusedBookingRepair.html);
            changelog = focusedBookingRepair.changelog ?? changelog;
          }
        }

        if (html && rescueIssues.some((issue) => /generic starter template|generic enterprise filler|invented or generic proof|placeholder faq scaffolding/i.test(issue))) {
          const rescueUserText = [
            generationUserText,
            "",
            "FAILED_HTML_AFTER_REPAIR:",
            "```html",
            clampText(html, 24000),
            "```",
            "",
            "RESCUE_REDESIGN_REQUIRED:",
            ...rescueIssues.map((issue) => `- ${issue}`),
            "",
            buildSceneRepairBlock(html, {
              sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
              proofModel: shellFrame?.proofModel || null,
            }),
            "",
            generationPlanBlock,
            "",
            "RESCUE_REDESIGN_RULES:",
            "- Discard weak starter-template structure if needed. Replace it with a stronger composition rather than preserving a generic hero and flat stacked sections.",
            "- Use an intentional premium visual system: contained outer frame, layered surfaces, stronger typography hierarchy, and a proof cluster attached to the first serious CTA.",
            "- Avoid stock UI font stacks such as Arial, Helvetica, Segoe UI, Tahoma, Geneva, Verdana, along with plain centered hero boxes and flat full-width color bands.",
            effectiveIntentProfile.pageType === "booking"
              ? "- For booking pages, build one dominant decision cluster above the fold: promise, CTA, and trust cue in a single scan. Then repeat proof immediately before or inside the booking handoff section."
              : "- Above the fold, build one dominant decision cluster so the promise, CTA, and immediate credibility cue land together.",
            effectiveIntentProfile.pageType === "booking"
              ? "- Respect the plan contract for openingPosture, openingCluster, and bookingHandoff. Rewrite the first screen if needed rather than trying to patch a weak composition."
              : "",
            "- Prefer asymmetry, cards, panels, or layered containers over bare full-width sections with only background-color changes.",
            "- Return only a full ```html document, optionally followed by the JSON change log.",
          ].filter(Boolean).join("\n");

          const rescuedRaw = imageUrls.length
            ? await generateTextWithImages({ system, user: rescueUserText, imageUrls, history: aiHistory })
            : await generateText({ system, user: rescueUserText, history: aiHistory });

          const rescued = extractHtmlAndChangelog(rescuedRaw);
          if (rescued.html) {
            html = sanitizeGeneratedHtmlVisualAssets(rescued.html);
            changelog = rescued.changelog ?? changelog;
          }
        }
      }
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as any)?.message ? String((e as any).message) : "AI generation failed" },
      { status: 500 },
    );
  }

  if (question) {
    const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
    const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

    const updated = await prisma.creditFunnelPage.update({
      where: { id: page.id },
      data: {
        customChatJson: nextChat as any,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      question,
      aiResult: buildAiResultMeta({
        mode: "question",
        hadCurrentHtml: Boolean(effectiveCurrentHtml),
        wantsDesignRedesign,
        contextKeyCount: contextKeys.length,
        contextMediaCount: contextMedia.length,
      }),
      page: updated,
    });
  }

  if (!html) return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });

  html = sanitizeGeneratedHtmlVisualAssets(sanitizeGeneratedHtmlLinks(normalizePortalHostedPaths(html)));

  let finalQualityIssues = assessGeneratedPageQuality(html, {
    pageType: effectiveIntentProfile.pageType,
    primaryCta: effectiveIntentProfile.primaryCta,
    sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
    proofModel: shellFrame?.proofModel || null,
  });

  if (
    finalQualityIssues.length &&
    effectiveIntentProfile.pageType === "booking" &&
    (
      hasBookingClusterFailure(finalQualityIssues) ||
      hasBookingGenericOutputFailure(finalQualityIssues)
    )
  ) {
    const bookingFallbackPlan = hasBookingGenericOutputFailure(finalQualityIssues) ? null : generationPlan;
    html = buildBookingFallbackHtmlFromPlan({
      funnelName: normalizedPage.funnel.name,
      pageTitle: normalizedPage.title,
      prompt,
      primaryCta: effectiveIntentProfile.primaryCta || "Book a call",
      bookingHref: defaultBookingPublicUrl || "#book",
      bookingSectionId: "book",
      generationPlan: bookingFallbackPlan,
    });
    changelog = {
      summary: "Rebuilt the page with a booking-safe fallback shell.",
      changes: [
        {
          section: "hero",
          what: "Reframed the opening around one clear booking CTA and attached proof.",
          why: "To keep the first decision moment tight and credible.",
        },
        {
          section: "booking",
          what: "Restaged the booking handoff with reassurance and a real booking path.",
          why: "To remove generic filler and preserve a truthful scheduling flow.",
        },
      ],
      preserved: [],
      conversionNotes: [
        "Fallback shell was used because the previous booking draft still read as generic or unsupported.",
      ],
    };

    html = sanitizeGeneratedHtmlVisualAssets(sanitizeGeneratedHtmlLinks(normalizePortalHostedPaths(html)));
    finalQualityIssues = assessGeneratedPageQuality(html, {
      pageType: effectiveIntentProfile.pageType,
      primaryCta: effectiveIntentProfile.primaryCta,
      sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
      proofModel: shellFrame?.proofModel || null,
    });
  }

  if (finalQualityIssues.length) {
    return NextResponse.json(
      { ok: false, error: `Generated page failed quality checks: ${finalQualityIssues.join(" ")}` },
      { status: 502 },
    );
  }

  if (!/<!doctype\s+html|<html\b/i.test(html)) {
    html = [
      "<!doctype html>",
      "<html>",
      "<head>",
      "  <meta charset=\"utf-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      "  <title>AI Output</title>",
      "  <style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; padding:24px} pre{white-space:pre-wrap; word-break:break-word}</style>",
      "</head>",
      "<body>",
      `  <pre>${escapeHtml(html)}</pre>`,
      "</body>",
      "</html>",
    ].join("\n");
  }

  const pageUpdatedText = changelog?.summary
    ? buildChangelogAssistantMessage(changelog)
    : await generatePageUpdatedAssistantText({ pageTitle: page.title, funnelName: page.funnel?.name });
  const assistantMsg = pageUpdatedText.trim()
    ? {
        role: "assistant" as const,
        content: pageUpdatedText.trim(),
        at: new Date().toISOString(),
      }
    : null;
  const nextChat = (assistantMsg ? [...prevChat, userMsg, assistantMsg] : [...prevChat, userMsg]).slice(-40);

  const cleanHtml = sanitizeGeneratedHtmlVisualAssets(sanitizeGeneratedHtmlLinks(normalizePortalHostedPaths(html)));

  const updated = await prisma.creditFunnelPage.update({
    where: { id: normalizedPage.id },
    data: applyDraftHtmlWriteCompat({
      editorMode: "CUSTOM_HTML",
      // Write AI output to draftHtml only — user must explicitly Publish to go live.
      ...createFunnelPageDraftUpdate(cleanHtml),
      customChatJson: nextChat as any,
    }, hasDraftHtml),
    select: withDraftHtmlSelect({
      id: true,
      slug: true,
      title: true,
      editorMode: true,
      customHtml: true,
      customChatJson: true,
      updatedAt: true,
    }, hasDraftHtml),
  });

  const normalizedUpdated = normalizeDraftHtml(updated);

  return NextResponse.json({
    ok: true,
    html: getFunnelPageCurrentHtml(normalizedUpdated),
    aiResult: buildAiResultMeta({
      mode: "html-update",
      hadCurrentHtml: Boolean(effectiveCurrentHtml),
      wantsDesignRedesign,
      contextKeyCount: contextKeys.length,
      contextMediaCount: contextMedia.length,
      changelog,
    }),
    page: normalizedUpdated,
  });
}
