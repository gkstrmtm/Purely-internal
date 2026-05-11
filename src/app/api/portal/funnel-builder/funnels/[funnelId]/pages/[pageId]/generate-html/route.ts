import { NextResponse } from "next/server";

import { getCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { consumeCredits } from "@/lib/credits";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText, generateTextWithImages } from "@/lib/ai";
import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { ensureFunnelBookingCalendar } from "@/lib/funnelBookingCalendars";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { assessDesignTokenDiscipline, buildDesignTokenContractBlock } from "@/lib/funnelDesignTokenGuard";
import { buildFunnelDesignContextPromptBlock, hasFunnelDesignContext, sanitizeFunnelDesignContext } from "@/lib/funnelDesignContext";
import { synthesizeFunnelGenerationPrompt, type FunnelPromptSynthesisResult } from "@/lib/funnelPromptSynthesizer";
import { readFunnelBookingRouting, resolveFunnelBookingCalendarId, writeFunnelBookingRouting } from "@/lib/funnelBookingRouting";
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
import { buildBookingRuntimePlaceholderHtml, resolveFunnelBookingSurfaceContext } from "@/lib/funnelBookingSurface";
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
import {
  buildSourceActionPlanPromptBlock,
  mergeSourceActionPlans,
  sanitizeSourceActionPlan,
  type SourceActionPlan,
} from "@/lib/funnelSourceActionPlan";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { assessFunnelSceneQuality, buildFragmentSceneAnatomy } from "@/lib/funnelSceneQuality";
import { buildFunnelVisualWhyBlock } from "@/lib/funnelVisualWhy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampText(s: string, maxLen: number) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "\n<!-- truncated -->";
}

/**
 * Extracts a structural outline of an HTML document: every element with an id,
 * every heading, and every semantic section boundary - each with a short text
 * preview. Used to give the AI a full-page anatomy map when the raw HTML is
 * too large to send in full.
 */
function extractHtmlStructureOutline(html: string): string {
  const raw = String(html || "");
  if (!raw.trim()) return "";
  const lines: string[] = [];
  const tagPattern = /<(h[1-4]|section|header|footer|nav|main|article|div|aside)\b([^>]*)>([\s\S]{0,400}?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = tagPattern.exec(raw)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || "";
    const inner = match[3] || "";
    const idMatch = /\bid=["']([^"']+)["']/.exec(attrs);
    const id = idMatch ? idMatch[1] : "";
    const classMatch = /\bclass=["']([^"']+)["']/.exec(attrs);
    const classes = classMatch ? classMatch[1].trim().split(/\s+/).slice(0, 2).join(" ") : "";
    const textSnippet = inner
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const label = id ? `#${id}` : classes ? `.${classes.replace(/\s+/g, ".")}` : tag;
    const dedupeKey = `${tag}:${id}:${textSnippet.slice(0, 40)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const isHeading = /^h[1-4]$/.test(tag);
    const isSemantic = ["section", "header", "footer", "nav", "main", "article", "aside"].includes(tag);
    const isIdAnchored = Boolean(id);
    if (!isHeading && !isSemantic && !isIdAnchored) continue;
    lines.push(`<${tag} ${label}> ${textSnippet ? `"${textSnippet}"` : "(no text)"}`);
    if (lines.length >= 80) break;
  }
  return lines.length ? lines.join("\n") : "";
}

/**
 * Splices updatedRegionHtml back into the full page HTML in place of the
 * original region, matched by element id. Returns the original if no match.
 */
function spliceRegionHtml(fullHtml: string, regionId: string, updatedRegionHtml: string): string {
  if (!fullHtml || !regionId || !updatedRegionHtml) return fullHtml;
  const escaped = regionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(<(?:section|div|article|main|header|footer|aside)\\b[^>]*\\bid=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/(?:section|div|article|main|header|footer|aside)>)`,
    "i",
  );
  const m = pattern.exec(fullHtml);
  if (!m) return fullHtml;
  return fullHtml.slice(0, m.index) + updatedRegionHtml + fullHtml.slice(m.index + m[0].length);
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

function extractPrimaryCtaCopyEditRequest(prompt: string): string | null {
  const text = String(prompt || "").trim();
  if (!text) return null;
  const directMatch = text.match(/\bchange\s+only\s+the\s+primary\s+cta\s+copy\s+to\s+['"]?([^'".\n]+?)['"]?(?:\s+and\b|[.?!]|$)/i);
  if (directMatch?.[1]) return directMatch[1].trim().slice(0, 160);
  const buttonMatch = text.match(/\b(?:change|update|rename)\s+(?:only\s+)?(?:the\s+)?(?:primary\s+)?(?:cta|button)\s+(?:copy|text|label)\s+to\s+['"]?([^'".\n]+?)['"]?(?:\s+and\b|[.?!]|$)/i);
  if (buttonMatch?.[1]) return buttonMatch[1].trim().slice(0, 160);
  return null;
}

function decodeHtmlEntities(value: string): string {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeCtaText(value: string): string {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractHtmlAttribute(attrs: string, name: string): string {
  const match = String(attrs || "").match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ? String(match[2]).trim() : "";
}

function addHtmlAttribute(tagHtml: string, attrName: string, attrValue: string) {
  const source = String(tagHtml || "");
  if (!source || new RegExp(`\\b${attrName}\\s*=`, "i").test(source)) return source;
  const closeIndex = source.indexOf(">");
  if (closeIndex === -1) return source;
  return `${source.slice(0, closeIndex)} ${attrName}="${escapeHtml(attrValue)}"${source.slice(closeIndex)}`;
}

function replaceHtmlClassToken(tagHtml: string, fromToken: string, toToken: string) {
  return String(tagHtml || "").replace(
    new RegExp(`(class\\s*=\\s*["'][^"']*?)\\b${escapeRegExp(fromToken)}\\b`, "gi"),
    `$1${toToken}`,
  );
}

function replaceTagInnerText(tagHtml: string, nextText: string) {
  return String(tagHtml || "").replace(/>([\s\S]*?)<\/([a-z0-9-]+)>$/i, `>${escapeHtml(nextText)}</$2>`);
}

function looksLikePrimaryCtaTag(attrs: string, text: string): boolean {
  const attrBlob = String(attrs || "").toLowerCase();
  const normalizedText = normalizeCtaText(text).toLowerCase();
  return /primary|cta|button|book|schedule|consult|call-to-action/.test(attrBlob)
    || /\b(book|schedule|call|consult|apply|get started|get a demo|start now|buy now)\b/.test(normalizedText);
}

function applyDeterministicPrimaryCtaCopyEdit(html: string, nextCopy: string) {
  const source = String(html || "");
  const updatedLabel = String(nextCopy || "").trim();
  if (!source || !updatedLabel) {
    return { changed: false, html: source, updatedCount: 0, originalLabel: "" };
  }

  const tagPattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const matches: Array<{
    full: string;
    tag: string;
    attrs: string;
    inner: string;
    text: string;
    index: number;
  }> = [];
  let match: RegExpExecArray | null = null;
  while ((match = tagPattern.exec(source))) {
    matches.push({
      full: match[0],
      tag: match[1],
      attrs: match[2],
      inner: match[3],
      text: normalizeCtaText(match[3]),
      index: match.index,
    });
  }

  const primaryCandidate = matches.find((entry) => entry.text && looksLikePrimaryCtaTag(entry.attrs, entry.inner));
  if (!primaryCandidate) {
    return { changed: false, html: source, updatedCount: 0, originalLabel: "" };
  }

  const originalLabel = primaryCandidate.text;
  if (!originalLabel || originalLabel === updatedLabel) {
    return { changed: false, html: source, updatedCount: 0, originalLabel };
  }

  const replacement = `<${primaryCandidate.tag}${primaryCandidate.attrs}>${escapeHtml(updatedLabel)}</${primaryCandidate.tag}>`;
  const replacedHtml =
    source.slice(0, primaryCandidate.index) +
    replacement +
    source.slice(primaryCandidate.index + primaryCandidate.full.length);

  return {
    changed: replacedHtml !== source,
    html: replacedHtml,
    updatedCount: replacedHtml !== source ? 1 : 0,
    originalLabel,
  };
}

function buildBookingDesignContractBlock(mode: "plan" | "build") {
  const heading = mode === "plan" ? "BOOKING_DESIGN_CONTRACT:" : "BOOKING_OUTPUT_CONTRACT:";
  return [
    heading,
    "- Build one dominant above-the-fold decision cluster: promise, fit qualifier, primary CTA, and adjacent proof in one scan.",
    "- Make the primary CTA unmistakably dominant with a filled button treatment, strong contrast against its surrounding surface, and enough size/spacing to read as the obvious next step.",
    "- Keep the booking path predominantly single-column. Use side-by-side layout only for tightly related proof or reassurance micro-elements, not for the main intake or CTA logic.",
    "- Put a visibly strong proof module directly adjacent to the first CTA. Do not save all trust signals for lower sections.",
    "- Stage reassurance again at the scheduling handoff so the calendar or booking ask feels like a continuation of the case, not a sudden widget drop.",
    "- Use a calm premium visual system: restrained accent use, clear section contrast, deliberate containers, and typography hierarchy that feels intentional without becoming flashy.",
    "- Prefer contextual value cues such as decision support, outcomes, workflow framing, or client proof over decorative gradients or generic startup filler.",
    "- Keep one dominant CTA above the fold. Secondary actions, if any, must be visually demoted and must not compete with the booking ask.",
    "- Enforce spatial discipline: no text overlap, no horizontal bleed, no CTA or proof content hanging outside its container, and no edge-to-edge text slabs without a readable clamp.",
    "- Clamp headline, body, proof, and booking copy to readable measures. Large headlines still need a max-width and wrapping behavior so they do not collide with cards, CTAs, or modal edges.",
    "- Every major section needs intentional inner padding and container bounds. Do not rely on negative margins, off-canvas offsets, or absolute positioning for core text and CTA content.",
    "- Avoid these anti-patterns: centered generic hero shell, flat repeated section cards at one visual temperature, proof buried in later sections, ornamental FAQ clutter, and multi-column booking forms.",
  ].join("\n");
}

function buildStructuralQualityContractBlock(mode: "plan" | "build") {
  const heading = mode === "plan" ? "STRUCTURAL_PLAN_CONTRACT:" : "STRUCTURAL_OUTPUT_CONTRACT:";
  return [
    heading,
    "- Never generate placeholder sections, default layouts, or empty structural elements.",
    "- Before introducing or preserving any section, determine its purpose, the user state it addresses, and the action or movement it creates. If that justification is weak, remove, merge, or rework the section.",
    "- Every section must have defined content, intentional hierarchy, deliberate spacing/alignment, and a visible contribution to forward movement in the funnel.",
    "- Variation in visual style is allowed. Variation in structural quality is not. Do not let any section feel generic, underdeveloped, or like a safe default block.",
    "- If removing a section improves clarity, the section should not exist. Tight pages beat padded pages.",
    "- Header rule: if a header is present, it must intentionally serve navigation, conversion support, trust reinforcement, brand presence, or a deliberate combination. A logo-only header or a header that does not guide user behavior is invalid.",
  ].join("\n");
}

function buildDesignTokenPageContractBlock(mode: "plan" | "build") {
  const heading = mode === "plan" ? "DESIGN_TOKEN_PLAN_CONTRACT:" : "DESIGN_TOKEN_OUTPUT_CONTRACT:";
  return buildDesignTokenContractBlock(heading);
}

function buildFunctionalSurfaceContractBlock(mode: "plan" | "build") {
  const heading = mode === "plan" ? "FUNCTIONAL_SURFACE_PLAN_CONTRACT:" : "FUNCTIONAL_SURFACE_OUTPUT_CONTRACT:";
  return [
    heading,
    "- Treat calendars, forms, dashboards, chat handoffs, checkout modules, and other functional UI as funnel sections with a defined job, not as raw app surfaces dropped into the page.",
    "- Classify the functional surface before styling it: booking handoff, qualification step, proof-backed application step, dashboard proof surface, commerce handoff, or support utility. Its surrounding copy and layout must match that role.",
    "- Wrap functional UI in a clear frame with a heading, expectation-setting copy, adjacent reassurance or proof, and containment that makes the component feel native to the funnel.",
    "- Booking calendars need booking-specific framing: what happens on the call, who it is for, and why scheduling now is safe. Never render a bare calendar under generic filler copy.",
    "- Clamp layout intentionally: keep the main frame around 1100-1200px, tighter reading or form stacks around 680-900px, and embedded components at 100% width of their clamped container with no overflow.",
    "- Keep rhythm intentional: use roughly 72-120px between major section beats, 24-48px of inner section or card spacing, and 12-20px for tight micro-spacing between related copy and controls.",
    "- Choose one alignment system per functional section and keep it consistent. Avoid equal-weight panels, flat repeated section cards, or dense dashboard chrome that overwhelms the funnel hierarchy.",
  ].join("\n");
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
  preservedSourceActionPlanBlock: string;
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
    input.preservedSourceActionPlanBlock,
    buildStructuralQualityContractBlock("plan"),
    buildDesignTokenPageContractBlock("plan"),
    buildFunctionalSurfaceContractBlock("plan"),
    input.wantsBookingPage ? buildBookingDesignContractBlock("plan") : "",
    "PLAN_TASK:",
    "Return only one ```json block describing the page plan before any HTML is written.",
    "The JSON must follow this shape:",
    "{",
    '  "summary": "one sentence about the intended upgrade",',
    '  "designIntent": { "funnelType": "...", "audienceSophistication": "basic | premium", "conversionUrgency": "soft | aggressive", "brandTone": "neutral | premium | technical | editorial | other" },',
    '  "styleIntensity": "low | medium | high",',
    '  "exhibitMode": "off | assist | full",',
    '  "fontSystem": { "families": ["Manrope | Inter | Plus Jakarta Sans | General Sans | other justified choice"], "reason": "credibility/readability/tone rationale" },',
    '  "openingPosture": "attached-proof-rail | proof-strip-under-cta | single-column-cluster",',
    '  "heroApproach": "how the opening frame should work",',
    '  "openingCluster": { "promise": "...", "qualifier": "...", "primaryCta": "...", "adjacentProof": "...", "supportRole": "proof rail | proof strip | reassurance stack" },',
    '  "ctaSystem": { "dominantCta": "...", "secondaryAction": "omit | subdued-text-link | soft-secondary", "repeatMoments": ["hero", "handoff"] },',
    '  "proofStrategy": "where proof lands relative to the CTA and handoff",',
    '  "bookingHandoff": { "sectionType": "embedded booking section or direct handoff", "reassurance": "...", "repeatProof": "..." },',
    '  "contentDiscipline": ["what to omit so the page stays tight and CTA-dominant"],',
    '  "surfaceSystem": { "baseTone": "...", "secondarySurface": "...", "accentUse": "...", "contrastStrategy": "..." },',
    '  "proofObjects": ["actual visual proof elements to render, such as testimonial cards, metrics, logos, or founder credibility objects"],',
    '  "visualAnchors": ["real visual elements the page should use so it does not collapse into text-only slabs"],',
    '  "artDirection": { "mood": "...", "pointOfView": "...", "competitionBar": "business-premium | award-caliber" },',
    '  "spatialDiscipline": { "contentClamp": "how text widths are bounded", "componentClamp": "how functional embeds stay inside 680-900px inner frames and never overflow", "paddingStrategy": "how section and card padding scale", "alignmentSystem": "how headings, proof, and functional UI line up", "overflowPolicy": "how overlap, bleed, and breakout are prevented" },',
    '  "sectionRhythm": [{ "id": "hero", "tone": "contrast beat | calm support beat | conversion handoff", "surfaceRole": "...", "reason": "..." }],',
    '  "foundationRules": ["specific non-negotiable visual-system or layout rules to obey"],',
    '  "referenceAnchors": ["relevant design-system or component anchors to emulate structurally"],',
    '  "antiPatterns": ["specific design mistakes the page must avoid"] ,',
    '  "visualSystem": ["3-6 short bullets about layout, hierarchy, mood, and media treatment"],',
    '  "sourceActionPlan": { "summary": "one sentence describing the intended source upgrade", "moves": [{ "key": "hero-cluster", "target": "hero", "change": "...", "why": "...", "priority": "primary|secondary|optional", "executionMode": "deterministic|guided-generation", "selectorHint": ".hero" }], "watchouts": ["short failure modes to avoid"] },',
    '  "sections": [{ "id": "hero", "goal": "...", "userState": "confusion | doubt | readiness | objection | other", "movement": "what this section causes the visitor to do or believe next", "mustInclude": ["..."], "existenceTest": "why this section deserves to exist instead of being removed" }],',
    '  "risks": ["short list of likely failure modes to avoid"]',
    "}",
    input.wantsBookingPage
      ? "For booking pages, the plan must explicitly place proof beside the first CTA and again immediately before or inside the booking section. The openingPosture, openingCluster, and ctaSystem are a contract, not a suggestion. Prefer one dominant CTA above the fold and omit secondary actions unless they are truly necessary."
      : "",
    input.exhibitPlannerContractBlock,
    input.exhibitPlannerContractBlock
      ? "If EXHIBIT_PLANNER_CONTRACT is present, translate it into explicit foundationRules, referenceAnchors, and antiPatterns entries instead of burying it in prose."
      : "",
    "Choose design intent before styling. Identify funnel type, audience sophistication, conversion urgency, and brand tone first, then set styleIntensity and exhibitMode deliberately.",
    "Default styleIntensity to medium unless the request clearly justifies low or high. Do not default to high.",
    "Default exhibitMode to assist. Use Exhibit for sections/components only unless the request clearly justifies full Exhibit layout plus styling. Exhibit is a tool, not the source of truth.",
    "Font rules: use one or two font families max. Choose for credibility, readability, and tone alignment. Prefer Manrope, Inter, Plus Jakarta Sans, or General Sans. Use a display serif such as Fraunces only when the brand tone is clearly premium or editorial and the page benefits from it.",
    "Design restrictions: do not flood the page with gradients, overuse shadows, round every container, or stack panels without hierarchy. Create contrast intentionally, vary layout structure instead of centering everything, and make the CTA dominant rather than decorative.",
    "Failure condition: if the page direction feels generic, over-styled, or disconnected from the conversion goal, reduce styling intensity and rebalance toward restraint.",
    "If the request touches color or background treatment, make the plan explicit about surface roles. Use a 60/30/10 style split: dominant base surface, supporting secondary surfaces, and restrained accent reserved for CTA and proof emphasis.",
    "When the user asks for a lighter, cleaner, or whiter look, actively rebalance the page toward white or near-white content surfaces, dark readable text, and tighter accent usage instead of waiting for per-element instructions.",
    "Use exactly five semantic color tokens in the built page: primary, background, text, muted, and accent. The plan should explain how those five roles power CTA, cards, support copy, and contrast beats without inventing extra palette branches.",
    "Use proofObjects and visualAnchors for real designed elements, not copy notes. If you name testimonial cards, metrics, screenshots, portraits, logo clouds, or proof panels there, the later HTML build must visibly render them.",
    "Use sectionRhythm to stop the page from becoming one repeated slab treatment. Call at least one section a contrast beat, at least one section a calmer support beat, and make the booking or CTA handoff visually distinct.",
    "In the sections array, include only sections that survive a structural justification test. Each section must state the userState it addresses, the movement it creates, and why it deserves to exist.",
    "If any section contains functional UI such as a calendar, form, dashboard excerpt, checkout surface, or chat handoff, describe its framing, proof or reassurance support, and clamp strategy explicitly instead of treating the component as self-explanatory.",
    "If the current page looks flat, generic, or text-heavy, the plan must explain which surfaces gain depth, which proof objects carry the trust load, and what breaks the page out of a plain paragraph stack.",
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
    "- Treat Exhibit as secondary design advisory, not the source of truth for the page.",
    "- Raw business context, current page state, live runtime truth, and the newest user direction outrank Exhibit guidance.",
    "- Use Exhibit only for foundation-level design sharpening: spacing, typography, density, elevation, anti-pattern avoidance, and reference anchors.",
    "- Do not let Exhibit decide offer logic, business posture, booking-vs-commerce behavior, or shell direction when stronger local context already answers those choices.",
    "- If any Exhibit guidance feels generic, over-styled, weak, or disconnected from the conversion job, ignore it instead of blending it into the final page plan.",
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

function applyBookingSectionRhythmEnhancement(html: string): string {
  const text = String(html || "");
  if (!text || /id=["']pa-booking-rhythm-enhancer["']/i.test(text)) return text;

  const rhythmCss = [
    "<style id=\"pa-booking-rhythm-enhancer\">",
    ".hero{grid-template-columns:minmax(0,1.08fr) minmax(290px,0.92fr) !important;gap:18px !important;align-items:start !important;}",
    ".hero-copy{display:flex !important;flex-direction:column !important;gap:14px !important;}",
    ".hero-copy h1{margin:0 !important;max-width:11ch !important;line-height:0.98 !important;}",
    ".hero-copy .lede{max-width:58ch !important;}",
    ".cta-row{margin-top:10px !important;align-items:flex-start !important;}",
    ".micro-proof{margin-top:0 !important;background:var(--color-background) !important;border-color:var(--color-accent) !important;box-shadow:none !important;color:var(--color-text) !important;}",
    ".hero-proof{gap:14px !important;background:var(--color-background) !important;border-color:var(--color-accent) !important;box-shadow:none !important;color:var(--color-text) !important;}",
    ".hero-proof-label{color:var(--color-accent) !important;letter-spacing:0.18em !important;}",
    ".band{background:var(--color-background) !important;border-color:var(--color-muted) !important;}",
    ".details{background:var(--color-background) !important;border-color:var(--color-muted) !important;}",
    ".details .detail-step{background:var(--color-background) !important;border-color:var(--color-muted) !important;}",
    ".faq{background:var(--color-background) !important;border-color:var(--color-muted) !important;}",
    ".booking{background:var(--color-background) !important;border-color:var(--color-primary) !important;color:var(--color-text) !important;box-shadow:none !important;}",
    ".booking h2,.booking h3,.booking strong{color:var(--color-text) !important;}",
    ".booking .section-kicker,.booking .lede,.booking p,.booking li,.booking .booking-note{color:var(--color-muted) !important;}",
    ".booking .micro-proof{background:var(--color-background) !important;border-color:var(--color-accent) !important;color:var(--color-text) !important;box-shadow:none !important;}",
    ".booking .booking-panel{background:var(--color-background) !important;border-color:var(--color-muted) !important;box-shadow:none !important;}",
    ".booking .booking-panel,.booking .booking-panel p,.booking .booking-panel .hero-proof-label,.booking .booking-panel .booking-note{color:var(--color-text) !important;}",
    "</style>",
  ].join("");

  if (/<\/head>/i.test(text)) {
    return text.replace(/<\/head>/i, `${rhythmCss}</head>`);
  }

  return `${rhythmCss}${text}`;
}

function applyBookingPrimaryGuardrails(html: string, primaryCta?: string | null): string {
  const text = String(html || "")
    .replace(/<style id=["']pa-booking-primary-guardrails["']>[\s\S]*?<\/style>/gi, "")
    .replace(/\sdata-pa-booking-primary=["'][^"']*["']/gi, "")
    .replace(/\sdata-pa-booking-secondary=["'][^"']*["']/gi, "")
    .replace(/<div class="pa-booking-proof-cluster" data-pa-booking-proof="true">[\s\S]*?<\/div>/gi, "");
  if (!text) return text;

  const normalizedPrimaryCta = normalizeCtaText(String(primaryCta || "Book a call")).toLowerCase();
  const tagPattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const bookingMatches: Array<{ full: string; attrs: string; index: number; text: string; href: string }> = [];
  let match: RegExpExecArray | null = null;
  while ((match = tagPattern.exec(text))) {
    const attrs = String(match[2] || "");
    const inner = String(match[3] || "");
    const label = normalizeCtaText(inner).toLowerCase();
    const href = extractHtmlAttribute(attrs, "href");
    const bookingLike =
      /\b(book|schedule|consult|call|apply)\b/i.test(label) ||
      /\/book\//i.test(href) ||
      (normalizedPrimaryCta && label === normalizedPrimaryCta);
    if (!bookingLike) continue;
    bookingMatches.push({
      full: match[0],
      attrs,
      index: match.index,
      text: label,
      href,
    });
  }

  if (!bookingMatches.length) return text;

  const firstBooking = bookingMatches[0];
  const immediateWindow = text.slice(
    Math.max(0, firstBooking.index - 220),
    Math.min(text.length, firstBooking.index + firstBooking.full.length + 520),
  );
  const needsAttachedProof = !hasStrongProofSurface(immediateWindow);
  const proofClusterMarkup = needsAttachedProof
    ? '<div class="pa-booking-proof-cluster" data-pa-booking-proof="true"><strong>Decision support</strong><span>Clear recommendation, visible tradeoffs, and the next step framed before the scheduler opens.</span></div>'
    : "";

  let bookingOrdinal = 0;
  const transformed = text.replace(tagPattern, (full, _tag, attrs, inner) => {
    const label = normalizeCtaText(inner).toLowerCase();
    const href = extractHtmlAttribute(attrs, "href");
    const bookingLike =
      /\b(book|schedule|consult|call|apply)\b/i.test(label) ||
      /\/book\//i.test(href) ||
      (normalizedPrimaryCta && label === normalizedPrimaryCta);
    if (!bookingLike) return full;

    bookingOrdinal += 1;
    if (bookingOrdinal === 1) {
      const primaryTag = addHtmlAttribute(full, "data-pa-booking-primary", "true");
      const primaryCluster = [
        '<div class="pa-booking-primary-stack">',
        primaryTag,
        '<div class="pa-booking-primary-note">Focused consultation. Clear next step.</div>',
        proofClusterMarkup,
        '</div>',
      ].join("");
      return primaryCluster;
    }

    if (bookingOrdinal <= 3 && (label === firstBooking.text || /\/book\//i.test(href))) {
      let secondaryTag = addHtmlAttribute(full, "data-pa-booking-secondary", "true");
      secondaryTag = replaceHtmlClassToken(secondaryTag, "pa-btn-primary", "pa-btn-secondary");
      secondaryTag = replaceHtmlClassToken(secondaryTag, "cta-primary", "cta-secondary");
      secondaryTag = replaceHtmlClassToken(secondaryTag, "btn-primary", "btn-secondary");
      secondaryTag = replaceHtmlClassToken(secondaryTag, "button-primary", "button-secondary");
      if (label === firstBooking.text || (normalizedPrimaryCta && label === normalizedPrimaryCta)) {
        secondaryTag = replaceTagInnerText(secondaryTag, "See available times");
      }
      return secondaryTag;
    }

    return full;
  });

  const guardrailCss = [
    '<style id="pa-booking-primary-guardrails">',
    '.pa-booking-primary-stack{display:grid;justify-items:start;gap:10px;max-width:min(30rem,100%);padding:14px 16px 16px;border-radius:24px;background:var(--color-background);border:1px solid var(--color-accent);box-shadow:none;}',
    '.pa-booking-primary-note{font-size:13px;line-height:1.5;color:var(--color-muted);}',
    '[data-pa-booking-primary="true"]{position:relative;isolation:isolate;display:inline-flex !important;align-items:center;justify-content:center;min-height:62px;min-width:min(19rem,100%);padding:0 32px;border-radius:999px;background:var(--color-primary) !important;color:var(--color-background) !important;font-size:1.04rem !important;font-weight:800 !important;letter-spacing:0.01em !important;border:1px solid var(--color-primary) !important;box-shadow:none !important;text-decoration:none !important;transform:translateY(-1px);}',
    '.cta-row > a:not([data-pa-booking-primary="true"]),.cta-row > button:not([data-pa-booking-primary="true"]),.booking-flow > a:not([data-pa-booking-primary="true"]),.booking-flow > button:not([data-pa-booking-primary="true"]),.hero [data-pa-booking-primary="true"] ~ a,.hero [data-pa-booking-primary="true"] ~ button{background:transparent !important;color:var(--color-muted) !important;border-color:transparent !important;box-shadow:none !important;text-decoration:underline !important;text-underline-offset:0.18em !important;min-height:auto !important;padding:6px 0 !important;opacity:0.72 !important;}',
    '.pa-btn-secondary,.cta-secondary,.btn-secondary,.button-secondary{background:transparent !important;color:currentColor !important;opacity:0.72 !important;border:0 !important;box-shadow:none !important;text-decoration:underline !important;text-underline-offset:0.18em !important;min-height:auto !important;padding:4px 0 !important;}',
    '[data-pa-booking-secondary="true"]{background:transparent !important;color:currentColor !important;opacity:0.72 !important;border:0 !important;box-shadow:none !important;text-decoration:underline !important;text-underline-offset:0.18em !important;min-height:auto !important;padding:4px 0 !important;}',
    '.pa-booking-proof-cluster{margin-top:14px;max-width:min(34rem,100%);display:grid;gap:6px;padding:14px 16px;border-radius:18px;background:var(--color-background);border:1px solid var(--color-accent);box-shadow:none;color:var(--color-text);}',
    '.pa-booking-proof-cluster strong{display:block;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-accent);}',
    '.pa-booking-proof-cluster span{font-size:14px;line-height:1.6;color:var(--color-text);}',
    '</style>',
  ].join('');

  if (/<\/head>/i.test(transformed)) {
    return transformed.replace(/<\/head>/i, `${guardrailCss}</head>`);
  }

  return `${guardrailCss}${transformed}`;
}

function applyDesignTokenFoundation(html: string): string {
  const source = String(html || "");
  if (!source.trim() || /<style\b[^>]*id=["']pa-design-token-foundation["']/i.test(source) || /--color-primary\s*:/i.test(source)) {
    return source;
  }

  const tokenCss = [
    '<style id="pa-design-token-foundation">',
    ':root{--color-primary:#1846d8;--color-background:#ffffff;--color-text:#162033;--color-muted:#64748b;--color-accent:#2456ff;}',
    '</style>',
  ].join('');

  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${tokenCss}</head>`);
  }

  return `${tokenCss}${source}`;
}

function postProcessGeneratedPageHtml(html: string, pageType?: string | null, primaryCta?: string | null): string {
  let out = sanitizeGeneratedHtmlVisualAssets(html);
  out = applyDesignTokenFoundation(out);
  out = applyLayoutSafetyGuardrails(out);
  if (String(pageType || "").toLowerCase() === "booking") {
    out = applyBookingPrimaryGuardrails(out, primaryCta);
    if (hasUniformPrimarySectionStyling(out)) {
      out = applyBookingSectionRhythmEnhancement(out);
    }
  }
  return out;
}

function applyLayoutSafetyGuardrails(html: string): string {
  const source = String(html || "");
  if (!source.trim() || /<style\b[^>]*id=["']pa-layout-safety-guardrails["']/i.test(source)) return source;

  const guardrailCss = [
    '<style id="pa-layout-safety-guardrails">',
    'html,body{max-width:100%;overflow-x:hidden;}',
    '*,*::before,*::after{box-sizing:border-box;min-width:0;}',
    'body :where(main,section,article,aside,header,footer,div,form){max-width:100%;}',
    'body :where(h1,h2,h3,h4,h5,h6,p,li,blockquote,a,button,label,span){max-inline-size:100%;overflow-wrap:anywhere;word-break:normal;}',
    'body :where(img,svg,video,canvas,iframe){display:block;max-width:100%;height:auto;}',
    'body :where(pre,code){max-width:100%;white-space:pre-wrap;word-break:break-word;}',
    'body :where(button,a,input,textarea,select){max-width:100%;}',
    'body :where(.page,.container,.wrap,.wrapper,.panel,.card,.band,.hero,.booking,.details,.fit-grid,.booking-panel,.booking-modal-panel,.booking-overlay-panel){max-width:min(100%,var(--pa-safe-max,100%));}',
    '</style>',
  ].join('');

  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${guardrailCss}</head>`);
  }

  return `${guardrailCss}${source}`;
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

function hasStrongProofSurface(fragment: string) {
  const html = String(fragment || "");
  const text = extractQualityText(html);
  const proofContainerCount = countPatternMatches(
    html,
    /<(div|section|aside|ul)\b[^>]*(class|id)=["'][^"']*(proof|testimonial|review|results?|outcomes?|stats?|metrics?|logos?|trust|credibility)[^"']*["'][^>]*>/gi,
  );
  const listItemCount = countPatternMatches(html, /<li\b/gi);
  const explicitProofCount = countPatternMatches(
    text,
    /\b(testimonial|testimonials|case stud|review|reviews|trusted by|client stories|client outcomes?|saved \d+|increased|reduced|founder|ceo|director|team at)\b/gi,
  );
  const numericProofSignals =
    countPatternMatches(text, /\b\d{1,3}%\b/g) >= 1 ||
    countPatternMatches(text, /\b\d+\s*(min|minute|minutes|hour|hours|day|days|week|weeks|x)\b/gi) >= 2;
  const compactProofModule =
    proofContainerCount >= 1 &&
    /<strong>[^<]{4,80}<\/strong>\s*[^<]{32,}/i.test(html);

  return explicitProofCount >= 1 || numericProofSignals || compactProofModule || (proofContainerCount >= 1 && listItemCount >= 2);
}

function countPatternMatches(value: string, pattern: RegExp) {
  return (String(value || "").match(pattern) || []).length;
}

function buildBookingCtaAudit(html: string) {
  const source = String(html || "");
  const openingSlice = source.slice(0, Math.max(1400, Math.floor(source.length * 0.22)));
  const openingActions = countPatternMatches(openingSlice, /<(a|button)\b/gi);
  const bookingActionLabels = countPatternMatches(
    openingSlice,
    /\b(book a call|book now|schedule|schedule now|schedule a call|request a consultation|apply now|start application)\b/gi,
  );
  const competingActionLabels = countPatternMatches(
    openingSlice,
    /\b(learn more|see how|view details|read more|explore|watch demo|get started)\b/gi,
  );
  const primaryHintInAction = /<(a|button)\b[^>]*(class|id|data-[^=]+)=['"][^'"]*(cta|primary|book|schedule|apply)[^'"]*['"]/i.test(
    openingSlice,
  );
  const primaryStyleHint =
    /\.(?:cta|button|btn|link)[-_a-z0-9]*(primary|book|schedule|apply)[^{]*\{[^}]*?(background\s*:|box-shadow\s*:|font-weight\s*:\s*(?:700|800)|border-radius\s*:\s*999)/i.test(
      source,
    ) ||
    /<(a|button)\b[^>]*style=['"][^'"]*(background\s*:|box-shadow\s*:|font-weight\s*:\s*(?:700|800)|border-radius\s*:\s*999)/i.test(
      openingSlice,
    );

  return {
    openingActions,
    bookingActionLabels,
    competingActionLabels,
    primaryDominanceLikely: primaryHintInAction || primaryStyleHint,
  };
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

function assessSourceActionPlanAdherence(html: string, plan: SourceActionPlan | null) {
  if (!plan || !plan.moves.length) {
    return {
      matchedMoves: 0,
      totalMoves: 0,
      unmetPrimaryMoves: [] as Array<{ target: string; change: string }>,
      issues: [] as string[],
    };
  }

  const body = extractBodyHtml(html);
  const text = extractQualityText(body);
  const sectionCount = countPatternMatches(body, /<section\b/gi);
  const actionCount = countPatternMatches(body, /<(a|button|form|input|textarea|select)\b/gi);
  const heroSignals = /<h1\b|class=["'][^"']*hero|id=["'][^"']*hero/i.test(body);
  const bookingSignals = /class=["'][^"']*booking|id=["'][^"']*book|calendar|schedule|book a call|book now/i.test(body);
  const proofSignals = hasProofSurface(body);

  const unmetPrimaryMoves: Array<{ target: string; change: string }> = [];
  let matchedMoves = 0;

  for (const move of plan.moves) {
    const signalBlob = `${move.key} ${move.target} ${move.change} ${move.why} ${move.selectorHint || ""}`.toLowerCase();
    let satisfied = false;

    if (/(hero|opening|first screen)/.test(signalBlob)) {
      satisfied = heroSignals && actionCount >= 1;
    }
    if (!satisfied && /(proof|trust|testimonial|review|credibility|authority)/.test(signalBlob)) {
      satisfied = proofSignals;
    }
    if (!satisfied && /(cta|action|button|handoff)/.test(signalBlob)) {
      satisfied = actionCount >= 2 || (actionCount >= 1 && bookingSignals);
    }
    if (!satisfied && /(booking|schedule|calendar)/.test(signalBlob)) {
      satisfied = bookingSignals;
    }
    if (!satisfied && /(section|cadence|rhythm|flow|sequence)/.test(signalBlob)) {
      satisfied = sectionCount >= 3;
    }
    if (!satisfied && move.selectorHint) {
      const selectorToken = String(move.selectorHint).replace(/^[.#]/, "").toLowerCase();
      if (selectorToken) satisfied = text.includes(selectorToken) || body.toLowerCase().includes(selectorToken);
    }
    if (!satisfied) {
      const keywords = String(move.change || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 5)
        .slice(0, 3);
      if (keywords.length >= 2) satisfied = keywords.every((token) => text.includes(token));
    }

    if (satisfied) matchedMoves += 1;
    else if (move.priority === "primary") unmetPrimaryMoves.push({ target: move.target, change: move.change });
  }

  const issues: string[] = [];
  if (!matchedMoves) {
    issues.push("The output does not clearly implement the declared source-action plan. It needs to make the promised structural moves visible in the page source.");
  }
  for (const move of unmetPrimaryMoves.slice(0, 2)) {
    issues.push(`The output still does not clearly implement the planned move for ${move.target}: ${move.change}`);
  }

  return {
    matchedMoves,
    totalMoves: plan.moves.length,
    unmetPrimaryMoves,
    issues,
  };
}

function hasBookingClusterFailure(issues: string[]) {
  return issues.some((issue) =>
    /(first screen|first serious ask|first CTA|primary CTA|trust cue|adjacent trust surface|strong proof module|proof is still under-staged|decision cluster|booking handoff|hero and booking block|middle support beat|dominant treatment|CTA dominance is diluted)/i.test(
      issue,
    ),
  );
}

function hasBookingGenericOutputFailure(issues: string[]) {
  return issues.some((issue) =>
    /generic starter template|generic consultation shell|generic enterprise filler|invented or generic proof|placeholder faq scaffolding|ornamental fact clutter|CTA dominance is diluted|familiar AI booking mockup|overused Inter\/Space Grotesk pairing/i.test(
      issue,
    ),
  );
}

function countTextSlabSections(html: string) {
  const matches = Array.from(String(html || "").matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)).slice(0, 14);
  let count = 0;

  for (const match of matches) {
    const sectionHtml = String(match[1] || "");
    if (!sectionHtml.trim()) continue;

    const sectionText = extractQualityText(sectionHtml);
    const headingCount = countPatternMatches(sectionHtml, /<h[1-6]\b/gi);
    const actionCount = countPatternMatches(sectionHtml, /<(a|button)\b/gi);
    const paragraphCount = countPatternMatches(sectionHtml, /<(p|li)\b/gi);
    const richStructureSignals =
      /<(blockquote|details|dl|dt|dd|ul|ol|figure|img|svg|aside|article|form|input|textarea|iframe|video)\b/i.test(sectionHtml) ||
      /(class|id)=["'][^"']*(card|panel|grid|rail|proof|testimonial|results?|outcomes?|stats?|metrics?|benefits?|features?|faq|comparison|process|steps?|timeline|logos?|trust|cluster)[^"']*["']/i.test(sectionHtml);

    if (richStructureSignals) continue;
    if (headingCount === 0) continue;
    if (sectionText.length < 80 || sectionText.length > 420) continue;
    if (paragraphCount === 0) continue;
    if (actionCount > 1) continue;

    count += 1;
  }

  return count;
}

function hasWeakStandaloneCtaBand(html: string) {
  const matches = Array.from(String(html || "").matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)).slice(0, 14);
  for (const match of matches) {
    const sectionHtml = String(match[1] || "");
    const sectionText = extractQualityText(sectionHtml);
    if (!/\b(book|schedule|consultation|consult|call|appointment|get started)\b/i.test(sectionText)) continue;

    const actionCount = countPatternMatches(sectionHtml, /<(a|button)\b/gi);
    const proofSignals = hasProofSurface(sectionHtml);
    const structuralSignals =
      /<(blockquote|details|dl|dt|dd|ul|ol|figure|img|svg|aside|article|form|iframe|video)\b/i.test(sectionHtml) ||
      /(class|id)=["'][^"']*(card|panel|grid|rail|proof|testimonial|results?|outcomes?|stats?|metrics?|benefits?|features?|faq|comparison|process|steps?|timeline|logos?|trust|cluster)[^"']*["']/i.test(sectionHtml);

    if (actionCount <= 1 && !proofSignals && !structuralSignals && sectionText.length <= 220) {
      return true;
    }
  }
  return false;
}

function readPlanString(record: Record<string, unknown> | null, key: string, fallback = "") {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function readPlanObject(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readPlanSourceActionPlan(record: Record<string, unknown> | null) {
  return sanitizeSourceActionPlan(readPlanObject(record, "sourceActionPlan"));
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

function stripLeadingArticle(value: string) {
  return String(value || "").replace(/^(?:a|an|the)\s+/i, "").trim();
}

function capitalizeSentence(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isGenericConsultationShellText(value: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!text) return false;
  return /\b(book your consultation|book your automation consultation|why book this consultation|why choose this session|what you'll gain|outcome focus|trust and transparency|ready to take action|a premium session designed to clarify your automation decisions|our premium session is designed to clarify your automation decisions|expect a clear, structured session that addresses your automation needs|your path to clarity starts here)\b/i.test(text);
}

function isPlannerMetaText(value: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  return /^(the hero will|the page will|this page will|proof should be|proof must be|the booking section|the booking path|the first screen|the opening cluster|use a split composition|keep proof beside|place proof|attach reassurance)/i.test(text);
}

function pickNonGenericFallbackCopy(value: string, fallback: string) {
  const text = pickFallbackAudienceCopy(value, fallback);
  return isGenericConsultationShellText(text) || isPlannerMetaText(text) ? fallback : text;
}

function pickFallbackCtaText(value: string, fallback: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  if (/^\//.test(text) || /^https?:\/\//i.test(text)) return fallback;
  if (text.length > 40) return fallback;
  return text;
}

function buildBookingFallbackHtmlFromPlan(input: {
  funnelName: string;
  pageTitle: string;
  prompt: string;
  primaryCta: string;
  bookingHref: string;
  bookingSectionId: string;
  audience?: string | null;
  offer?: string | null;
  companyContext?: string | null;
  pageGoal?: string | null;
  generationPlan: Record<string, unknown> | null;
}) {
  const openingCluster = readPlanObject(input.generationPlan, "openingCluster");
  const ctaSystem = readPlanObject(input.generationPlan, "ctaSystem");
  const bookingHandoff = readPlanObject(input.generationPlan, "bookingHandoff");
  const audience = pickFallbackAudienceCopy(
    String(input.audience || ""),
    "operators and founders with a live decision to make",
  );
  const offer = pickFallbackAudienceCopy(
    String(input.offer || ""),
    "a private strategy consultation",
  );
  const companyContext = pickFallbackAudienceCopy(String(input.companyContext || ""), "");
  const pageGoal = pickFallbackAudienceCopy(
    String(input.pageGoal || ""),
    "clarify the next move without burning time on vague discovery",
  );
  const cleanOffer = stripLeadingArticle(offer) || "strategy consultation";
  const fallbackPromise = /consultation|session|audit|strategy|review|diagnostic|call/i.test(cleanOffer)
    ? `Book the ${cleanOffer}`
    : `Book the ${cleanOffer} session`;
  const promiseText = pickNonGenericFallbackCopy(
    readPlanString(openingCluster, "promise", fallbackPromise),
    fallbackPromise,
  );
  const qualifier = pickNonGenericFallbackCopy(
    readPlanString(openingCluster, "qualifier", `Built for ${audience}`),
    `Built for ${audience}`,
  );
  const adjacentProof = pickNonGenericFallbackCopy(
    readPlanString(openingCluster, "adjacentProof", ""),
    `A structured ${cleanOffer} with a clear recommendation, visible tradeoffs, and enough decision support to act without a second vague discovery call.`,
  );
  const supportRole = readPlanString(openingCluster, "supportRole", "proof rail");
  const summary = pickNonGenericFallbackCopy(
    readPlanString(input.generationPlan, "summary", ""),
    `${capitalizeSentence(cleanOffer)} for ${audience} that turns live operational pressure into a clear next move.`,
  );
  const heroApproach = pickNonGenericFallbackCopy(
    readPlanString(input.generationPlan, "heroApproach", ""),
    `Lead with the decision ${audience} is trying to make, keep the ${cleanOffer} visibly valuable, and attach reassurance to the first booking action.`,
  );
  const proofStrategy = pickNonGenericFallbackCopy(
    readPlanString(input.generationPlan, "proofStrategy", ""),
    "Keep proof beside the first CTA, then restage reassurance again inside the booking handoff so the page never asks in a vacuum.",
  );
  const handoffType = readPlanString(bookingHandoff, "sectionType", "direct booking handoff");
  const handoffReassurance = pickNonGenericFallbackCopy(
    readPlanString(bookingHandoff, "reassurance", ""),
    "You leave knowing what to do next, what to ignore, and whether implementation support actually makes sense right now.",
  );
  const handoffProof = pickNonGenericFallbackCopy(
    readPlanString(bookingHandoff, "repeatProof", ""),
    "Proof and reassurance stay attached to the handoff so the booking step feels earned instead of premature.",
  );
  const ctaText = pickFallbackCtaText(
    readPlanString(ctaSystem, "dominantCta", input.primaryCta || "Book a call"),
    input.primaryCta || "Book a call",
  );
  const bookingHref = input.bookingHref || `#${input.bookingSectionId}`;
  const canEmbedBooking = !/^#/.test(bookingHref);
  const primaryBookingHref = canEmbedBooking ? `#${input.bookingSectionId}` : bookingHref;
  const supportLabel = /proof\s+(rail|strip)/i.test(supportRole) ? "Decision support" : supportRole || "Decision support";
  const handoffLead = /embedded booking section/i.test(handoffType)
    ? "The booking section stays embedded and low-friction."
    : /direct booking handoff/i.test(handoffType)
      ? "The booking path stays direct and low-friction."
      : `${handoffType.charAt(0).toUpperCase()}${handoffType.slice(1)}.`;
  const contextLine = companyContext
    ? `${capitalizeSentence(companyContext)}.`
    : `This page is tuned for ${audience}, with the offer framed around ${cleanOffer}.`;
  const bestUsedWhen = `You are weighing ${cleanOffer} because the current bottleneck, handoff, or operating gap needs a real decision now.`;
  const leaveWith = `You leave with a clearer recommendation, a tighter sense of fit, and a next move grounded in ${pageGoal}.`;
  const proofAtAsk = handoffProof || `Proof and reassurance stay attached to the booking step so the handoff into ${cleanOffer} feels earned.`;
  const bookingTriggerAttrs = "";
  const bookingStatusReady = canEmbedBooking ? "true" : "false";
  const bookingStatusLabel = canEmbedBooking ? "Scheduler attached" : "Calendar connection pending";
  const bookingStatusCopy = canEmbedBooking
    ? "The selected calendar stays attached to this page shell, so scheduling happens inline while the proof, promise, and next-step framing stay in view."
    : "Connect a live booking calendar to replace this placeholder handoff with an in-page scheduler.";
  const bookingRuntimeHtml = canEmbedBooking
    ? buildBookingRuntimePlaceholderHtml({
        surfaceContext: resolveFunnelBookingSurfaceContext({
          posture: "generated",
          routeKind: canEmbedBooking ? "linked" : "placeholder",
          pageTitle: input.pageTitle || input.funnelName || null,
          pageIntent: {
            pageGoal,
            audience,
            offer: cleanOffer,
            primaryCta: ctaText,
            companyContext,
          },
          overrides: {
            title: "Book the session while the case for it is still visible",
            body: `${handoffLead} ${handoffReassurance}`,
            proofLabel: "Decision support",
            proofBody: bookingStatusCopy,
            note: "Keep the standalone booking page as a secondary escape hatch, not the primary experience.",
          },
        }),
      })
    : "";
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${escapeHtml(input.pageTitle || input.funnelName || "Booking page")}</title>`,
    '  <link rel="preconnect" href="https://fonts.googleapis.com" />',
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    '  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />',
    "  <style>",
    "    :root { color-scheme: light; --bg: #efe6d8; --surface: #fbf6ee; --surface-strong: #f1e4d2; --ink: #18212b; --ink-soft: #5d6777; --accent: #b46333; --accent-deep: #7a3d17; --line: rgba(24, 33, 43, 0.12); --deep: #121c26; --deep-soft: #1b2a38; }",
    "    * { box-sizing: border-box; }",
    "    body { margin: 0; font-family: 'IBM Plex Sans', 'Avenir Next', 'Trebuchet MS', sans-serif; background: radial-gradient(circle at top left, #fff8ef 0%, var(--bg) 42%, #e5d7c3 100%); color: var(--ink); }",
    "    h1, h2, h3 { font-family: 'Sora', 'IBM Plex Sans', sans-serif; font-weight: 700; }",
    "    a { color: inherit; text-decoration: none; }",
    "    .page { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 26px 0 88px; }",
    "    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 4px 20px; color: var(--ink-soft); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; }",
    "    .hero { display: grid; grid-template-columns: minmax(0, 1.14fr) minmax(320px, 0.86fr); gap: 22px; align-items: stretch; }",
    "    .hero-copy { padding: 42px; border-radius: 30px; background: linear-gradient(145deg, rgba(255,250,243,0.96), rgba(243,231,214,0.92)); border: 1px solid var(--line); box-shadow: 0 18px 50px rgba(24, 33, 43, 0.10); }",
    "    .hero-kicker, .section-kicker, .ledger-label, .pill-label { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; }",
    "    .hero-kicker { padding: 8px 12px; border-radius: 999px; background: rgba(180, 99, 51, 0.12); color: var(--accent-deep); }",
    "    h1 { margin: 18px 0 16px; max-width: 10ch; font-size: clamp(3rem, 5vw, 5.1rem); line-height: 0.92; letter-spacing: -0.05em; }",
    "    .lede { margin: 0; max-width: 60ch; color: var(--ink-soft); font-size: 18px; line-height: 1.75; }",
    "    .hero-actions { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; margin-top: 28px; }",
    "    .cta-primary { min-height: 62px; padding: 0 32px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(122, 61, 23, 0.38); background: linear-gradient(180deg, #c97842, var(--accent)); color: #fff8f2; font-weight: 700; font-size: 16px; box-shadow: 0 18px 34px rgba(122, 61, 23, 0.22); }",
    "    .cta-secondary { min-height: auto; padding: 2px 0; border: 0; background: transparent; color: var(--ink-soft); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; font-weight: 600; }",
    "    .hero-note { margin-top: 18px; display: grid; gap: 10px; }",
    "    .support-card { padding: 16px 18px; border-radius: 20px; background: rgba(255, 252, 246, 0.78); border: 1px solid rgba(24, 33, 43, 0.10); }",
    "    .support-card strong { display: block; margin-bottom: 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }",
    "    .proof-ledger { padding: 28px; border-radius: 30px; background: linear-gradient(180deg, var(--deep), var(--deep-soft)); color: #f7f2ea; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 22px 54px rgba(17, 28, 38, 0.24); display: grid; gap: 18px; }",
    "    .ledger-label { color: rgba(247, 242, 234, 0.66); }",
    "    .proof-ledger h2 { margin: 0; font-size: clamp(1.8rem, 3vw, 2.6rem); line-height: 1.02; letter-spacing: -0.04em; }",
    "    .ledger-copy { color: rgba(247, 242, 234, 0.78); line-height: 1.72; }",
    "    .ledger-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }",
    "    .ledger-list li { padding: 14px 16px; border-radius: 18px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.08); }",
    "    .ledger-list strong { display: block; margin-bottom: 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(247, 242, 234, 0.68); }",
    "    .cred-strip { margin-top: 22px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }",
    "    .cred-card { padding: 18px; border-radius: 22px; background: rgba(255, 250, 243, 0.86); border: 1px solid var(--line); box-shadow: 0 10px 26px rgba(24, 33, 43, 0.08); }",
    "    .cred-card strong { display: block; margin-bottom: 8px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent-deep); }",
    "    .section-shell { margin-top: 22px; padding: 30px; border-radius: 30px; border: 1px solid var(--line); box-shadow: 0 18px 48px rgba(24, 33, 43, 0.10); }",
    "    .session-map { background: linear-gradient(180deg, rgba(250, 245, 236, 0.92), rgba(240, 229, 214, 0.90)); }",
    "    .section-kicker { color: var(--ink-soft); margin-bottom: 10px; }",
    "    .section-title { margin: 0 0 12px; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.02; letter-spacing: -0.04em; }",
    "    .session-grid { margin-top: 18px; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr); gap: 18px; }",
    "    .process-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }",
    "    .process-card, .expectation-card { padding: 20px; border-radius: 22px; background: rgba(255, 251, 245, 0.82); border: 1px solid rgba(24, 33, 43, 0.10); }",
    "    .process-index { width: 40px; height: 40px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: rgba(180, 99, 51, 0.12); color: var(--accent-deep); font-weight: 700; }",
    "    .process-card strong, .expectation-card strong { display: block; margin: 14px 0 8px; font-size: 15px; }",
    "    .process-card div, .expectation-card div { color: var(--ink-soft); line-height: 1.72; }",
    "    .pill-list { display: grid; gap: 12px; }",
    "    .pill-row { padding: 14px 16px; border-radius: 18px; background: rgba(18, 28, 38, 0.04); border: 1px solid rgba(24, 33, 43, 0.08); }",
    "    .pill-row strong { display: block; margin-bottom: 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent-deep); }",
    "    .booking-stage { margin-top: 22px; padding: 30px; border-radius: 32px; background: linear-gradient(180deg, rgba(27, 37, 47, 0.96), rgba(20, 29, 38, 0.98)); color: #f7f2ea; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 12px 30px rgba(17, 28, 38, 0.16); }",
    "    .booking-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 390px); gap: 24px; align-items: start; }",
    "    .booking-stage .section-kicker { color: rgba(247, 242, 234, 0.68); }",
    "    .booking-stage .section-title { color: #f7f2ea; }",
    "    .booking-copy { color: rgba(247, 242, 234, 0.78); line-height: 1.78; }",
    "    .booking-proof { margin-top: 18px; padding: 18px 20px; border-radius: 22px; background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(255, 255, 255, 0.08); }",
    "    .booking-proof strong { display: block; margin-bottom: 8px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(247, 242, 234, 0.68); }",
    "    .booking-card { padding: 22px; border-radius: 26px; background: linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(246, 239, 229, 0.97)); color: var(--ink); border: 1px solid rgba(24, 33, 43, 0.08); box-shadow: 0 8px 22px rgba(17, 28, 38, 0.10); }",
    "    .booking-card .hero-kicker { margin-bottom: 10px; }",
    "    .booking-card-copy { color: var(--ink-soft); line-height: 1.72; }",
    "    .booking-flow { display: grid; gap: 12px; margin-top: 16px; }",
    "    .booking-status { margin-top: 16px; padding: 12px 14px; border-radius: 18px; display: grid; gap: 6px; background: rgba(180, 99, 51, 0.08); border: 1px solid rgba(180, 99, 51, 0.16); }",
    "    .booking-status[data-booking-ready='false'] { background: rgba(24, 33, 43, 0.05); border-color: rgba(24, 33, 43, 0.10); }",
    "    .booking-status-label { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-deep); }",
    "    .booking-status[data-booking-ready='false'] .booking-status-label { color: var(--ink); }",
    "    .booking-status-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 6px rgba(180, 99, 51, 0.12); }",
    "    .booking-status[data-booking-ready='false'] .booking-status-dot { background: var(--ink-soft); box-shadow: 0 0 0 6px rgba(93, 103, 119, 0.12); }",
    "    .booking-status-copy { color: var(--ink-soft); font-size: 14px; line-height: 1.65; }",
    "    .booking-native-shell { margin-top: 16px; padding: 0; border-radius: 0; background: transparent; border: 0; box-shadow: none; }",
    "    .booking-note { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(24, 33, 43, 0.10); color: var(--ink-soft); font-size: 14px; line-height: 1.65; }",
    "    @media (max-width: 940px) { .hero, .cred-strip, .session-grid, .process-grid, .booking-grid { grid-template-columns: 1fr; } .hero-copy, .proof-ledger, .section-shell, .booking-stage { padding: 24px; } h1 { max-width: 100%; } .page { width: min(100% - 24px, 1180px); } }",
    "  </style>",
    "</head>",
    "<body>",
    '  <main class="page">',
    '    <div class="topbar"><span>' + escapeHtml(input.funnelName || "Booking funnel") + '</span><span>' + escapeHtml(cleanOffer) + '</span></div>',
    '    <section class="hero">',
    '      <div class="hero-copy">',
    '        <div class="hero-kicker">' + escapeHtml(qualifier) + '</div>',
    '        <h1>' + escapeHtml(promiseText) + '</h1>',
    '        <p class="lede">' + escapeHtml(heroApproach || summary) + '</p>',
    '        <div class="hero-actions">',
    '          <a class="cta-primary" href="' + escapeHtml(primaryBookingHref) + '"' + bookingTriggerAttrs + '>' + escapeHtml(ctaText) + '</a>',
    '          <a class="cta-secondary" href="#booking-stage">See the booking handoff</a>',
    "        </div>",
    '        <div class="hero-note">',
    '          <div class="support-card"><strong>' + escapeHtml(supportLabel) + '</strong>' + escapeHtml(adjacentProof) + '</div>',
    '          <div class="support-card"><strong>Scheduling posture</strong>' + escapeHtml(bookingStatusCopy) + '</div>',
    '        </div>',
    "      </div>",
    '      <aside class="proof-ledger">',
    '        <div class="ledger-label">Decision ledger</div>',
    '        <h2>' + escapeHtml(summary) + '</h2>',
    '        <div class="ledger-copy">' + escapeHtml(contextLine) + '</div>',
    '        <ul class="ledger-list">',
    '          <li><strong>Proof strategy</strong>' + escapeHtml(proofStrategy) + '</li>',
    '          <li><strong>What changes after the call</strong>' + escapeHtml(leaveWith) + '</li>',
    '          <li><strong>Session output</strong>' + escapeHtml(handoffReassurance) + '</li>',
    "        </ul>",
    "      </aside>",
    "    </section>",
    '    <section class="cred-strip" aria-label="Credibility strip">',
    '      <div class="cred-card"><strong>Best used when</strong>' + escapeHtml(bestUsedWhen) + '</div>',
    '      <div class="cred-card"><strong>What changes after the call</strong>' + escapeHtml(leaveWith) + '</div>',
    '      <div class="cred-card"><strong>Proof at the ask</strong>' + escapeHtml(proofAtAsk) + '</div>',
    "    </section>",
    '    <section class="section-shell session-map" id="details">',
    '      <div class="section-kicker">How this booking earns itself</div>',
    '      <h2 class="section-title">One operating thread from pressure to recommendation</h2>',
    '      <p class="lede">' + escapeHtml(summary) + '</p>',
    '      <div class="session-grid">',
    '        <div class="process-grid">',
    '          <div class="process-card"><div class="process-index">1</div><strong>Clarify the live pressure</strong><div>Start with the actual bottleneck, handoff gap, or delivery constraint instead of vague improvement language.</div></div>',
    '          <div class="process-card"><div class="process-index">2</div><strong>Pressure-test the path</strong><div>Turn timing, delivery risk, tradeoffs, and implementation posture into a recommendation that matches ' + escapeHtml(audience) + '.</div></div>',
    '          <div class="process-card"><div class="process-index">3</div><strong>Leave with the next move</strong><div>You leave with a recommendation and a next step tied to ' + escapeHtml(pageGoal) + '.</div></div>',
    '        </div>',
    '        <div class="expectation-card">',
    '          <div class="pill-label">Expectation frame</div>',
    '          <div class="pill-list">',
    '            <div class="pill-row"><strong>Who this is for</strong>You are evaluating whether ' + escapeHtml(cleanOffer) + ' is the right next move and need a grounded answer fast.</div>',
    '            <div class="pill-row"><strong>Why it feels safe to book</strong>' + escapeHtml(proofAtAsk) + '</div>',
    '            <div class="pill-row"><strong>What stays visible</strong>The page keeps the case, proof, and expectations in view while the booking handoff happens.</div>',
    '          </div>',
    '        </div>',
    "      </div>",
    "    </section>",
    '    <section class="booking-stage" id="booking-stage">',
    '      <div class="booking-grid">',
    '        <div>',
    '          <div class="section-kicker">Booking handoff</div>',
    '          <h2 class="section-title">Book while the rationale, proof, and next-step framing are still in view</h2>',
    '          <p class="booking-copy">' + escapeHtml(handoffLead + " " + handoffReassurance) + '</p>',
    '          <div class="booking-proof"><strong>Reassurance at the handoff</strong>' + escapeHtml(handoffProof) + '</div>',
    '        </div>',
    '        <div class="booking-card" id="' + escapeHtml(input.bookingSectionId) + '">',
    '          <div class="hero-kicker">Primary booking path</div>',
    '          <p class="booking-card-copy">Choose a time that works, confirm the session, and move into the conversation with the context already anchored around ' + escapeHtml(pageGoal) + '.</p>',
    '        <div class="booking-flow">',
    '          <a class="cta-primary" href="' + escapeHtml(primaryBookingHref) + '"' + bookingTriggerAttrs + '>' + escapeHtml(ctaText) + '</a>',
    '          <a class="cta-secondary" href="' + escapeHtml(bookingHref) + '" target="_blank" rel="noopener noreferrer">Open the booking page directly</a>',
    "        </div>",
    '        <div class="booking-status" data-booking-status="true" data-booking-ready="' + bookingStatusReady + '"><div class="booking-status-label"><span class="booking-status-dot"></span><span data-booking-status-label="true">' + escapeHtml(bookingStatusLabel) + '</span></div><div class="booking-status-copy">' + escapeHtml(bookingStatusCopy) + '</div></div>',
    canEmbedBooking ? '        <div class="booking-native-shell">' + bookingRuntimeHtml + '</div>' : "",
    '        <div class="booking-note">The page keeps proof, expectations, and the booking ask tied together so the handoff into ' + escapeHtml(cleanOffer) + ' feels like the next logical move, not an abrupt leap.</div>',
    '        </div>',
    "      </div>",
    "    </section>",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function escapeRegExp(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enhanceBookingSchedulingExperience(input: {
  html: string;
  bookingHref?: string | null;
  ctaText?: string | null;
}) {
  const rawHtml = String(input.html || "");
  const bookingHref = String(input.bookingHref || "").trim();
  if (!rawHtml || !bookingHref || /^#/.test(bookingHref) || /data-pa-booking-runtime=/i.test(rawHtml)) return rawHtml;

  const ctaLabel = escapeHtml(String(input.ctaText || "Open scheduler").trim() || "Open scheduler");
  const bookingHrefPattern = new RegExp(`(<a\\b[^>]*href=["'])${escapeRegExp(bookingHref)}(["'][^>]*)(>)`, "gi");
  let triggerCount = 0;
  let html = rawHtml.replace(bookingHrefPattern, (match, prefix, href, suffix, end) => {
    if (triggerCount >= 2) return match;
    triggerCount += 1;
    return `${prefix}${href}${suffix} data-booking-inline-target="true" data-booking-cta-label="${ctaLabel}"${end}`;
  });

  if (!triggerCount) return rawHtml;

  const inlineRuntimeHtml = buildBookingRuntimePlaceholderHtml({
    surfaceContext: resolveFunnelBookingSurfaceContext({
      posture: "inline-upgrade",
      routeKind: "linked",
      overrides: {
        title: "Choose a time without leaving the page",
        proofLabel: "Inline scheduler",
        proofBody: "The booking foundation stays native instead of falling back to a detached overlay.",
        note: "Use the standalone booking page only when a separate full-page handoff is genuinely better.",
      },
    }),
  });

  html = html.replace(
    /(<a\b[^>]*data-booking-inline-target="true"[^>]*>[\s\S]*?<\/a>)/i,
    `$1<div class="booking-inline-status" data-booking-status="true" data-booking-ready="true"><div class="booking-inline-status-label"><span class="booking-inline-status-dot"></span><span data-booking-status-label="true">Scheduler attached</span></div><div class="booking-inline-status-copy">The booking foundation stays inside the page flow, so the proof and the ask stay connected while visitors choose a time.</div></div><div class="booking-inline-runtime">${inlineRuntimeHtml}</div>`,
  );

  const styleBlock = [
    "<style data-booking-overlay=\"true\">",
    "  .booking-inline-status { margin-top: 14px; display: grid; gap: 6px; padding: 12px 14px; border-radius: 18px; background: rgba(24, 70, 216, 0.08); border: 1px solid rgba(24, 70, 216, 0.12); max-width: min(32rem, 100%); }",
    "  .booking-inline-status-label { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #173d9f; }",
    "  .booking-inline-status-dot { width: 10px; height: 10px; border-radius: 999px; background: #1846d8; box-shadow: 0 0 0 6px rgba(24, 70, 216, 0.12); }",
    "  .booking-inline-status-copy { color: rgba(22, 32, 51, 0.78); font-size: 14px; line-height: 1.6; }",
    "  .booking-inline-runtime { margin-top: 16px; padding: 14px; border-radius: 22px; background: linear-gradient(180deg, rgba(252,249,243,0.98), rgba(244,238,228,0.96)); border: 1px solid rgba(22,32,51,0.1); box-shadow: 0 22px 56px rgba(15,23,42,0.12); }",
    "</style>",
  ].join("\n");

  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${styleBlock}\n</head>`) : `${styleBlock}\n${html}`;
  return html;
}

function hasGenericVisualSystem(html: string) {
  const text = String(html || "");
  const usesBasicFontStack =
    /font-family\s*:\s*(?:(?:['"]?(?:segoe ui|tahoma|geneva|verdana|arial|helvetica neue|helvetica)['"]?)\s*,\s*)+(?:['"]?(?:sans-serif|system-ui)['"]?)\s*[;}]/i.test(
      text,
    ) || /font-family\s*:\s*['"]?(?:segoe ui|tahoma|geneva|verdana|arial|helvetica neue|helvetica|sans-serif|system-ui)['"]?\s*[;}]/i.test(text);
  const usesOverfamiliarAiFontPair = /font-family\s*:\s*['"]?inter['"]?/i.test(text) && /font-family\s*:\s*['"]?space grotesk['"]?/i.test(text);
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
    (usesOverfamiliarAiFontPair ? 1 : 0) +
    (usesViewportHeroShell ? 1 : 0) +
    (flatBackgroundSignals >= 3 ? 1 : 0) +
    (containedSectionSignals < 5 ? 1 : 0) +
    (structuredLayoutSignals < 6 ? 1 : 0) +
    (premiumTypographySignals < 4 ? 1 : 0) +
    (containedLayoutSignals < 3 ? 1 : 0);

  return (
    starterTemplateSignals >= 4 ||
    (usesBasicFontStack && structuredLayoutSignals < 6 && flatBackgroundSignals >= 2 && containedSectionSignals < 5) ||
    (usesOverfamiliarAiFontPair && structuredLayoutSignals < 10 && containedSectionSignals < 6) ||
    (usesBasicFontStack && hasFlatHeroShell && layeredSurfaceSignals < 4) ||
    (hasFlatHeroShell && flatBackgroundSignals >= 3 && structuredLayoutSignals < 7) ||
    (usesCenteredHeroCardShell && flatBackgroundSignals >= 2 && premiumTypographySignals < 5)
  );
}

function hasUniformPrimarySectionStyling(html: string) {
  const text = String(html || "");
  const groupedUniformPanelRule = /\.(?:hero(?:-copy|-proof)?|band|details|booking|faq|fit-grid)(?:\s*,\s*\.(?:hero(?:-copy|-proof)?|band|details|booking|faq|fit-grid)){2,}\s*\{[^}]*background\s*:\s*(?:var\(--panel\)|rgba\([^)]*0\.8[^)]*\)|rgba\([^)]*0\.9[^)]*\))[^}]*\}/i.test(text);
  const repeatedPanelBackgrounds = countPatternMatches(text, /background\s*:\s*var\(--panel\)\s*[;}]/gi);
  const repeatedSharedContainers = countPatternMatches(text, /<(section|div)\b[^>]*(class|id)=['"][^'"]*(hero|band|details|booking|faq|fit-grid)[^'"]*['"][^>]*>/gi);
  const distinctContrastBeats =
    countPatternMatches(text, /linear-gradient\(/gi) +
    countPatternMatches(text, /background\s*:\s*#(?:0[0-9a-f]{2}|1[0-9a-f]{2}|2[0-9a-f]{2})/gi) +
    countPatternMatches(text, /rgba\([^)]*0\.[3-9]/gi);

  return groupedUniformPanelRule || (repeatedSharedContainers >= 4 && repeatedPanelBackgrounds >= 3 && distinctContrastBeats < 2);
}

function hasOverstyledVisualSystem(html: string) {
  const text = String(html || "");
  const gradientSignals = countPatternMatches(text, /(linear-gradient\(|radial-gradient\()/gi);
  const shadowSignals = countPatternMatches(text, /box-shadow\s*:/gi);
  const roundedSignals = countPatternMatches(text, /border-radius\s*:\s*(?:999px|2[4-9]px|[3-9]\dpx)/gi);
  const panelSignals = countPatternMatches(text, /(class|id)=["'][^"']*(panel|card|band|hero-proof|fit-card|booking-panel)[^"']*["']/gi);
  const centeredShellSignals = countPatternMatches(text, /text-align\s*:\s*center/gi);

  return gradientSignals >= 8 && shadowSignals >= 10 && roundedSignals >= 10 && panelSignals >= 6 && centeredShellSignals >= 2;
}

function analyzeSpatialDiscipline(html: string) {
  const text = String(html || "");
  const horizontalBleedSignals =
    countPatternMatches(text, /(?:^|[;{\s])(width|min-width)\s*:\s*(?:1\d{2,}vw|calc\([^)]*100%[^)]*\+\s*(?:[1-9]\d|[2-9])px\)|(?:[2-9]\d{3,}|1\d{4,})px)/gi) +
    countPatternMatches(text, /margin-(left|right)\s*:\s*-\d+/gi) +
    countPatternMatches(text, /(?:left|right)\s*:\s*-\d+px/gi) +
    countPatternMatches(text, /transform\s*:\s*translate(?:x|3d)?\(\s*-?(?:[4-9]\d|1\d{2,})px/gi);
  const overlapSignals =
    countPatternMatches(text, /position\s*:\s*(?:absolute|fixed)/gi) +
    countPatternMatches(text, /z-index\s*:\s*(?:[2-9]\d|1\d{2,})/gi);
  const nowrapSignals = countPatternMatches(text, /white-space\s*:\s*nowrap/gi);
  const clampSignals =
    countPatternMatches(text, /max-width\s*:\s*(?:min\(|clamp\(|(?:28|32|36|40|44|48|52|56|60)rem|100%)/gi) +
    countPatternMatches(text, /overflow-wrap\s*:\s*anywhere/gi) +
    countPatternMatches(text, /word-break\s*:\s*break-word/gi);
  const paddingSignals = countPatternMatches(text, /padding\s*:\s*(?:1[2-9]|[2-9]\d)px/gi);

  return {
    horizontalBleedSignals,
    overlapSignals,
    nowrapSignals,
    clampSignals,
    paddingSignals,
    hasBleedRisk: horizontalBleedSignals >= 1,
    hasOverlapRisk: overlapSignals >= 5 && clampSignals < 4,
    hasTextClampRisk: nowrapSignals >= 1 || clampSignals < 3 || paddingSignals < 4,
  };
}

function requestAllowsMultipleBookingMounts(prompt: string, sectionPlan?: string | null) {
  const text = `${String(prompt || "")}\n${String(sectionPlan || "")}`;
  return /\b(?:two|2|multiple|multi|dual)\s+(?:booking|calendar|scheduler|scheduling|slot|slots|handoff|handoffs)\b/i.test(text)
    || /\b(?:secondary|fallback|backup)\s+(?:booking|calendar|scheduler|slot)\b/i.test(text)
    || /\bcompare\s+(?:booking|calendar|scheduler|slots?)\b/i.test(text);
}

function assessGeneratedPageQuality(
  html: string,
  input: {
    pageType: string;
    primaryCta?: string | null;
    sectionPlan?: string | null;
    proofModel?: string | null;
    allowMultipleBookingMounts?: boolean;
  },
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
  const bookingRuntimeMountCount = countPatternMatches(bodyHtml, /\bdata-pa-booking-runtime=["'][^"']+["']/gi);
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
  const strongImmediateProofResolved = hasStrongProofSurface(immediateCtaWindow);
  const strongBookingProofResolved = hasStrongProofSurface(bookingWindow);
  const genericVisualSystem = hasGenericVisualSystem(html);
  const overstyledVisualSystem = hasOverstyledVisualSystem(html);
  const uniformPrimarySectionStyling = hasUniformPrimarySectionStyling(html);
  const usesOverfamiliarAiFontPair = /font-family\s*:\s*['"]?inter['"]?/i.test(html) && /font-family\s*:\s*['"]?space grotesk['"]?/i.test(html);
  const hasBasicSplitHeroShell = /grid-template-columns\s*:\s*1fr\s+1fr/i.test(html) && /class=["'][^"']*hero[^"']*["']/i.test(html);
  const sceneQuality = analyzeGeneratedSceneQuality(html, input);
  const spatialDiscipline = analyzeSpatialDiscipline(html);
  const placeholderAssetSignals =
    /<(img|source)\b[^>]*(src|srcset)=['"][^'"]*(?:hero-image|placeholder|stock-photo|dummy-image|your-image|replace-me)[^'"]*['"]/i.test(html) ||
    /<meta\b[^>]*content=['"][^'"]*(?:hero-image|placeholder|stock-photo|dummy-image|your-image|replace-me)[^'"]*['"]/i.test(html) ||
    /<(img|source)\b[^>]*(alt|aria-label)=['"][^'"]*(?:placeholder image|stock photo|dummy image|replace me|hero image goes here)[^'"]*['"]/i.test(html) ||
    /url\((['"]?)(?:https?:\/\/[^)'"\s]+\/)?(?:hero-image|placeholder|stock-photo|dummy-image|your-image|replace-me)[^)'"\s]*\1\)/i.test(html) ||
    /\b(?:placeholder image|stock photo|dummy image|replace me image|hero image goes here)\b/i.test(text);
  const webinarSignals = /\b(webinar|register|registration|reserve your seat|save your seat|join the session|join us live)\b/i.test(text);
  const agendaSignals = /\b(agenda|what you'll learn|what you will learn|what we'?ll cover|what we will cover|speaker|host|session breakdown)\b/i.test(text);
  const wrongDomainSignals = /\b(funeral|memorial|obituary|obituaries|cremation|cemetery|burial|grief|grieving|graveside|hospice|remembrance)\b/i.test(text);
  const genericEnterpriseCopySignals =
    countPatternMatches(text, /\b(transform your operations|elevate your business efficiency|tailored automation strategy|streamline your operations|unlock efficiency|optimize your business)\b/gi) +
    countPatternMatches(text, /\b(your trusted partner in automation strategy|your queries answered|have questions\? we've got answers)\b/gi);
  const genericConsultationShellSignals =
    countPatternMatches(
      text,
      /\b(book your consultation|book your automation consultation|why book this consultation|why choose this session|what you'll gain|outcome focus|trust and transparency|ready to take action|a premium session designed to clarify your automation decisions|our premium session is designed to clarify your automation decisions|expect a clear, structured session that addresses your automation needs|your path to clarity starts here)\b/gi,
    ) +
    countPatternMatches(text, /\b(best for:\s*teams deciding on their automation priorities|a clearer recommendation and next steps|proof is provided beside the ask for reassurance)\b/gi);
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
  const textSlabSectionCount = countTextSlabSections(bodyHtml);
  const weakStandaloneCtaBand = hasWeakStandaloneCtaBand(bodyHtml);
  const bookingCtaAudit = input.pageType === "booking" ? buildBookingCtaAudit(bodyHtml) : null;

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

  if (textSlabSectionCount >= 2) {
    issues.push("Too many sections still read as plain text slabs. Convert them into stronger designed modules with clearer grouping, proof, or interaction.");
  }

  if (weakStandaloneCtaBand) {
    issues.push("The CTA treatment is still too weak or isolated. Turn the ask into a real conversion module with stronger action styling and adjacent support.");
  }

  if (spatialDiscipline.hasBleedRisk) {
    issues.push("The layout still risks horizontal bleed or container breakout. Clamp widths, remove negative-offset composition tricks, and keep text and media inside their containers at every breakpoint.");
  }

  if (spatialDiscipline.hasOverlapRisk) {
    issues.push("The page still risks overlap from absolute or fixed-position content. Keep core text, proof, and CTA content in normal flow unless a bounded container guarantees no collisions.");
  }

  if (spatialDiscipline.hasTextClampRisk) {
    issues.push("Spatial discipline is still weak. Clamp headline and body measures, add enough section padding, and let long text wrap cleanly instead of bleeding or colliding with nearby UI.");
  }

  if (
    genericVisualSystem &&
    (input.pageType === "booking" || input.pageType === "sales" || input.pageType === "lead-capture" || input.pageType === "landing" || input.pageType === "webinar")
  ) {
    issues.push("The page still reads like a generic starter template. Rebuild the visual system with stronger typography, contained sections, calmer premium surfaces, and a more intentional hero-to-proof composition.");
  }

  if (overstyledVisualSystem) {
    issues.push("The page is over-styled for its conversion job. Reduce decorative gradients, shadows, and repeated rounded panels so the hierarchy feels intentional rather than template-driven.");
  }

  if (
    genericVisualSystem &&
    textSlabSectionCount >= 2 &&
    sectionCount >= 4 &&
    countPatternMatches(bodyHtml, /<(blockquote|details|figure|img|svg|aside|article|form|iframe)\b/gi) === 0
  ) {
    issues.push("The page is still too flat and text-heavy for a finished funnel. Add real proof objects, stronger section containers, and at least one visually distinct support module before accepting it.");
  }

  if (input.pageType === "booking") {
    if (!input.allowMultipleBookingMounts && bookingRuntimeMountCount > 1) {
      issues.push("Normal booking pages should use one dominant scheduler. Replace extra full booking widgets with a quieter fallback CTA or a jump back to the main booking section.");
    }
    if (majorSectionCount < 3 && !hasDedicatedMidPageSupportBeat) {
      issues.push("Booking pages need more than a hero and booking block. Add a real middle support beat for fit, process, outcomes, or proof before the handoff.");
    }
    if (hasCenteredSingleColumnBookingHero) {
      issues.push("Booking pages should not rely on a centered single-column hero shell. Use a stronger decision cluster with an attached proof panel or split composition tied to the booking CTA.");
    }
    if (/<(section|div|header)\b[^>]*(class|id)=["'][^"']*hero[^"']*["'][^>]*>/i.test(html) && /text-align\s*:\s*center/i.test(html) && /max-width\s*:\s*(?:720|760|800|840|880)px\s*[;}]/i.test(html)) {
      issues.push("Booking pages should not rely on a centered single-column hero card. Use a stronger decision cluster with adjacent proof or a split composition tied to the booking CTA.");
    }
    if (uniformPrimarySectionStyling) {
      issues.push("The page still styles too many primary sections at the same visual temperature. Add stronger section contrast, at least one distinct beat, and clearer rhythm so the scroll path does not read as one continuous panel stack.");
    }
    if (!bookingSignals || (!bookingHref && !bookingAnchor && ctaLinkCount < 2)) {
      issues.push("Booking pages need a clear scheduling path with real booking CTA treatment, not generic buttons.");
    }
    if (!proofSignals) {
      issues.push("Booking pages need proof near the conversion path so the visitor trusts the handoff.");
    } else if (!immediateProofResolved) {
      issues.push("Booking pages need a trust cue directly adjacent to the first serious CTA, not just somewhere else in the opening layout.");
    } else if (!strongImmediateProofResolved) {
      issues.push("The first CTA still lacks a visibly strong proof module. Attach a compact testimonial, outcomes stack, or proof rail directly to the hero booking cluster.");
    } else if (!openingProofResolved || !bookingProofResolved) {
      issues.push("Booking pages need proof staged beside the first CTA and again near the scheduling handoff, not scattered far away.");
    } else if (!strongBookingProofResolved) {
      issues.push("The booking handoff still needs a stronger proof or reassurance module attached to the scheduling ask.");
    }
    if (openingActionCount > 1 && /see how|learn more|view details|explore|details/i.test(openingSlice)) {
      issues.push("CTA dominance is diluted in the first screen. Keep one dominant above-the-fold action and demote or remove secondary prompts.");
    }
    if (bookingCtaAudit && bookingCtaAudit.bookingActionLabels >= 1 && !bookingCtaAudit.primaryDominanceLikely) {
      issues.push("The primary CTA is present, but it still lacks a clearly dominant treatment. Give the main booking ask stronger contrast, size, or containment than anything around it.");
    }
    if (bookingCtaAudit && bookingCtaAudit.openingActions >= 2 && bookingCtaAudit.competingActionLabels >= 1) {
      issues.push("The first screen is splitting attention across multiple actions. Demote exploratory links so the booking CTA remains the obvious next step.");
    }
    if (genericEnterpriseCopySignals >= 2) {
      issues.push("The page still leans on generic enterprise filler instead of specific stakes, outcomes, and offer language for this booking flow.");
    }
    if (
      genericConsultationShellSignals >= 2 ||
      (/<h1\b[^>]*>\s*book\s+(?:your\s+)?consultation\s*<\/h1>/i.test(html) && genericConsultationShellSignals >= 1)
    ) {
      issues.push("The page still reads like a generic consultation shell. Replace stock headings and canned benefit labels with business-specific promise, stakes, and proof language.");
    }
    if (usesOverfamiliarAiFontPair && (hasBasicSplitHeroShell || genericConsultationShellSignals >= 1)) {
      issues.push("The page still reads like a familiar AI booking mockup. Replace the Inter/Space Grotesk shell with a more intentional visual direction and stronger section styling.");
    }
    if (usesOverfamiliarAiFontPair) {
      issues.push("The page still leans on the overused Inter/Space Grotesk pairing instead of a visual direction chosen for this offer.");
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
  wantsPricing: boolean;
  wantsTestimonialGrid: boolean;
  wantsSyncedReviews: boolean;
  any: boolean;
} {
  const s = String(text || "").toLowerCase();
  const embedVerb = /(add|insert|embed|connect|wire|hook up|place|drop in|include|use my|set up|attach)/;
  const shopNoun = /(shop|store|product|products|buy now|buy\b|cart|checkout|stripe|payment link|price id)/;
  const calendarNoun = /(calendar|scheduler|schedule|appointment|booking widget|booking calendar|calendar embed|book a meeting|book a call)/;
  const chatbotNoun = /(chatbot|chat bot|live chat|website chat|chat widget)/;
  const pricingSurface = /\b(pricing (section|grid|cards?|table)|plan comparison|pricing tiers?|plans? section|packages? section)\b/;
  const testimonialSurface = /\b(testimonials? (section|grid|cards?)|social proof section|proof section|case stud(?:y|ies) section)\b/;
  const syncedReviewSurface = /\b(synced reviews?|live reviews?|real reviews?|reviews? (section|block|feed|grid)|customer reviews? section)\b/;
  const designLedCue = /\b(design|redesign|restyle|style|styling|visual|layout|look|feel|vibe|tone|premium|polished|unique|brand|art direction|concept|hero)\b/;
  const removeVerb = /(remove|strip|delete|drop|cut|eliminate|without|avoid|not|no)/;
  const negativeCommerceCue = new RegExp(
    String.raw`\b(?:not\s+a|not\s+an|not|no|without|remove|strip|delete|drop|cut|eliminate|avoid|stop)\b[^.]{0,80}\b(?:shop|store|cart|checkout|purchase|buy\s*now|buy-now|add\s*to\s*cart|add-to-cart|payment\s+link|stripe\s+checkout)\b`,
  ).test(s);
  const negativeCalendarCue = new RegExp(
    String.raw`\b(?:remove|strip|delete|drop|cut|eliminate|avoid)\b[^.]{0,80}\b(?:calendar|scheduler|booking\s+calendar|booking\s+widget|booking|appointment)\b`,
  ).test(s);
  const pricingOnly = /\bpricing\b/.test(s) && !shopNoun.test(s.replace(/pricing/g, ""));
  const wantsShop = !negativeCommerceCue && !pricingOnly && ((embedVerb.test(s) && shopNoun.test(s)) || /\b(add to cart|checkout|payment link|stripe checkout)\b/.test(s));
  const wantsCart = !negativeCommerceCue && /\b(add to cart|cart)\b/.test(s) && (embedVerb.test(s) || /\bcheckout\b/.test(s));
  const wantsCheckout = !negativeCommerceCue && /\b(checkout|purchase|pay now|stripe checkout)\b/.test(s) && (embedVerb.test(s) || /\bstripe\b/.test(s));
  const wantsCalendar = !negativeCalendarCue && ((embedVerb.test(s) && calendarNoun.test(s)) || /\bembed my calendar\b/.test(s));
  const wantsChatbot = (embedVerb.test(s) && chatbotNoun.test(s)) || /\bembed my chatbot\b/.test(s);
  const wantsPricing = pricingSurface.test(s) || (embedVerb.test(s) && /\bpricing\b/.test(s) && /\b(section|grid|cards?|table|plans?)\b/.test(s));
  const wantsTestimonialGrid = testimonialSurface.test(s) || (embedVerb.test(s) && /\btestimonials?\b/.test(s));
  const wantsSyncedReviews = syncedReviewSurface.test(s) || (embedVerb.test(s) && /\breviews?\b/.test(s));
  const explicitRuntimeOnlyCue =
    /\b(?:just|only|simply)\s+(?:add|insert|embed|connect|wire|hook up|place|drop in|include|use|set up|attach)\b/.test(s) ||
    /\bdirectly\s+(?:add|insert|embed|connect|wire|attach|place|drop in)\b/.test(s) ||
    (removeVerb.test(s) && !designLedCue.test(s) && /(calendar|chatbot|checkout|cart|shop)/.test(s) && embedVerb.test(s));
  const designLedRequest = designLedCue.test(s) && !explicitRuntimeOnlyCue;
  const any = !designLedRequest && (wantsShop || wantsCart || wantsCheckout || wantsCalendar || wantsChatbot || wantsPricing || wantsTestimonialGrid || wantsSyncedReviews);
  return { wantsShop, wantsCart, wantsCheckout, wantsCalendar, wantsChatbot, wantsPricing, wantsTestimonialGrid, wantsSyncedReviews, any };
}

function resolveInteractiveIntentForPage(
  intent: ReturnType<typeof detectInteractiveIntent>,
  opts: {
    prompt: string;
    pageType?: string | null;
    formStrategy?: string | null;
    primaryCta?: string | null;
  },
): ReturnType<typeof detectInteractiveIntent> {
  const bookingFirst =
    opts.pageType === "booking" ||
    opts.formStrategy === "booking" ||
    /\b(book|booking|schedule|call|consult|consultation|appointment|demo)\b/i.test(String(opts.primaryCta || ""));

  if (!bookingFirst) return intent;

  const next = {
    ...intent,
    wantsShop: false,
    wantsCart: false,
    wantsCheckout: false,
  };

  return {
    ...next,
    any:
      next.wantsCalendar ||
      next.wantsChatbot ||
      next.wantsPricing ||
      next.wantsTestimonialGrid ||
      next.wantsSyncedReviews,
  };
}

function joinHumanList(items: string[]): string {
  const filtered = Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, and ${filtered[filtered.length - 1]}`;
}

function formatMoneyLabel(unitAmount: number | null, currency: string): string {
  if (typeof unitAmount !== "number" || !Number.isFinite(unitAmount)) return "Custom quote";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency || "usd").toUpperCase(),
      maximumFractionDigits: unitAmount % 100 === 0 ? 0 : 2,
    }).format(unitAmount / 100);
  } catch {
    return `$${(unitAmount / 100).toFixed(unitAmount % 100 === 0 ? 0 : 2)}`;
  }
}

function buildInteractiveHeroText(intent: ReturnType<typeof detectInteractiveIntent>): string {
  const actions: string[] = [];
  if (intent.wantsPricing) actions.push("compare the offer clearly");
  if (intent.wantsTestimonialGrid) actions.push("scan curated proof");
  if (intent.wantsSyncedReviews) actions.push("see live customer reviews");
  if (intent.wantsShop || intent.wantsCart || intent.wantsCheckout) actions.push("browse the offer and checkout securely");
  if (intent.wantsCalendar) actions.push("book a time to talk");
  if (intent.wantsChatbot) actions.push("start a conversation without leaving the page");
  if (!actions.length) return "Use this page to move visitors from interest to a clear next step.";
  return `Use this page to ${joinHumanList(actions)}.`;
}

function buildPricingGridItems(
  stripeProducts: Array<{
  id: string;
  name: string;
  description: string | null;
  images: string[];
  defaultPriceId: string;
  unitAmount: number | null;
  currency: string;
  }>,
  opts?: { commerceMode?: boolean; consultationMode?: boolean },
): Array<Record<string, unknown>> {
  const commerceMode = opts?.commerceMode === true;
  const consultationMode = opts?.consultationMode === true;
  const realProducts = stripeProducts
    .filter((product) => product && product.defaultPriceId)
    .slice(0, 3)
    .map((product, index) => ({
      name: product.name,
      price: formatMoneyLabel(product.unitAmount, product.currency),
      ...(product.description ? { description: String(product.description).slice(0, 220) } : {}),
      ...(index === 1 ? { badge: "Most chosen", featured: true } : {}),
      priceId: product.defaultPriceId,
      ctaText: "Checkout",
      ctaMode: "checkout",
      features: [
        "Live product and price data from Stripe",
        "Built for direct purchase without extra qualification",
        "Checkout can happen from this section",
      ],
    }));

  if (commerceMode && realProducts.length) return realProducts;

  return [
    {
      name: "Intro",
      price: "Custom quote",
      description: "Use this card for the lightest engagement, entry package, or first step when the exact commercial detail is still evolving.",
      ctaText: consultationMode ? "Book intro call" : "See details",
      ctaHref: consultationMode ? "#booking" : "#contact",
      features: ["Best for lighter scope", "Keeps the next step low-friction"],
    },
    {
      name: "Core package",
      price: "Custom quote",
      description: "Use this card for the main package, service tier, or transformation path you want most qualified buyers to consider.",
      badge: "Best fit",
      featured: true,
      ctaText: consultationMode ? "Book strategy call" : "See what is included",
      ctaHref: consultationMode ? "#booking" : "#contact",
      features: ["Built for the main buyer path", "Best place to explain scope and outcome"],
    },
    {
      name: "Custom scope",
      price: "Let’s scope it",
      description: "Use this card for buyers who need a tailored package, larger rollout, or a consultation before the exact package is defined.",
      ctaText: "Talk it through",
      ctaHref: consultationMode ? "#booking" : "#contact",
      features: ["Flexible scope", "Best for custom requirements"],
    },
  ];
}

function buildTestimonialGridItems(): Array<Record<string, unknown>> {
  return [
    {
      outcome: "Approved proof",
      quote: "Replace this card with a concise client quote that names the result, the relief, or the reason this offer felt worth acting on.",
      name: "Recent client",
      role: "Replace with the customer role or business type",
    },
    {
      outcome: "Decision confidence",
      quote: "Use one quote that reduces hesitation and one that reinforces why choosing now made sense.",
      name: "Verified customer",
      role: "Replace with approved attribution",
    },
  ];
}

function blockTreeHasType(blocks: CreditFunnelBlock[], predicate: (block: CreditFunnelBlock) => boolean): boolean {
  const walk = (arr: CreditFunnelBlock[]): boolean => {
    for (const block of arr) {
      if (!block || typeof block !== "object") continue;
      if (predicate(block)) return true;
      if (block.type === "section") {
        const props: any = block.props as any;
        if (walk(Array.isArray(props?.children) ? props.children : [])) return true;
        if (walk(Array.isArray(props?.leftChildren) ? props.leftChildren : [])) return true;
        if (walk(Array.isArray(props?.rightChildren) ? props.rightChildren : [])) return true;
      }
      if (block.type === "columns") {
        const cols: any[] = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as any[]) : [];
        for (const col of cols) {
          if (walk(Array.isArray((col as any)?.children) ? (col as any).children : [])) return true;
        }
      }
    }
    return false;
  };

  return walk(blocks);
}

function buildInteractiveAssistantSummary(blocks: CreditFunnelBlock[]): string {
  const families: string[] = [];
  if (blockTreeHasType(blocks, (block) => block.type === "testimonialGrid")) families.push("a testimonial grid");
  if (blockTreeHasType(blocks, (block) => block.type === "syncedReviews")) families.push("synced reviews");
  if (blockTreeHasType(blocks, (block) => block.type === "pricingGrid")) families.push("package cards");
  if (blockTreeHasType(blocks, (block) => block.type === "calendarEmbed")) families.push("a booking calendar");
  if (blockTreeHasType(blocks, (block) => block.type === "chatbot")) families.push("a chatbot");
  if (blockTreeHasType(blocks, (block) => block.type === "addToCartButton" || block.type === "salesCheckoutButton" || block.type === "cartButton")) {
    families.push("shop and checkout controls");
  }

  const describedFamilies = joinHumanList(families);
  if (!describedFamilies) {
    return "Done. I inserted working Funnel Builder blocks and kept the current page draft aligned for preview, editing, and hosted output.";
  }

  return `Done. I inserted ${describedFamilies} as real Funnel Builder blocks and kept the current page draft aligned for preview, editing, and hosted output.`;
}

function buildDynamicFunnelRuntimeBlock(input: {
  intentProfile: {
    pageType: string;
    primaryCta: string;
    formStrategy: string;
    qualificationFields: string;
    routingDestination: string;
    conditionalLogic: string;
    taggingPlan: string;
    automationPlan: string;
  };
  funnelBrief: {
    integrationPlan?: string;
  } | null;
  hasStripeProducts: boolean;
  hasBookingRuntime: boolean;
}) {
  const lines = [
    "DYNAMIC_FUNNEL_RUNTIME:",
    `- Page type: ${input.intentProfile.pageType || "landing"}`,
    `- Primary CTA: ${input.intentProfile.primaryCta || "not provided"}`,
    `- Form strategy: ${input.intentProfile.formStrategy || "none"}`,
    input.intentProfile.qualificationFields ? `- Qualification or intake details: ${input.intentProfile.qualificationFields}` : "",
    input.intentProfile.routingDestination ? `- Routing destination: ${input.intentProfile.routingDestination}` : "",
    input.intentProfile.conditionalLogic ? `- Conditional logic: ${input.intentProfile.conditionalLogic}` : "",
    input.intentProfile.taggingPlan ? `- Tagging plan: ${input.intentProfile.taggingPlan}` : "",
    input.intentProfile.automationPlan ? `- Automation handoff: ${input.intentProfile.automationPlan}` : "",
    input.funnelBrief?.integrationPlan ? `- Integration plan: ${input.funnelBrief.integrationPlan}` : "",
    input.intentProfile.routingDestination
      ? "- The page should explicitly support the next step instead of ending in a generic CTA. The visible path should make sense for that routing destination."
      : "",
    input.intentProfile.qualificationFields
      ? "- If the page qualifies or screens leads, reflect that in the copy, field framing, or booking expectations. Do not pretend the flow is simpler than it is."
      : "",
    input.intentProfile.conditionalLogic
      ? "- Convert conditional logic into visible user guidance, branch-aware copy, or section logic. Do not leave routing rules as hidden planning notes."
      : "",
    input.intentProfile.taggingPlan || input.intentProfile.automationPlan
      ? "- The conversion step should read like it belongs to a real backend flow: the CTA, form, or booking handoff should naturally feed the stated tagging and automation behavior."
      : "",
    input.hasStripeProducts
      ? "- If pricing or checkout is shown, use the connected product and price data precisely. Do not invent alternate amounts or fake package pricing that disagrees with live Stripe data."
      : "- If live pricing data is not connected, do not invent exact prices. Use truthful offer labels such as Custom quote, Consultation, or tailored plan instead.",
    input.hasBookingRuntime
      ? "- A real booking runtime exists. If this is a booking page, use that live handoff rather than a generic contact or learn-more button."
      : "",
  ];

  return lines.filter(Boolean).join("\n");
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
  planAdherenceIssues?: string[] | null;
  run?: {
    plannedMinSteps: number;
    plannedMaxSteps: number;
    executedSteps: number;
    creditsCharged: number;
    creditsRemaining: number | null;
    stopReason: "completed" | "question-returned" | "credit-limit-hit" | "ai-step-failed" | "quality-check-failed";
    usedPromptSynthesis: boolean;
    usedGenerationPlan: boolean;
    usedRepair: boolean;
    usedFocusedBookingRepair: boolean;
    usedRescueRedesign: boolean;
    usedFallback: boolean;
    steps: Array<{
      label: string;
      status: "completed" | "blocked" | "failed";
      creditsCharged: number;
      durationMs: number;
      notes?: string;
    }>;
  } | null;
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

  if (opts.run?.stopReason === "credit-limit-hit") {
    warnings.push("AI iteration stopped when this run hit the available credit budget.");
  }

  if (opts.run?.usedFallback) {
    warnings.push("A deterministic fallback shell was used after the AI passes did not meet quality checks.");
  }

  if (opts.planAdherenceIssues?.length) {
    warnings.push(...opts.planAdherenceIssues.slice(0, 2));
  }

  const fallbackSummary =
    opts.mode === "question"
      ? "AI needs one missing detail before it can safely change the page."
      : opts.mode === "interactive-blocks"
        ? "Inserted working builder blocks for the requested interactive features and kept the current page draft aligned."
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
    ...(opts.run ? { run: opts.run } : {}),
  };
}

class AiRunCreditError extends Error {
  stepLabel: string;
  creditsRemaining: number;

  constructor(stepLabel: string, creditsRemaining: number) {
    super(`Insufficient credits for ${stepLabel}.`);
    this.name = "AiRunCreditError";
    this.stepLabel = stepLabel;
    this.creditsRemaining = creditsRemaining;
  }
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
  const commerceMode = Boolean(opts.intent.wantsShop || opts.intent.wantsCart || opts.intent.wantsCheckout);
  const consultationMode = Boolean(opts.intent.wantsCalendar && !commerceMode);
  const heroChildren: CreditFunnelBlock[] = [
    {
      id: newBlockId("h1"),
      type: "heading",
      props: { text: opts.pageTitle || opts.funnelName || "Welcome", level: 1 },
    },
    {
      id: newBlockId("p"),
      type: "paragraph",
      props: {
        text: buildInteractiveHeroText(opts.intent),
      },
    },
  ];

  if (opts.intent.wantsShop || opts.intent.wantsCart || opts.intent.wantsCheckout) {
    heroChildren.push({
      id: newBlockId("cart"),
      type: "cartButton",
      props: { text: "Cart" },
    });
  }

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
      children: heroChildren,
    },
  });

  if (opts.intent.wantsSyncedReviews) {
    blocks.push({
      id: newBlockId("reviews"),
      type: "syncedReviews",
      props: {
        eyebrow: "Live proof",
        heading: "What recent customers are saying",
        intro: "This section stays connected to your reviews inbox so the page can keep pulling in fresh proof without manually rebuilding cards.",
        limit: 6,
        minRating: 4,
        columns: 3,
        showBusinessReply: true,
        includePhotos: false,
      },
    });
  }

  if (opts.intent.wantsTestimonialGrid) {
    const items = buildTestimonialGridItems();
    blocks.push({
      id: newBlockId("testimonials"),
      type: "testimonialGrid",
      props: {
        eyebrow: "Proof",
        heading: "Curated client proof",
        intro: "Use these cards for approved quotes that remove hesitation and reinforce why this offer is worth acting on now.",
        columns: items.length >= 3 ? 3 : items.length === 2 ? 2 : 1,
        items: items as any,
      },
    });
  }

  if (opts.intent.wantsPricing) {
    const pricingItems = buildPricingGridItems(opts.stripeProducts, { commerceMode, consultationMode });
    blocks.push({
      id: newBlockId("pricing"),
      type: "pricingGrid",
      props: {
        eyebrow: commerceMode ? "Pricing" : "Packages",
        heading: "Choose the right fit",
        intro: commerceMode
          ? "Use this section to compare plans before visitors drop into checkout."
          : consultationMode
            ? "Use this section to compare package paths, then move qualified visitors into the booking step below without forcing store or checkout posture."
            : "Use this section to compare packages, explain fit, and point people to the right next step without forcing checkout posture.",
        columns: pricingItems.length >= 3 ? 3 : pricingItems.length === 2 ? 2 : 1,
        items: pricingItems as any,
      },
    });
  }

  if (commerceMode) {
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
        anchorId: "booking",
        anchorLabel: "Book a time",
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
        return why ? `**${section}**: ${what} - ${why}` : `**${section}**: ${what}`;
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

async function generatePageUpdatedAssistantText(opts: { pageTitle?: string; funnelName?: string; prompt?: string; changelog?: Record<string, unknown> | null }) {
  const pageTitle = String(opts.pageTitle || "").trim().slice(0, 160) || null;
  const funnelName = String(opts.funnelName || "").trim().slice(0, 160) || null;
  const userPrompt = String(opts.prompt || "").trim().slice(0, 400) || null;
  const changelogSummary = opts.changelog && typeof opts.changelog.summary === "string" ? String(opts.changelog.summary).trim().slice(0, 400) : null;

  const system =
    "You are Pura, an AI design partner inside a funnel builder. The page was just rebuilt. Write a short 2-3 sentence summary of what changed and what the user should check next in preview. Be specific - reference what was actually done (from the context below). Do not use bullet points. Do not start with 'I'. Do not use filler phrases like 'Great news' or 'Sure thing'. Sound like a competent colleague, not a chatbot.";

  const context = [
    funnelName ? `Funnel: ${funnelName}` : null,
    pageTitle ? `Page: ${pageTitle}` : null,
    userPrompt ? `User's request: ${userPrompt}` : null,
    changelogSummary ? `What was changed: ${changelogSummary}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    return String(await generateText({ system, user: context || "Page was updated." })).trim();
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
  const requestedPrimaryCtaCopy = extractPrimaryCtaCopyEditRequest(prompt);
  const displayPrompt = typeof body?.displayPrompt === "string" ? body.displayPrompt.trim().slice(0, 4000) : "";
  const threadPrompt = displayPrompt || prompt;
  const preservedSourceActionPlan = sanitizeSourceActionPlan(body?.sourceActionPlan);
  let effectiveSourceActionPlan: SourceActionPlan | null = preservedSourceActionPlan;

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
  const designContext = sanitizeFunnelDesignContext(body?.designContext);
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
  const [resolvedSettings, businessContext, resolvedBookingCalendars, bookingSite] = await Promise.all([
    settingsPromise,
    businessContextPromise,
    bookingCalendarsPromise,
    bookingSitePromise,
  ]);
  let settings = resolvedSettings;
  let bookingCalendars = resolvedBookingCalendars;
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
    audience: effectiveIntentProfile.audience,
    offer: effectiveIntentProfile.offer,
    companyContext: effectiveIntentProfile.companyContext || effectiveFunnelBrief?.companyContext || null,
    pageGoal: effectiveIntentProfile.pageGoal,
    primaryCta: effectiveIntentProfile.primaryCta,
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
  const interactiveIntent = detectInteractiveIntent(prompt);
  let automaticCalendarProvisionError: string | null = null;
  const shouldProvisionFunnelCalendar =
    interactiveIntent.wantsCalendar || effectiveIntentProfile.pageType === "booking" || effectiveIntentProfile.formStrategy === "booking";
  if (shouldProvisionFunnelCalendar) {
    const ensuredCalendar = await ensureFunnelBookingCalendar({
      ownerId,
      funnelId: normalizedPage.funnel.id,
      funnelName: normalizedPage.funnel.name,
      pageTitle: normalizedPage.title,
    });
    if (ensuredCalendar.ok) {
      bookingCalendars = ensuredCalendar.config;
      settings = writeFunnelBookingRouting(settings ?? null, funnelId, { calendarId: ensuredCalendar.calendar.id });
    } else {
      automaticCalendarProvisionError = ensuredCalendar.error;
    }
  }
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
  const exportedCurrentHtmlFromBlocks =
    !currentHtmlFromClient &&
    normalizedPage.editorMode === "BLOCKS" &&
    Array.isArray(normalizedPage.blocksJson) &&
    normalizedPage.blocksJson.length
      ? blocksToCustomHtmlDocument({
          blocks: normalizedPage.blocksJson as any,
          pageId: normalizedPage.id,
          ownerId,
          bookingSiteSlug: bookingSiteSlug || undefined,
          defaultBookingCalendarId: defaultBookingCalendarId || undefined,
          basePath,
          title: normalizedPage.title || normalizedPage.funnel.name || "Funnel page",
        })
      : "";
  const effectiveCurrentHtml =
    (currentHtmlFromClient && currentHtmlFromClient.trim() ? currentHtmlFromClient : exportedCurrentHtmlFromBlocks || getFunnelPageCurrentHtml(page)).trim();
  const isPrimaryCtaCopyEdit = Boolean(requestedPrimaryCtaCopy && effectiveCurrentHtml);
  const wantsDesignRedesign = /\b(header area|header|nav area|navigation|hero area|hero|above the fold|top of page|proof strip|credibility strip|benefits?|testimonials?|cta|call to action|layout|redesign|premium|modern|landing page|sales page|font|fonts|typography|vibe|vibes|mood|art direction|editorial|serif|sans)\b/i.test(prompt);
  const explicitStructuralRebuild = /\b(rebuild|start over|from scratch|replace the whole page|replace the layout|new layout|different layout|new structure|restructure|overhaul)\b/i.test(prompt);
  const allowsStructuralRebuild = !effectiveCurrentHtml || wasBlocksExport || wantsDesignRedesign || explicitStructuralRebuild;
  const prevChat = stripFunnelPageIntentMessages<Record<string, unknown>>(normalizedPage.customChatJson);
  const aiHistory = buildCondensedAiHistory(prevChat);
  const recentIterationNotes = buildRecentIterationNotes(prevChat);

  const aiRun = {
    plannedMinSteps: 2,
    plannedMaxSteps: effectiveIntentProfile.pageType === "booking" ? 6 : 5,
    executedSteps: 0,
    creditsCharged: 0,
    creditsRemaining: null as number | null,
    stopReason: "completed" as "completed" | "question-returned" | "credit-limit-hit" | "ai-step-failed" | "quality-check-failed",
    usedPromptSynthesis: false,
    usedGenerationPlan: false,
    usedRepair: false,
    usedFocusedBookingRepair: false,
    usedRescueRedesign: false,
    usedFallback: false,
    steps: [] as Array<{
      label: string;
      status: "completed" | "blocked" | "failed";
      creditsCharged: number;
      durationMs: number;
      notes?: string;
    }>,
  };

  const trackAiStep = async (
    label: string,
    runner: () => Promise<string>,
    opts: { optional?: boolean; onSuccess?: () => void } = {},
  ) => {
    const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.aiCallStepGenerate);
    if (!charged.ok) {
      aiRun.creditsRemaining = charged.state.balance;
      aiRun.stopReason = "credit-limit-hit";
      aiRun.steps.push({
        label,
        status: "blocked",
        creditsCharged: 0,
        durationMs: 0,
        notes: "Insufficient credits for this AI step.",
      });
      if (opts.optional) return null;
      throw new AiRunCreditError(label, charged.state.balance);
    }

    const startedAt = Date.now();
    try {
      const result = await runner();
      aiRun.executedSteps += 1;
      aiRun.creditsCharged += PORTAL_CREDIT_COSTS.aiCallStepGenerate;
      aiRun.creditsRemaining = charged.state.balance;
      aiRun.steps.push({
        label,
        status: "completed",
        creditsCharged: PORTAL_CREDIT_COSTS.aiCallStepGenerate,
        durationMs: Date.now() - startedAt,
      });
      opts.onSuccess?.();
      return result;
    } catch (error) {
      aiRun.executedSteps += 1;
      aiRun.creditsCharged += PORTAL_CREDIT_COSTS.aiCallStepGenerate;
      aiRun.creditsRemaining = charged.state.balance;
      aiRun.stopReason = "ai-step-failed";
      aiRun.steps.push({
        label,
        status: "failed",
        creditsCharged: PORTAL_CREDIT_COSTS.aiCallStepGenerate,
        durationMs: Date.now() - startedAt,
        notes: error instanceof Error ? error.message.slice(0, 180) : String(error ?? "AI step failed").slice(0, 180),
      });
      throw error;
    }
  };

  const trackRequiredAiStep = async (
    label: string,
    runner: () => Promise<string>,
    opts: { onSuccess?: () => void } = {},
  ) => {
    const result = await trackAiStep(label, runner, opts);
    if (result === null) {
      throw new AiRunCreditError(label, aiRun.creditsRemaining ?? 0);
    }
    return result;
  };

  if (isPrimaryCtaCopyEdit && requestedPrimaryCtaCopy) {
    const deterministicCtaEdit = applyDeterministicPrimaryCtaCopyEdit(effectiveCurrentHtml, requestedPrimaryCtaCopy);
    if (deterministicCtaEdit.changed) {
      const deterministicPlan: SourceActionPlan = {
        summary: `Updated the primary CTA copy to '${requestedPrimaryCtaCopy}'.`,
        moves: [
          {
            key: "cta-text",
            target: "primary CTA",
            change: `Change the primary CTA copy to '${requestedPrimaryCtaCopy}'.`,
            why: "Honor the user's narrow copy request without changing the page structure.",
            priority: "primary",
            executionMode: "bounded-edit",
            confidence: "high",
          },
        ],
        watchouts: ["Keep layout, section order, and non-CTA copy unchanged."],
      };
      effectiveSourceActionPlan = mergeSourceActionPlans(deterministicPlan, preservedSourceActionPlan) ?? deterministicPlan;
      const deterministicChangelog = {
        summary: `Updated the primary CTA copy to '${requestedPrimaryCtaCopy}'.`,
        changes: [
          {
            section: "primary CTA",
            what: `Replaced '${deterministicCtaEdit.originalLabel}' with '${requestedPrimaryCtaCopy}'.`,
            why: "To keep the edit local and preserve the current funnel structure.",
          },
        ],
        preserved: [],
        conversionNotes: [
          `Kept the existing page structure intact and updated ${deterministicCtaEdit.updatedCount} CTA instance${deterministicCtaEdit.updatedCount === 1 ? "" : "s"}.`,
        ],
      };

      const assistantMsg = {
        role: "assistant" as const,
        content: buildChangelogAssistantMessage(deterministicChangelog),
        at: new Date().toISOString(),
        sourceActionPlan: effectiveSourceActionPlan,
      };
      const userMsg = { role: "user" as const, content: threadPrompt, at: new Date().toISOString() };
      const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);
      const cleanHtml = sanitizeGeneratedHtmlLinks(normalizePortalHostedPaths(deterministicCtaEdit.html));

      aiRun.plannedMinSteps = 0;
      aiRun.plannedMaxSteps = 0;

      const updated = await prisma.creditFunnelPage.update({
        where: { id: normalizedPage.id },
        data: applyDraftHtmlWriteCompat({
          editorMode: "CUSTOM_HTML",
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
          hadCurrentHtml: true,
          wantsDesignRedesign: false,
          contextKeyCount: contextKeys.length,
          contextMediaCount: contextMedia.length,
          changelog: deterministicChangelog,
          run: aiRun,
        }),
        sourceActionPlan: effectiveSourceActionPlan,
        page: normalizedUpdated,
      });
    }
  }

  const promptStrategyPromise = synthesizeFunnelGenerationPrompt(
    {
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
      designContext,
      contextKeys,
      contextMedia,
      recentChatHistory: aiHistory,
      recentIterationMemory: recentIterationNotes,
    },
    {
      generateTextImpl: (opts) =>
        trackRequiredAiStep("Strategic prompt synthesis", () => generateText(opts), {
          onSuccess: () => {
            aiRun.usedPromptSynthesis = true;
          },
        }),
    },
  ).catch((): FunnelPromptSynthesisResult => ({
    prompt,
    usedAi: false,
    exhibitAdvisory: null,
    clarifyingQuestion: null,
    businessSpecificityScore: 0,
    contextGaps: [],
  }));

  const intent = resolveInteractiveIntentForPage(interactiveIntent, {
    prompt,
    pageType: effectiveIntentProfile.pageType,
    formStrategy: effectiveIntentProfile.formStrategy,
    primaryCta: effectiveIntentProfile.primaryCta,
  });
  if (intent.any) {
    const [promptStrategy, stripeProducts] = await Promise.all([promptStrategyPromise, stripeProductsPromise]);
    aiRun.plannedMinSteps = promptStrategy.usedAi ? 1 : 0;
    aiRun.plannedMaxSteps = promptStrategy.usedAi ? 1 : 0;
    const enabledCalendars = enabledBookingCalendars;
    const linkedCalendarId =
      selectedBookingRouting?.calendarId && enabledCalendars.some((calendar) => String(calendar?.id || "").trim() === selectedBookingRouting.calendarId)
        ? selectedBookingRouting.calendarId
        : "";
    const calendarId = linkedCalendarId.slice(0, 50);
    const calendarProvisionError: string | null = automaticCalendarProvisionError;

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
      if (missingCalendar) parts.push(calendarProvisionError === "Insufficient credits"
        ? "I can add a working booking calendar here, but this account does not have enough credits to create one right now."
        : "I can add a working booking calendar here, but automatic funnel calendar setup did not finish. Create or link one in Booking first.");
      if (missingChatbot) parts.push("I can add a working chatbot widget, but I don't see an ElevenLabs chat agent ID for this account yet. What agent ID should I use?");
      const question = parts[0] ? parts[0].slice(0, 800) : "Which interactive block should I add (shop, calendar, or chatbot)?";

      const prevChat = Array.isArray(normalizedPage.customChatJson) ? (normalizedPage.customChatJson as any[]) : [];
      const userMsg = { role: "user", content: threadPrompt, at: new Date().toISOString() };
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
          run: aiRun,
        }),
        sourceActionPlan: effectiveSourceActionPlan,
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

    const assistantSummary = buildInteractiveAssistantSummary(blocks);
    const prevChat = Array.isArray(normalizedPage.customChatJson) ? (normalizedPage.customChatJson as any[]) : [];
    const userMsg = { role: "user", content: threadPrompt, at: new Date().toISOString() };
    const assistantMsg = {
      role: "assistant",
      content: assistantSummary,
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
        changelog: { summary: assistantSummary },
        run: aiRun,
      }),
      sourceActionPlan: effectiveSourceActionPlan,
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
  if (promptStrategy.clarifyingQuestion && !intent.any) {
    const question = promptStrategy.clarifyingQuestion.slice(0, 800);
    const prevChat = Array.isArray(normalizedPage.customChatJson) ? (normalizedPage.customChatJson as any[]) : [];
    const clarificationUserMsg = { role: "user", content: threadPrompt, at: new Date().toISOString() };
    const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
    const nextChat = [...prevChat, clarificationUserMsg, assistantMsg].slice(-40);

    const updated = await prisma.creditFunnelPage.update({
      where: { id: page.id },
      data: {
        customChatJson: nextChat,
      },
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

    return NextResponse.json({
      ok: true,
      question,
      aiResult: buildAiResultMeta({
        mode: "question",
        hadCurrentHtml: Boolean(effectiveCurrentHtml),
        wantsDesignRedesign,
        contextKeyCount: contextKeys.length,
        contextMediaCount: contextMedia.length,
        run: aiRun,
      }),
      sourceActionPlan: effectiveSourceActionPlan,
      page: normalizeDraftHtml(updated),
    });
  }
  aiRun.plannedMinSteps = promptStrategy.usedAi ? 3 : 2;
  aiRun.plannedMaxSteps = (promptStrategy.usedAi ? 1 : 0) + 4 + (effectiveIntentProfile.pageType === "booking" ? 1 : 0);
  const strategicPrompt = promptStrategy.prompt;
  const exhibitPlannerContractBlock = buildExhibitPlannerContractBlock(promptStrategy.exhibitAdvisory);
  const wantsBookingPage = effectiveIntentProfile.pageType === "booking" || effectiveIntentProfile.formStrategy === "booking";
  const hasExplicitDesignDirection = hasFunnelDesignContext(designContext);
  const hasStructuredBookingDirection = Boolean(
    String(effectiveIntentProfile.shellConcept || effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || "").trim(),
  );
  const bookingFallbackFastPathEligible = wantsBookingPage
    && !currentHtmlFromClient.trim()
    && (!effectiveCurrentHtml.trim() || Boolean(exportedCurrentHtmlFromBlocks))
    && !selectedRegion
    && attachments.length === 0
    && contextMedia.length === 0
    && !intent.any
    && allowsStructuralRebuild
    && !promptStrategy.usedAi
    && !hasExplicitDesignDirection
    && !hasStructuredBookingDirection
    && prompt.split(/\s+/).filter(Boolean).length <= 32;
  const allowMultipleBookingMounts = requestAllowsMultipleBookingMounts(
    prompt,
    effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
  );
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
    "CHANGE_LOG (include only when editing an existing page - omit on first-time generation):",
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
    "- Do not default to the common Inter body + Space Grotesk heading pairing or a soft-blue split-card consultation shell. Choose a visual direction that fits the actual business, audience, and offer.",
    "- Before applying styling or Exhibit patterns, decide design intent: funnel type, audience sophistication, conversion urgency, and brand tone.",
    "- Set style intensity deliberately: low for minimal styling, medium for clean spacing with controlled accents, high only when a strong visual identity is clearly justified. Default to medium.",
    "- Set Exhibit mode deliberately: off for raw layout only, assist for selected components and section structure, full only when a full Exhibit design system is clearly justified. Default to assist.",
    "- Font selection must be intentional. Use one or two families max. Prefer Manrope, Inter, Plus Jakarta Sans, or General Sans. Only use a display serif such as Fraunces when the tone is clearly premium or editorial.",
    "- Do not apply gradients everywhere, overuse shadows, round every container, or stack repeated panels without hierarchy.",
    "- Do create contrast intentionally, vary layout structure rather than centering every section, and make the CTA visually dominant without making it decorative noise.",
    "- If the result feels generic, over-styled, or disconnected from purpose, reduce styling intensity and rebalance.",
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
    "- On standard booking pages, use one dominant booking runtime or scheduler. Do not generate a second full calendar later in the page unless the user explicitly asks for multiple booking slots or a fallback scheduler pattern.",
    "- If the page needs a later fallback beat, make it a quieter objection-handling section with a return-to-booking CTA or jump link back to the main scheduler instead of another full scheduling widget.",
    "- On booking pages, pair the first CTA with visible proof in the hero or the very next band: a testimonial excerpt, quantified result, trusted-by strip, or outcomes panel.",
    "- On booking pages, the primary CTA must be visually dominant in the first screen: use one filled high-contrast action with stronger size, containment, and spacing than any nearby link or secondary prompt.",
    "- On booking pages, do not give secondary actions the same visual weight as the booking CTA. Exploratory links should read as text-like support, not as competing buttons.",
    "- On booking pages, do not stack all trust-building proof below a long narrative section run. The visitor should see evidence before and at the booking handoff.",
    "- On booking pages, do not use a centered single-column hero card as the main above-the-fold structure. Use a split composition, attached proof panel, or another decision cluster that keeps the CTA and trust cue in one scan.",
    "- On booking pages, do not style every major section with the same soft panel treatment. Create section rhythm with at least one stronger contrast beat, one calmer support beat, and a booking handoff that feels visually distinct from the earlier explanatory sections.",
    "- When PAGE_INTENT or FUNNEL_BRIEF includes qualification details, routing rules, tagging, automation, or integration behavior, turn that into concrete page structure, CTA wording, and user guidance. Do not leave those instructions buried as hidden planning notes.",
    "- If routing or conditional logic exists, the page should explain what happens next for the visitor and what qualifies or disqualifies them. Make the page feel connected to a real backend flow.",
    "- If live pricing data exists, preserve exact price identity and price semantics. If live pricing is not connected, never fabricate exact amounts just to make the page feel finished.",
    "- FUNNEL_BRIEF, PAGE_INTENT, shell concept, and section plan are working guidance, not frozen truth.",
    "- When editing an existing page, CURRENT_HTML, the newest user instruction, RECENT_ITERATION_MEMORY, and concrete runtime blocks are fresher than older saved foundation text.",
    "- If older saved direction conflicts with the current page or the latest clearer context, update the stale direction instead of preserving it mechanically.",
    "- Default to diff-based editing when CURRENT_HTML exists. Preserve the current section sequence, runtime wiring, CTA path, and conversion flow unless the user explicitly asks for a rebuild or structural replacement.",
    "- Treat initialized funnel structure as stable. Edit, insert, or remove only the sections needed for the request before inventing a new page architecture.",
    "- Do not change the funnel type, remove core handoff sections, or rebuild the page shell just because a cleaner style is possible.",
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

  // Region splice mode: page is too large to send in full + a specific region is targeted.
  // In this mode the AI receives ONLY the selected region HTML and returns ONLY the
  // updated region HTML, which we splice back into the original full page programmatically.
  // This lets the AI make precise, contextual edits to any section regardless of total page length.
  const isRegionSpliceMode = hasSelectedRegion
    && effectiveCurrentHtml.length > 24000
    && !wantsDesignRedesign
    && !wantsDesignQualityAudit
    && !wasBlocksExport
    && !allowsStructuralRebuild;

  const system = [
    ...baseSystem,
    "When editing an existing page, treat CURRENT_HTML as the primary visual reference and preserve its overall visual system unless the user explicitly asks for broader redesign.",
    "If a GENERATION_PLAN is provided in the prompt, treat its surfaceSystem, proofObjects, visualAnchors, and sectionRhythm fields as build requirements. Make them concrete in the HTML and CSS instead of collapsing them into generic text blocks.",
    "If a GENERATION_PLAN is provided, also treat designIntent, styleIntensity, exhibitMode, and fontSystem as build requirements. Do not improvise a louder or more ornamental style than the plan selected.",
    buildStructuralQualityContractBlock("build"),
    buildDesignTokenPageContractBlock("build"),
    buildFunctionalSurfaceContractBlock("build"),
    allowsStructuralRebuild
      ? "Structural rebuilds are allowed for this run because the user explicitly asked for redesign or replacement-level change."
      : "Structural rebuilds are not allowed for this run. Keep the current page architecture stable and make the smallest effective diff that satisfies the request.",
    "Avoid the generic consultation-template failure mode: one repeated card treatment across every section, shallow pastel split layouts, proof reduced to plain paragraphs, and typography that feels like a starter template instead of a business-specific page.",
    "If the user asks to fix contrast, readability, or visibility, solve that with the smallest effective local style changes first. Prefer changing text color, overlays, local backgrounds, borders, or section-specific styles before changing the whole page palette.",
    "When the user asks for color cleanup, lighter surfaces, or a brighter background without specifying every element, make the visual call yourself: keep the dominant surface quiet, use supporting tints sparingly, and reserve accent color for CTA and proof emphasis.",
    "Treat color distribution as a system, not isolated patches. A good default is a 60/30/10 style balance across base surfaces, secondary surfaces, and accent cues.",
    "Do not apply stored brand colors or fonts to the entire page, major section backgrounds, or core UI surfaces unless the user clearly asks for branding or redesign and that choice improves readability.",
    hasCurrentHtml
      ? wasBlocksExport
        ? "Redesign mode: You will be given CURRENT_HTML auto-scaffolded from a block builder. Treat it only as a content and structure reference - ignore its default styling. Create a NEW, polished, fully-designed landing page from scratch that satisfies the user's request. Return the FULL HTML document."
        : hasSelectedRegion
          ? wantsDesignQualityAudit
            ? "Region design-quality mode: You will be given CURRENT_HTML and SELECTED_REGION_HTML. Perform a design quality audit on SELECTED_REGION_HTML: fix ALL contrast failures, harmonize any colors that clash with the dominant page palette, make invisible or near-invisible text and elements legible, and ensure every CTA has clear contrast and a palette-compatible color. Preserve the region's layout and content. Return the FULL updated HTML document."
            : wantsDesignRedesign
            ? "Region redesign mode: You will be given CURRENT_HTML and SELECTED_REGION_HTML. Focus the redesign on SELECTED_REGION_HTML, keep the rest of CURRENT_HTML intact except for small supporting adjustments, and return the FULL updated HTML document."
            : isRegionSpliceMode
            ? "Region splice mode: The page is too large to send in full. You will be given CURRENT_HTML_STRUCTURE_OUTLINE (full page anatomy) and SELECTED_REGION_HTML (the exact section to edit). Apply the user's request to SELECTED_REGION_HTML only. Return ONLY the updated SELECTED_REGION HTML - a self-contained block starting with the opening tag and ending with its closing tag. Do not return the full page. Do not include <html>, <head>, or <body> wrappers."
            : "Region editing mode: You will be given CURRENT_HTML and SELECTED_REGION_HTML. Apply the user's request to SELECTED_REGION_HTML while preserving the rest of CURRENT_HTML unless a small surrounding adjustment is required. Return the FULL updated HTML document."
        : wantsDesignQualityAudit
          ? "Design-quality mode: You will be given CURRENT_HTML. Perform a full design quality audit on the entire page. Fix ALL of the following issues you find: (1) any text/background combination with contrast below WCAG AA 4.5:1 for normal text or 3:1 for large text, (2) any button or CTA whose color clashes with the dominant page palette - identify the dominant palette and harmonize outliers, (3) any nav, header, label, link, or decorative text that is near-invisible due to low opacity, near-matching color, or missing color declaration, (4) any interactive element whose label has poor contrast against its own background. Preserve the page's layout, structure, content, and identity. Do not change copy, layout, or section order. Return the FULL updated HTML document."
        : wantsDesignRedesign
          ? "Redesign mode: You will be given CURRENT_HTML. Replace simplistic placeholder markup with a materially improved, polished landing page that fully satisfies the requested sections. Return the FULL updated HTML document."
          : "Editing mode: You will be given CURRENT_HTML. Apply the user's instruction as a minimal, precise change to CURRENT_HTML. Return the FULL updated HTML document."
      : "Generation mode: Create a new HTML document from the user's instruction.",
    wasBlocksExport || wantsDesignRedesign
      ? "For design or redesign requests, produce a complete landing page with strong hierarchy, multiple clear sections, persuasive non-placeholder copy, polished spacing, and clear CTA treatment."
      : "",
    hasCurrentHtml
      ? [
          "FUNNEL_PRECISION_RULES - apply to every edit regardless of scope:",
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
  const designContextBlock = buildFunnelDesignContextPromptBlock(designContext);

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

  const dynamicFunnelRuntimeBlock = buildDynamicFunnelRuntimeBlock({
    intentProfile: {
      pageType: effectiveIntentProfile.pageType,
      primaryCta: effectiveIntentProfile.primaryCta,
      formStrategy: effectiveIntentProfile.formStrategy,
      qualificationFields: effectiveIntentProfile.qualificationFields,
      routingDestination: effectiveIntentProfile.routingDestination,
      conditionalLogic: effectiveIntentProfile.conditionalLogic,
      taggingPlan: effectiveIntentProfile.taggingPlan,
      automationPlan: effectiveIntentProfile.automationPlan,
    },
    funnelBrief: effectiveFunnelBrief,
    hasStripeProducts: Boolean(stripeProducts.ok && stripeProducts.products.length),
    hasBookingRuntime: Boolean(defaultBookingPublicUrl || defaultBookingCalendarId),
  });

  const userMsg = { role: "user", content: threadPrompt, at: new Date().toISOString() };

  let html = "";
  let question: string | null = null;
  let changelog: Record<string, unknown> | null = null;
  let generationPlan: Record<string, unknown> | null = null;
  if (bookingFallbackFastPathEligible) {
    aiRun.plannedMinSteps = promptStrategy.usedAi ? 1 : 0;
    aiRun.plannedMaxSteps = promptStrategy.usedAi ? 1 : 0;
    aiRun.usedFallback = true;
    aiRun.stopReason = "completed";
    html = buildBookingFallbackHtmlFromPlan({
      funnelName: normalizedPage.funnel.name,
      pageTitle: normalizedPage.title,
      prompt: strategicPrompt || prompt,
      primaryCta: effectiveIntentProfile.primaryCta || "Book a call",
      bookingHref: defaultBookingPublicUrl || "#book",
      bookingSectionId: "book",
      audience: effectiveIntentProfile.audience,
      offer: effectiveIntentProfile.offer,
      companyContext: effectiveIntentProfile.companyContext || effectiveFunnelBrief?.companyContext || null,
      pageGoal: effectiveIntentProfile.pageGoal,
      generationPlan: null,
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
        "Fast-path fallback shell was used for an empty booking draft so the first pass stays business-ready without paying for slow repair loops.",
      ],
    };
  }
  try {
    const pageStructureOutline = hasCurrentHtml ? extractHtmlStructureOutline(effectiveCurrentHtml) : "";
    const currentHtmlBlock = hasCurrentHtml
      ? isRegionSpliceMode
        // Splice mode: send the full-page structural outline instead of truncated raw HTML -
        // the AI only needs to know the page anatomy, not the raw markup it can't see.
        ? [
          "CURRENT_HTML_STRUCTURE_OUTLINE (full page anatomy - use this to understand the page context around the selected region):",
            pageStructureOutline || "(no outline available)",
            "",
          ].join("\n")
        : effectiveCurrentHtml.length > 24000
          ? [
              "CURRENT_HTML:",
              "```html",
              clampText(effectiveCurrentHtml, 24000),
              "```",
              "",
              "CURRENT_HTML_STRUCTURE_OUTLINE (full page anatomy - sections beyond the truncation point above):",
              pageStructureOutline || "(no additional structure detected)",
              "",
            ].join("\n")
          : [
              "CURRENT_HTML:",
              "```html",
              effectiveCurrentHtml,
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
    const preservedSourceActionPlanBlock = buildSourceActionPlanPromptBlock(
      preservedSourceActionPlan,
      "PRESERVED_SOURCE_ACTION_PLAN",
    );

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
      allowsStructuralRebuild
        ? "- Structural rework is allowed, but only because this run explicitly calls for redesign or replacement-level change."
        : "- Treat the current section order, funnel posture, runtime handoff, and CTA path as stable. Work diff-first: modify the existing structure before considering any new section or section move.",
      allowsStructuralRebuild
        ? "- If the existing structure is unusable, you may replace it, but keep the conversion logic and runtime integrations truthful."
        : "- Do not replace the page shell, remove core conversion steps, or change funnel type unless the user explicitly asks for that structural change.",
      "- If the user asks for lighter, cleaner, or whiter styling, do not wait for exact selectors. Rebalance the dominant surfaces toward white or near-white backgrounds, keep copy dark, and let accent color carry only CTA and proof emphasis.",
    ].join("\n");

    const businessContextBlock = [
      profileContext.guidance,
      buildFunnelBriefPromptBlock(effectiveFunnelBrief),
      buildFunnelPageIntentPromptBlock(effectiveIntentProfile, routeLabel),
      shellFrameBlock,
      visualWhyBlock,
      exhibitArchetypeBlock,
      designContextBlock,
      allowBrandStyling ? profileContext.styling : "",
    ].filter(Boolean).join("\n\n");

    const userText = [
      businessContextBlock,
      bookingRuntimeBlock,
      dynamicFunnelRuntimeBlock,
      stripeProductsBlock,
      pageEditContextBlock,
      `Funnel: ${normalizedPage.funnel.name} (slug: ${normalizedPage.funnel.slug})`,
      `Page: ${normalizedPage.title} (slug: ${normalizedPage.slug})`,
      wantsDesignQualityAudit
        ? [
            "DESIGN_QUALITY_CHECKLIST (audit every item before writing output):",
            "1. CONTRAST - Find every text/background pair. Fix any combination where the contrast ratio is below 4.5:1 for body text or 3:1 for headings/large text. This includes nav links, button labels, placeholder text, captions, and secondary/tertiary copy.",
            "2. COLOR HARMONY - Identify the dominant palette from the existing page (e.g. if the hero and section backgrounds are warm brown/burgundy/earthy tones, that is the palette). Any buttons, links, or interactive elements using sharply contrasting hue families (e.g. bright purple buttons on a warm-tone page) must be replaced with a harmonious alternative that still has strong contrast and serves as a clear CTA.",
            "3. INVISIBLE ELEMENTS - Find any nav items, header content, link text, labels, or decorative text that is near-invisible due to zero opacity, white-on-white, very light gray on white, or undeclared color inheriting a near-invisible ancestor color. Make every piece of UI text fully legible.",
            "4. CTA LEGIBILITY - Every button and CTA must clearly read. Fix button text color if it does not contrast against the button's own background. Fix button background if it does not stand out enough from the section behind it.",
            "5. SECTION BACKGROUNDS - Any section that currently has no background differentiation and uses default page background, where a subtle contrast would help structure the page, should receive a light background tint consistent with the existing palette.",
            "6. COLOR DISTRIBUTION - Rebalance the page like a system. Keep most large surfaces quiet and light, use a smaller amount of secondary tinting for structure, and reserve saturated accent mainly for CTA and proof emphasis.",
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
            "- Build the color system intentionally: let the dominant surface carry most of the page, use a smaller amount of secondary tinting, and keep accent color concentrated around CTA and proof cues instead of washing the whole page in brand color.",
            "- Use business brand colors or fonts only where they fit the specific page and improve readability. Do not turn the whole page into a brand-color wash by default.",
            "- Make the above-the-fold section immediately credible and conversion-focused.",
            "- Ensure every CTA is clickable and points to a real destination.",
          ].filter(Boolean).join("\n")
        : "",
          wantsBookingPage ? buildBookingDesignContractBlock("build") : "",
      "",
      currentHtmlBlock,
      pageSectionsBlock,
      selectedRegionBlock,
      recentIterationMemoryBlock,
      preservedSourceActionPlanBlock,
      "DIRECTION_RULE:",
      "Follow the strategic build brief below and do not mirror the user's wording back verbatim.",
      "",
      "STRATEGIC_BUILD_BRIEF:",
      strategicPrompt,
      contextBlock,
      contextMediaBlock,
      attachmentsBlock,
    ].join("\n");

      // ── REGION SPLICE MODE ───────────────────────────────────────────────────
      // Page is too large to send in full AND a specific region is selected.
      // We send only the selected region HTML + the structural outline of the
      // full page so the AI knows context without receiving raw HTML it can't see.
      // The AI returns ONLY the updated region block, which we splice back in.
      if (isRegionSpliceMode && selectedRegion?.html) {
        const spliceSystem = [
          ...baseSystem,
          `Region splice mode: The page is too large to send in full. You will be given CURRENT_HTML_STRUCTURE_OUTLINE (full page anatomy) and SELECTED_REGION_HTML (the exact section to edit). Apply the user's request to SELECTED_REGION_HTML only. Return ONLY the updated SELECTED_REGION HTML - a self-contained block starting with the opening tag and ending with its closing tag. Do not return the full page. Do not include <html>, <head>, or <body> wrappers.`,
        ].join("\n");

        const spliceUserText = [
          currentHtmlBlock,
          selectedRegionBlock,
          preservedSourceActionPlanBlock,
          "USER_REQUEST:",
          strategicPrompt || prompt,
        ].filter(Boolean).join("\n");

        const spliceRaw = await trackRequiredAiStep("Region splice edit", () =>
          imageUrls.length
            ? generateTextWithImages({ system: spliceSystem, user: spliceUserText, imageUrls, history: aiHistory })
            : generateText({ system: spliceSystem, user: spliceUserText, history: aiHistory }),
        );

        question = extractAiQuestion(spliceRaw);
        if (!question) {
          const regionHtml = extractHtml(spliceRaw);
          if (regionHtml) {
            const splicedFull = spliceRegionHtml(effectiveCurrentHtml, selectedRegion.key, regionHtml);
            html = postProcessGeneratedPageHtml(
              splicedFull || regionHtml,
              effectiveIntentProfile.pageType,
              requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
            );
            changelog = { splicedRegion: selectedRegion.key, mode: "region-splice" };
          }
        }
      }
      // ── END REGION SPLICE MODE ───────────────────────────────────────────────

      if (!html && !question) {
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
      preservedSourceActionPlanBlock,
      prompt,
    });

    const planRaw = await trackRequiredAiStep(
      "Whole-page generation plan",
      () =>
        imageUrls.length
          ? generateTextWithImages({ system: planSystem, user: planUserText, imageUrls, history: aiHistory })
          : generateText({ system: planSystem, user: planUserText, history: aiHistory }),
      {
        onSuccess: () => {
          aiRun.usedGenerationPlan = true;
        },
      },
    );

    generationPlan = extractJsonObjectRecord(planRaw);
    effectiveSourceActionPlan = mergeSourceActionPlans(readPlanSourceActionPlan(generationPlan), preservedSourceActionPlan);

    const generationPlanBlock = generationPlan
      ? [
          "GENERATION_PLAN:",
          "```json",
          JSON.stringify(generationPlan, null, 2),
          "```",
          "",
          allowsStructuralRebuild
            ? "Treat this plan as a hard scaffold for the next build step. Do not collapse back into generic template markup."
            : "Treat this plan as a diff-based implementation scaffold inside the current page structure. Do not use it as permission to replace the page shell or reorder the conversion flow.",
          "Honor the openingPosture, openingCluster, and bookingHandoff fields as a layout contract.",
          "Honor surfaceSystem, proofObjects, visualAnchors, and sectionRhythm as implementation contracts. Make them visible in the HTML as actual surfaces and designed elements, not as implied prose.",
          "If sectionRhythm calls for contrast beats or calmer support beats, reflect that with distinct section treatments instead of reusing one panel style everywhere.",
          "If proofObjects or visualAnchors mention testimonial cards, metrics, media, logos, portraits, screenshots, or proof panels, render those as real page elements rather than leaving proof as plain paragraphs.",
          effectiveSourceActionPlan
            ? "Honor sourceActionPlan as the implementation contract for the next build step. The HTML must make those moves visible in the page source."
            : "",
          wantsBookingPage
            ? "In particular, keep the first screen as one dominant decision cluster: promise, fit qualifier, primary CTA, and adjacent proof in one scan. Do not separate proof into a later beat."
            : "",
          "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const generationUserText = [userText, "", generationPlanBlock].filter(Boolean).join("\n");

    const aiRaw = await trackRequiredAiStep("Whole-page HTML build", () =>
      imageUrls.length
        ? generateTextWithImages({ system, user: generationUserText, imageUrls, history: aiHistory })
        : generateText({ system, user: generationUserText, history: aiHistory }),
    );

    question = extractAiQuestion(aiRaw);
    if (!question) {
      const extracted = extractHtmlAndChangelog(aiRaw);
      html = postProcessGeneratedPageHtml(
        extracted.html,
        effectiveIntentProfile.pageType,
        requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
      );
      changelog = extracted.changelog;

      const firstPassIssues = isPrimaryCtaCopyEdit && requestedPrimaryCtaCopy
        ? (html.includes(requestedPrimaryCtaCopy) ? [] : [`Include the updated primary CTA label '${requestedPrimaryCtaCopy}' in the page.`])
        : assessGeneratedPageQuality(html, {
            pageType: effectiveIntentProfile.pageType,
            primaryCta: effectiveIntentProfile.primaryCta,
            sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
            proofModel: shellFrame?.proofModel || null,
            allowMultipleBookingMounts,
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
          effectiveIntentProfile.pageType === "booking"
            ? "BOOKING_REPAIR_RULES: the main booking CTA must visually outrank everything near it. Use a filled high-contrast button in a contained action stack, and demote any secondary action to a text-like link or quiet support treatment."
            : "",
          effectiveIntentProfile.pageType === "booking"
            ? "BOOKING_REPAIR_RULES: create clearer section rhythm. Do not keep hero, proof strip, details, FAQ, and booking areas on the same soft panel treatment. Introduce at least one more forceful contrast beat or visual temperature shift so the page reads in chapters."
            : "",
          effectiveIntentProfile.pageType === "booking"
            ? "BOOKING_REPAIR_RULES: on a normal booking page, keep one real scheduler. If you need a softer later beat, turn it into objection-handling copy with a quieter return-to-booking link instead of duplicating the full booking UI."
            : "",
          "VISUAL_REPAIR_RULES: if the page still looks like a generic starter template, rebuild the hero, section containers, typography, and proof surfaces so the result feels deliberate and premium. Avoid stock UI font stacks such as Arial, Helvetica, Segoe UI, Tahoma, Geneva, Verdana, flat full-width color bands, viewport-height hero shells, and bare CTA rows with little containment.",
          "VISUAL_REPAIR_RULES: do not keep or reintroduce the common Inter body + Space Grotesk heading pairing or the usual soft-blue consultation shell. Pick a stronger type and surface direction.",
          "VISUAL_REPAIR_RULES: use contained layouts with max-width wrappers, premium typography choices, layered surfaces or cards, and a proof module visually attached to the first serious CTA.",
          "VISUAL_REPAIR_RULES: for booking pages, do not keep or recreate a centered single-column hero card. Recompose the first screen so the promise, CTA, and trust cue land together.",
          allowsStructuralRebuild
            ? "VISUAL_REPAIR_RULES: do not keep the prior structure if it still reads like a stock starter page. Replace the weak hero and surrounding sections with a stronger composition instead of only restyling colors."
            : "VISUAL_REPAIR_RULES: resolve the issues inside the current section order. Strengthen containment, hierarchy, and proof staging without replacing the page shell.",
          "",
          "Repair the page so every validation issue is resolved. Return only a full ```html document, optionally followed by the JSON change log.",
        ].filter(Boolean).join("\n");

        const repairRaw = await trackAiStep(
          "Validation repair pass",
          () =>
            imageUrls.length
              ? generateTextWithImages({ system, user: repairUserText, imageUrls, history: aiHistory })
              : generateText({ system, user: repairUserText, history: aiHistory }),
          {
            optional: true,
            onSuccess: () => {
              aiRun.usedRepair = true;
            },
          },
        );

        if (repairRaw) {
          const repaired = extractHtmlAndChangelog(repairRaw);
          if (repaired.html) {
            html = postProcessGeneratedPageHtml(
              repaired.html,
              effectiveIntentProfile.pageType,
              requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
            );
            changelog = repaired.changelog ?? changelog;
          }
        }

        const rescueIssues = assessGeneratedPageQuality(html, {
          pageType: effectiveIntentProfile.pageType,
          primaryCta: effectiveIntentProfile.primaryCta,
          sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
          proofModel: shellFrame?.proofModel || null,
          allowMultipleBookingMounts,
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
            "- The booking CTA must be the most visually dominant object in that cluster. Use one filled high-contrast action and demote any secondary action to a quieter text link or subordinate treatment.",
            "- Do not leave proof as a later standalone section. Attach it directly to the hero CTA cluster, then repeat reassurance immediately above or inside the booking section.",
            "- Keep one dominant text-and-CTA column. Any secondary area must be a compact proof rail, proof strip, or reassurance stack, not decorative filler.",
            "- Keep one real scheduler on a standard booking page. If you need a later fallback beat, use a quieter return-to-booking CTA instead of a second full calendar.",
            "- Return only a full ```html document, optionally followed by the JSON change log.",
          ].join("\n");

          const focusedBookingRepairRaw = await trackAiStep(
            "Focused booking repair pass",
            () =>
              imageUrls.length
                ? generateTextWithImages({ system, user: focusedBookingRepairUserText, imageUrls, history: aiHistory })
                : generateText({ system, user: focusedBookingRepairUserText, history: aiHistory }),
            {
              optional: true,
              onSuccess: () => {
                aiRun.usedFocusedBookingRepair = true;
              },
            },
          );

          if (focusedBookingRepairRaw) {
            const focusedBookingRepair = extractHtmlAndChangelog(focusedBookingRepairRaw);
            if (focusedBookingRepair.html) {
              html = postProcessGeneratedPageHtml(
                focusedBookingRepair.html,
                effectiveIntentProfile.pageType,
                requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
              );
              changelog = focusedBookingRepair.changelog ?? changelog;
            }
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
            allowsStructuralRebuild
              ? "- Discard weak starter-template structure if needed. Replace it with a stronger composition rather than preserving a generic hero and flat stacked sections."
              : "- Keep the existing section order and conversion flow intact. Rescue the page by strengthening hierarchy, surfaces, and proof staging inside that stable structure.",
            "- Use an intentional premium visual system: contained outer frame, layered surfaces, stronger typography hierarchy, and a proof cluster attached to the first serious CTA.",
            "- Avoid stock UI font stacks such as Arial, Helvetica, Segoe UI, Tahoma, Geneva, Verdana, along with plain centered hero boxes and flat full-width color bands.",
            effectiveIntentProfile.pageType === "booking"
              ? "- For booking pages, build one dominant decision cluster above the fold: promise, CTA, and trust cue in a single scan. Then repeat proof immediately before or inside the booking handoff section."
              : "- Above the fold, build one dominant decision cluster so the promise, CTA, and immediate credibility cue land together.",
            effectiveIntentProfile.pageType === "booking"
              ? allowsStructuralRebuild
                ? "- Respect the plan contract for openingPosture, openingCluster, and bookingHandoff. Rewrite the first screen if needed rather than trying to patch a weak composition."
                : "- Respect the plan contract for openingPosture, openingCluster, and bookingHandoff while keeping the current booking flow and section sequence intact."
              : "",
            "- Prefer asymmetry, cards, panels, or layered containers over bare full-width sections with only background-color changes.",
            "- Return only a full ```html document, optionally followed by the JSON change log.",
          ].filter(Boolean).join("\n");

          const rescuedRaw = await trackAiStep(
            "Rescue redesign pass",
            () =>
              imageUrls.length
                ? generateTextWithImages({ system, user: rescueUserText, imageUrls, history: aiHistory })
                : generateText({ system, user: rescueUserText, history: aiHistory }),
            {
              optional: true,
              onSuccess: () => {
                aiRun.usedRescueRedesign = true;
              },
            },
          );

          if (rescuedRaw) {
            const rescued = extractHtmlAndChangelog(rescuedRaw);
            if (rescued.html) {
              html = postProcessGeneratedPageHtml(
                rescued.html,
                effectiveIntentProfile.pageType,
                requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
              );
              changelog = rescued.changelog ?? changelog;
            }
          }
        }
      }
    }
    } // end if (!html && !question)
  } catch (e) {
    if (e instanceof AiRunCreditError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Insufficient credits to continue AI generation at ${e.stepLabel}.`,
          creditsRemaining: e.creditsRemaining,
          aiResult: buildAiResultMeta({
            mode: question ? "question" : "html-update",
            hadCurrentHtml: Boolean(effectiveCurrentHtml),
            wantsDesignRedesign,
            contextKeyCount: contextKeys.length,
            contextMediaCount: contextMedia.length,
            changelog,
            run: aiRun,
          }),
        },
        { status: 402 },
      );
    }

    return NextResponse.json(
      { ok: false, error: (e as any)?.message ? String((e as any).message) : "AI generation failed" },
      { status: 500 },
    );
  }

  if (question) {
    aiRun.stopReason = "question-returned";
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
        run: aiRun,
      }),
      sourceActionPlan: effectiveSourceActionPlan,
      page: updated,
    });
  }

  if (!html) return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });

  html = postProcessGeneratedPageHtml(
    sanitizeGeneratedHtmlLinks(normalizePortalHostedPaths(html)),
    effectiveIntentProfile.pageType,
    requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
  );
  html = enhanceBookingSchedulingExperience({
    html,
    bookingHref: effectiveIntentProfile.pageType === "booking" ? defaultBookingPublicUrl || null : null,
    ctaText: effectiveIntentProfile.primaryCta || "Book a call",
  });

  let designTokenIssues = assessDesignTokenDiscipline({ html });

  if (html && designTokenIssues.length) {
    const designTokenNormalizationUserText = [
      "CURRENT_HTML:",
      "```html",
      clampText(html, 24000),
      "```",
      "",
      generationPlan
        ? [
            "GENERATION_PLAN:",
            "```json",
            JSON.stringify(generationPlan, null, 2),
            "```",
          ].join("\n")
        : "",
      "",
      "DESIGN_SYSTEM_NORMALIZATION_REQUIRED:",
      ...designTokenIssues.map((issue) => `- ${issue}`),
      buildDesignTokenPageContractBlock("build"),
      "Normalize the page before returning. Preserve section order, copy intent, CTA destinations, booking/runtime wiring, and conversion flow, but unify buttons, cards, and typography under the shared five-token system.",
      "Return only a full ```html document, optionally followed by the JSON change log.",
    ]
      .filter(Boolean)
      .join("\n");

    const normalizationImageUrls = Array.from(
      new Set(
        contextMedia
          .map((m) => toAbsoluteUrl(req, String(m?.url || "").trim()))
          .filter(Boolean)
          .slice(0, 8),
      ),
    ).slice(0, 6);

    let designTokenNormalizedRaw: string | null = null;
    try {
      designTokenNormalizedRaw = await trackAiStep(
        "Design token normalization pass",
        () =>
          normalizationImageUrls.length
            ? generateTextWithImages({ system, user: designTokenNormalizationUserText, imageUrls: normalizationImageUrls, history: aiHistory })
            : generateText({ system, user: designTokenNormalizationUserText, history: aiHistory }),
        {
          optional: true,
        },
      );
    } catch {
      designTokenNormalizedRaw = null;
    }

    if (designTokenNormalizedRaw) {
      const normalizedDesignSystemHtml = extractHtmlAndChangelog(designTokenNormalizedRaw);
      if (normalizedDesignSystemHtml.html) {
        html = postProcessGeneratedPageHtml(
          normalizedDesignSystemHtml.html,
          effectiveIntentProfile.pageType,
          requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
        );
        html = enhanceBookingSchedulingExperience({
          html,
          bookingHref: effectiveIntentProfile.pageType === "booking" ? defaultBookingPublicUrl || null : null,
          ctaText: effectiveIntentProfile.primaryCta || "Book a call",
        });
        changelog = normalizedDesignSystemHtml.changelog ?? changelog;
      }
    }

    designTokenIssues = assessDesignTokenDiscipline({ html });
  }

  let finalQualityIssues = isPrimaryCtaCopyEdit && requestedPrimaryCtaCopy
    ? (html.includes(requestedPrimaryCtaCopy) ? [] : [`Include the updated primary CTA label '${requestedPrimaryCtaCopy}' in the page.`])
    : assessGeneratedPageQuality(html, {
        pageType: effectiveIntentProfile.pageType,
        primaryCta: effectiveIntentProfile.primaryCta,
        sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
        proofModel: shellFrame?.proofModel || null,
      });
  let planAdherence = assessSourceActionPlanAdherence(html, effectiveSourceActionPlan);

  if (designTokenIssues.length) {
    finalQualityIssues = [...finalQualityIssues, ...designTokenIssues];
  }

  if (
    finalQualityIssues.length &&
    !isPrimaryCtaCopyEdit &&
    effectiveIntentProfile.pageType === "booking" &&
    hasBookingClusterFailure(finalQualityIssues)
  ) {
    aiRun.usedFallback = true;
    const bookingFallbackPlan = generationPlan;
    html = buildBookingFallbackHtmlFromPlan({
      funnelName: normalizedPage.funnel.name,
      pageTitle: normalizedPage.title,
      prompt,
      primaryCta: effectiveIntentProfile.primaryCta || "Book a call",
      bookingHref: defaultBookingPublicUrl || "#book",
      bookingSectionId: "book",
      audience: effectiveIntentProfile.audience,
      offer: effectiveIntentProfile.offer,
      companyContext: effectiveIntentProfile.companyContext || effectiveFunnelBrief?.companyContext || null,
      pageGoal: effectiveIntentProfile.pageGoal,
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

    html = postProcessGeneratedPageHtml(
      sanitizeGeneratedHtmlLinks(normalizePortalHostedPaths(html)),
      effectiveIntentProfile.pageType,
      requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
    );
    html = enhanceBookingSchedulingExperience({
      html,
      bookingHref: defaultBookingPublicUrl || null,
      ctaText: effectiveIntentProfile.primaryCta || "Book a call",
    });
    finalQualityIssues = assessGeneratedPageQuality(html, {
      pageType: effectiveIntentProfile.pageType,
      primaryCta: effectiveIntentProfile.primaryCta,
      sectionPlan: effectiveIntentProfile.sectionPlan || shellFrame?.sectionPlan || null,
      proofModel: shellFrame?.proofModel || null,
    });
    planAdherence = assessSourceActionPlanAdherence(html, effectiveSourceActionPlan);
  }

  if (planAdherence.issues.length) {
    finalQualityIssues = [...finalQualityIssues, ...planAdherence.issues];
  }

  if (finalQualityIssues.length) {
    aiRun.stopReason = "quality-check-failed";
    return NextResponse.json(
      {
        ok: false,
        error: `Generated page failed quality checks: ${finalQualityIssues.join(" ")}`,
        aiResult: buildAiResultMeta({
          mode: "html-update",
          hadCurrentHtml: Boolean(effectiveCurrentHtml),
          wantsDesignRedesign,
          contextKeyCount: contextKeys.length,
          contextMediaCount: contextMedia.length,
          changelog,
          planAdherenceIssues: planAdherence.issues,
          run: aiRun,
        }),
        sourceActionPlan: effectiveSourceActionPlan,
      },
      { status: 502 },
    );
  }

  if (aiRun.stopReason === "completed" && aiRun.usedFallback) {
    aiRun.stopReason = "completed";
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
    : await generatePageUpdatedAssistantText({ pageTitle: page.title, funnelName: page.funnel?.name, prompt, changelog });
  const assistantMsg = pageUpdatedText.trim()
    ? {
        role: "assistant" as const,
        content: pageUpdatedText.trim(),
        at: new Date().toISOString(),
        ...(effectiveSourceActionPlan ? { sourceActionPlan: effectiveSourceActionPlan } : {}),
      }
    : null;
  const nextChat = (assistantMsg ? [...prevChat, userMsg, assistantMsg] : [...prevChat, userMsg]).slice(-40);

  const cleanHtml = enhanceBookingSchedulingExperience({
    html: postProcessGeneratedPageHtml(
      sanitizeGeneratedHtmlLinks(normalizePortalHostedPaths(html)),
      effectiveIntentProfile.pageType,
      requestedPrimaryCtaCopy || effectiveIntentProfile.primaryCta,
    ),
    bookingHref: effectiveIntentProfile.pageType === "booking" ? defaultBookingPublicUrl || null : null,
    ctaText: effectiveIntentProfile.primaryCta || "Book a call",
  });

  const updated = await prisma.creditFunnelPage.update({
    where: { id: normalizedPage.id },
    data: applyDraftHtmlWriteCompat({
      editorMode: "CUSTOM_HTML",
      // Write AI output to draftHtml only - user must explicitly Publish to go live.
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
      planAdherenceIssues: planAdherence.issues,
      run: aiRun,
    }),
    sourceActionPlan: effectiveSourceActionPlan,
    page: normalizedUpdated,
  });
}
