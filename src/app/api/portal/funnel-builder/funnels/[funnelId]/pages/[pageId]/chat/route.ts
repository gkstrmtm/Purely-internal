import { NextResponse } from "next/server";

import { generateText, generateTextWithImages } from "@/lib/ai";
import { getBusinessProfileFoundationContext, getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  buildFunnelBriefPromptBlock,
  buildFunnelPageIntentPromptBlock,
  buildFunnelPageRouteLabel,
  buildResolvedFunnelFoundation,
  inferFunnelBriefProfile,
  inferFunnelPageIntentProfile,
  readFunnelBrief,
  readFunnelPageBrief,
  stripFunnelPageIntentMessages,
  type FunnelPageIntentProfile,
} from "@/lib/funnelPageIntent";
import { getFunnelPageCurrentHtml } from "@/lib/funnelPageState";
import { normalizeDraftHtml, dbHasCreditFunnelPageDraftHtmlColumn, withDraftHtmlSelect } from "@/lib/funnelPageDbCompat";
import { buildFunnelDesignContextPromptBlock, sanitizeFunnelDesignContext } from "@/lib/funnelDesignContext";
import { assessFunnelSceneQuality, buildFragmentSceneAnatomy } from "@/lib/funnelSceneQuality";
import { resolveFunnelShellFrame } from "@/lib/funnelShellFrames";
import { buildFunnelVisualWhyBlock } from "@/lib/funnelVisualWhy";
import { extractSourceActionChatPayload, mergeSourceActionPlans, type SourceActionPlan, type SourceActionPlanMove } from "@/lib/funnelSourceActionPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampText(s: string, maxLen: number) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + " [truncated]";
}

/**
 * Extracts a structural outline of an HTML document: all elements with IDs,
 * all headings, and section boundaries with a short text preview. This lets
 * the AI understand the full page anatomy even when the raw HTML is too large
 * to send in full.
 */
function extractHtmlStructureOutline(html: string): string {
  const raw = String(html || "");
  if (!raw.trim()) return "";

  const lines: string[] = [];
  // Match any element with an id, or heading tags, capturing a snippet of inner text
  const tagPattern = /<(h[1-4]|section|header|footer|nav|main|article|div|aside)\b([^>]*)>([\s\S]{0,300}?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = tagPattern.exec(raw)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || "";
    const inner = match[3] || "";

    // Extract id attribute
    const idMatch = /\bid=["']([^"']+)["']/.exec(attrs);
    const id = idMatch ? idMatch[1] : "";

    // Extract class (first 2 tokens)
    const classMatch = /\bclass=["']([^"']+)["']/.exec(attrs);
    const classes = classMatch ? classMatch[1].trim().split(/\s+/).slice(0, 2).join(" ") : "";

    // Extract visible text snippet from inner
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

    // Only include headings and id-anchored/semantic elements
    const isHeading = /^h[1-4]$/.test(tag);
    const isSemantic = ["section", "header", "footer", "nav", "main", "article", "aside"].includes(tag);
    const isIdAnchored = Boolean(id);

    if (!isHeading && !isSemantic && !isIdAnchored) continue;

    lines.push(`<${tag} ${label}> ${textSnippet ? `"${textSnippet}"` : "(no text)"}`);
    if (lines.length >= 60) break;
  }

  return lines.length ? lines.join("\n") : "";
}

/**
 * Builds the HTML context block for the chat system prompt.
 * For small pages: passes full HTML up to 20,000 chars.
 * For large pages: passes the full text up to 20,000 chars PLUS a structural
 * outline so the AI can reason about sections it cannot fully read.
 */
function buildPageHtmlContextBlock(html: string, selectedRegion: { key: string; label: string; summary: string } | null): string {
  const raw = String(html || "").trim();
  if (!raw) return "No current HTML.";

  const FULL_CLAMP = 20000;

  if (raw.length <= FULL_CLAMP) {
    return `Current page HTML:\n${raw}`;
  }

  // Page is large — send the first 20,000 chars + a structural outline of the full document
  const outline = extractHtmlStructureOutline(raw);
  const parts: string[] = [
    `Current page HTML (first ${FULL_CLAMP.toLocaleString()} chars of ${raw.length.toLocaleString()} total — page is large):`,
    raw.slice(0, FULL_CLAMP) + "\n[...remaining HTML not shown — use STRUCTURE OUTLINE below for full page anatomy]",
  ];

  if (outline) {
    parts.push(
      "",
      "STRUCTURE OUTLINE (full page — element tag, selector, and text preview for every section/heading/anchored element):",
      outline,
    );
  }

  // If a specific region is selected, pull its content from the raw HTML and show it in full
  if (selectedRegion?.key) {
    const regionPattern = new RegExp(
      `(<(?:section|div|article|main|header|footer|aside)\\b[^>]*\\bid=["']${selectedRegion.key}["'][^>]*>[\\s\\S]*?<\\/(?:section|div|article|main|header|footer|aside)>)`,
      "i",
    );
    const regionMatch = regionPattern.exec(raw);
    if (regionMatch) {
      parts.push(
        "",
        `SELECTED REGION FULL HTML (#${selectedRegion.key} — "${selectedRegion.label}"):`,
        clampText(regionMatch[1], 12000),
      );
    }
  }

  return parts.join("\n");
}

function htmlToPlainText(html: string) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(value: string, pattern: RegExp) {
  return (String(value || "").match(pattern) || []).length;
}

function humanizeSectionLabel(value: string) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinHumanList(items: string[]) {
  const filtered = items.map((item) => String(item || "").trim()).filter(Boolean);
  if (!filtered.length) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, and ${filtered[filtered.length - 1]}`;
}

function collectSectionPlanItemsFromBlocks(rawBlocks: unknown) {
  const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];
  const labels: string[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] as Record<string, any> | null;
    if (!block || typeof block !== "object" || block.type !== "section") continue;
    const props = block.props && typeof block.props === "object" ? block.props : {};
    const children = Array.isArray((props as any).children) ? ((props as any).children as Array<Record<string, any>>) : [];
    const heading = children.find((child) => child && child.type === "heading" && typeof child.props?.text === "string");
    const headingText = typeof heading?.props?.text === "string" ? heading.props.text.trim() : "";
    const anchorLabel = typeof (props as any).anchorId === "string" ? humanizeSectionLabel((props as any).anchorId) : "";
    const label = headingText || anchorLabel || `Section ${index + 1}`;
    if (!label || labels.includes(label)) continue;
    labels.push(label);
  }

  return labels.slice(0, 8);
}

function collectObservedSectionLabelsFromHtml(html: string) {
  return collectObservedSectionsFromHtml(html).map((section) => section.label);
}

type ObservedSection = {
  label: string;
  role: "hero" | "proof" | "booking" | "faq" | "generic";
};

type ObservedPageDiffSignal = {
  pageLooksBooking: boolean;
  heroHeadline: string;
  heroSupport: string;
  proofCopy: string;
  hasGenericHero: boolean;
  hasGenericProof: boolean;
  hasBookingExpectationCopy: boolean;
  hasProofNearCta: boolean;
  hasDedicatedBookingSection: boolean;
  sectionCount: number;
};

function collectObservedSectionsFromHtml(html: string): ObservedSection[] {
  const raw = String(html || "").trim();
  if (!raw) return [];

  const sections: ObservedSection[] = [];
  const sectionPattern = /<(section|header|main|article)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = sectionPattern.exec(raw)) !== null && sections.length < 8) {
    const sectionHtml = match[0] || "";
    const sectionText = htmlToPlainText(sectionHtml).toLowerCase();
    const headingMatch = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(sectionHtml);
    const headingText = headingMatch ? htmlToPlainText(headingMatch[2] || "").slice(0, 120) : "";

    let label = "";
    let role: ObservedSection["role"] = "generic";

    if (index === 0 && (/<h1\b/i.test(sectionHtml) || /<a\b|<button\b/i.test(sectionHtml))) {
      label = "hero";
      role = "hero";
    } else if (/\b(proof|testimonial|review|trusted by|results?|case stud|authority)\b/.test(sectionText)) {
      label = "proof";
      role = "proof";
    } else if (/\b(book|booking|schedule|calendar|consultation|strategy call)\b/.test(sectionText)) {
      label = "booking section";
      role = "booking";
    } else if (/\b(faq|question|questions|objection)\b/.test(sectionText)) {
      label = "faq";
      role = "faq";
    } else if (headingText) {
      label = headingText;
    } else {
      label = `Section ${index + 1}`;
    }

    if (label && !sections.some((section) => section.label === label)) {
      sections.push({ label, role });
    }
    index += 1;
  }

  return sections;
}

function extractSectionTextByRole(html: string, role: ObservedSection["role"]) {
  const sections = collectObservedSectionsFromHtml(html);
  const target = sections.find((section) => section.role === role);
  if (!target) return "";

  const raw = String(html || "");
  const sectionPattern = /<(section|header|main|article)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = sectionPattern.exec(raw)) !== null) {
    const observed = sections[index];
    if (observed?.role === role && observed.label === target.label) {
      return htmlToPlainText(match[0] || "");
    }
    index += 1;
  }
  return "";
}

function analyzeObservedPageDiffs(html: string, observedSections: ObservedSection[]): ObservedPageDiffSignal {
  const raw = String(html || "");
  const pageText = htmlToPlainText(raw);
  const heroText = extractSectionTextByRole(raw, "hero");
  const proofText = extractSectionTextByRole(raw, "proof");
  const headingMatch = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(raw);
  const heroHeadline = headingMatch ? htmlToPlainText(headingMatch[1] || "").trim() : "";
  const heroSupport = heroText.replace(heroHeadline, "").trim().slice(0, 220);
  const proofCopy = proofText.trim().slice(0, 220);
  const lowerPageText = pageText.toLowerCase();
  const lowerHeroHeadline = heroHeadline.toLowerCase();
  const lowerHeroSupport = heroSupport.toLowerCase();
  const lowerProofCopy = proofCopy.toLowerCase();

  const pageLooksBooking = /\b(book|booking|consultation|strategy call|schedule|calendar)\b/.test(lowerPageText);
  const hasGenericHero = Boolean(
    lowerHeroHeadline && /^(book a consultation|book now|schedule a call|get started|book a call)$/.test(lowerHeroHeadline)
      || /clear next step|serious buyers|take the next step|ready to get started/.test(lowerHeroSupport),
  );
  const hasGenericProof = Boolean(
    /trusted by .* markets|trusted by operators|multiple markets|social proof|real results/.test(lowerProofCopy),
  );
  const hasBookingExpectationCopy = /what happens|during the call|on the call|you leave with|who this is for|best fit|next step/.test(lowerPageText);
  const hasProofNearCta = observedSections.some((section, index) => section.role === "proof" && index <= 1);
  const hasDedicatedBookingSection = observedSections.some((section) => section.role === "booking");

  return {
    pageLooksBooking,
    heroHeadline,
    heroSupport,
    proofCopy,
    hasGenericHero,
    hasGenericProof,
    hasBookingExpectationCopy,
    hasProofNearCta,
    hasDedicatedBookingSection,
    sectionCount: observedSections.length,
  };
}

function normalizePlanTextWithResolvedTarget(text: string, originalTarget: string, resolvedTarget: string) {
  const compact = String(text || "");
  const original = String(originalTarget || "").trim();
  const resolved = String(resolvedTarget || "").trim();
  if (!compact || !original || !resolved || original.toLowerCase() === resolved.toLowerCase()) return compact;
  const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return compact.replace(new RegExp(escaped, "gi"), resolved);
}

function resolvePlanTargetAgainstObservedSections(target: string, observedSections: ObservedSection[]) {
  const normalized = String(target || "").trim().toLowerCase();
  if (!normalized) return "current page";
  if (["current page", "section flow", "cta path", "proof and booking handoff", "booking handoff", "proof", "hero", "faq", "booking section"].includes(normalized)) {
    return normalized;
  }

  const exactObserved = observedSections.find((section) => section.label.toLowerCase() === normalized);
  if (exactObserved) return exactObserved.label;

  const fuzzyObserved = observedSections.find((section) => normalized.includes(section.label.toLowerCase()) || section.label.toLowerCase().includes(normalized));
  if (fuzzyObserved) return fuzzyObserved.label;

  if (/\bhero\b/.test(normalized)) return observedSections.some((section) => section.role === "hero") ? "hero" : null;
  if (/\b(proof|testimonial|review|trust)\b/.test(normalized)) return observedSections.some((section) => section.role === "proof") ? "proof" : null;
  if (/\b(book|booking|schedule|cta|handoff|call to action)\b/.test(normalized)) {
    if (observedSections.some((section) => section.role === "booking")) return "booking section";
    return "cta path";
  }
  if (/\bfaq\b|question|objection/.test(normalized)) return observedSections.some((section) => section.role === "faq") ? "faq" : null;

  return null;
}

function vetSourceActionPlanAgainstObservedStructure(plan: SourceActionPlan | null, observedSections: ObservedSection[]): SourceActionPlan | null {
  if (!plan) return null;

  const moves: SourceActionPlanMove[] = [];
  for (const move of plan.moves) {
    const resolvedTarget = resolvePlanTargetAgainstObservedSections(move.target, observedSections);
    if (!resolvedTarget) continue;

    moves.push({
      ...move,
      target: resolvedTarget,
      change: normalizePlanTextWithResolvedTarget(move.change, move.target, resolvedTarget),
      why: normalizePlanTextWithResolvedTarget(move.why, move.target, resolvedTarget),
      ...(Array.isArray(move.diff)
        ? {
            diff: move.diff.map((item) => normalizePlanTextWithResolvedTarget(item, move.target, resolvedTarget)),
          }
        : {}),
    });
  }

  const firstMove = moves[0];
  if (!firstMove) return null;

  return {
    summary: normalizePlanTextWithResolvedTarget(plan.summary || firstMove.change, plan.moves[0]?.target || "", firstMove.target) || firstMove.change,
    moves,
    watchouts: plan.watchouts,
  };
}

function coerceSectionPlanItems(rawItems: unknown) {
  if (!Array.isArray(rawItems)) return [] as string[];
  const items: string[] = [];
  for (const rawItem of rawItems) {
    const item = typeof rawItem === "string" ? rawItem.trim().slice(0, 160) : "";
    if (!item || items.includes(item)) continue;
    items.push(item);
    if (items.length >= 8) break;
  }
  return items;
}

function coerceRegionSummaryList(rawItems: unknown) {
  if (!Array.isArray(rawItems)) return [] as Array<{ key: string; label: string; summary: string }>;
  return rawItems
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const entry = item as Record<string, unknown>;
      const key = typeof entry.key === "string" ? entry.key.trim().slice(0, 120) : "";
      const label = typeof entry.label === "string" ? entry.label.trim().slice(0, 120) : key;
      const summary = typeof entry.summary === "string" ? entry.summary.trim().slice(0, 240) : "";
      return { key, label, summary };
    })
    .filter((item) => item.key)
    .slice(0, 12);
}

function coerceSelectedRegion(rawRegion: unknown) {
  if (!rawRegion || typeof rawRegion !== "object" || Array.isArray(rawRegion)) return null;
  const entry = rawRegion as Record<string, unknown>;
  const key = typeof entry.key === "string" ? entry.key.trim().slice(0, 120) : "";
  if (!key) return null;
  return {
    key,
    label: typeof entry.label === "string" ? entry.label.trim().slice(0, 120) : key,
    summary: typeof entry.summary === "string" ? entry.summary.trim().slice(0, 240) : "",
  };
}

type ContextMedia = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

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

function toAbsoluteUrl(req: Request, url: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const origin = new URL(req.url).origin;
  return new URL(trimmed, origin).toString();
}

function isContextMediaImage(item: ContextMedia) {
  const mime = String(item.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(String(item.url || ""));
}

function isPrivateIpv4Hostname(hostname: string) {
  const match = /^((?:\d{1,3}\.){3}\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const parts = match[1].split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function canForwardImageUrlToAi(url: string) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return false;
  if (/^data:image\//i.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.trim().toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") return false;
    if (!hostname) return false;
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "127.0.0.1") return false;
    if (isPrivateIpv4Hostname(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function isRecoverableVisionRequestError(message: string) {
  return /(invalid_image_url|error while downloading|unsupported image|image url|response_format|json_object)/i.test(message);
}

function assessChatSpecificitySignal(input: { currentHtml: string; businessContext: string; sectionPlanItems: string[] }) {
  const text = htmlToPlainText(input.currentHtml);
  const genericPattern = /\b(your company|lorem ipsum|placeholder|book your consultation|learn more|get started|trusted by|premium session|strategy consultation|tailored solution)\b/i;
  const businessContextThin = input.businessContext.trim().length < 120;
  const pageThin = text.length < 500;
  const pageGeneric = genericPattern.test(text);
  const hasStructuredScaffold = input.sectionPlanItems.length >= 3;
  const underSpecified = (!input.currentHtml.trim() && !hasStructuredScaffold) || (!hasStructuredScaffold && pageThin) || pageGeneric || (!hasStructuredScaffold && businessContextThin);

  const reasons: string[] = [];
  if (!input.currentHtml.trim() && hasStructuredScaffold) reasons.push(`the page is still on a scaffold with ${joinHumanList(input.sectionPlanItems.slice(0, 4))}`);
  if (!input.currentHtml.trim() && !hasStructuredScaffold) reasons.push("the page draft is still effectively empty");
  if (pageThin && !hasStructuredScaffold) reasons.push("the page is still structurally thin");
  if (pageGeneric) reasons.push("the copy still reads generic instead of business-specific");
  if (businessContextThin && !hasStructuredScaffold) reasons.push("the saved business context is still thin");

  return {
    underSpecified,
    summary: underSpecified
      ? reasons.join("; ")
      : hasStructuredScaffold && !input.currentHtml.trim()
        ? `the page already has a section scaffold with ${joinHumanList(input.sectionPlanItems.slice(0, 5))}`
        : "the page has enough visible specificity for direct critique",
  };
}

function hasLikelyProofSurface(html: string) {
  return /\b(testimonial|review|reviews|trusted by|results?|outcomes?|proof|case stud|client stor|founder|director|saved \d+|increased|reduced)\b/i.test(String(html || ""));
}

function slugifyPlanKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page-upgrade";
}

function inferPlanTarget(title: string) {
  const text = String(title || "").toLowerCase();
  if (/first screen|opening|hero/.test(text)) return "hero";
  if (/proof/.test(text)) return "proof";
  if (/cta|action/.test(text)) return "cta path";
  if (/section|cadence|rhythm/.test(text)) return "section flow";
  return "current page";
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

function buildFoundationContextPromptBlock(foundation: ReturnType<typeof buildResolvedFunnelFoundation>) {
  return [
    "FOUNDATION_CONTEXT:",
    `- Headline: ${foundation.headline}`,
    `- Recommended foundation: ${foundation.summary}`,
    `- Conversion path: ${foundation.conversionPath}`,
    `- Business narrative: ${foundation.businessNarrative}`,
    `- Platform readiness: ${foundation.platformReadinessLabel}`,
    `- Section plan resolved: ${foundation.sectionPlan}`,
    foundation.recommendations.length
      ? `- Strategic recommendations: ${foundation.recommendations.slice(0, 4).join(" | ")}`
      : "",
    foundation.missingContext.length
      ? `- Missing context still being inferred: ${foundation.missingContext.join(", ")}`
      : "- Context coverage: strong enough for decisive critique.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildChatRequestInterpretationBlock(input: {
  prompt: string;
  selectedRegion: { key: string; label: string; summary: string } | null;
}) {
  const normalized = String(input.prompt || "").toLowerCase();
  const directives: string[] = [];

  if (/already true|do not mention changes that are already true|what is already true/.test(normalized)) {
    directives.push("Truthfulness rule: recommend only changes the current page does not already satisfy.");
  }
  if (/exactly what you would change|exactly what should change|tell me exactly/.test(normalized)) {
    directives.push("Response mode: give concrete ranked moves, not generic brainstorming or abstract design theory.");
  }
  if (/visual|polish|styling|style|surface|contrast|typography|cta treatment|art direction/.test(normalized)) {
    directives.push("Primary focus: visual surfaces, contrast, proof objects, CTA treatment, and styling discipline.");
  }
  if (/structural|flow|sequence|clarity|section|booking clarity|conversion path/.test(normalized)) {
    directives.push("Primary focus: section roles, proof placement, booking handoff, and CTA rhythm.");
  }
  if (input.selectedRegion) {
    directives.push(`Locality rule: anchor the critique to ${input.selectedRegion.label} before widening to the whole page.`);
  }

  if (!directives.length) return "";
  return ["REQUEST_INTERPRETATION:", ...directives.map((directive) => `- ${directive}`)].join("\n");
}

function wantsVisualPolishReview(prompt: string) {
  return /\b(visual|polish|styling|style|texture|contrast|surface|surfaces|background|backgrounds|palette|color|colors|tone|tones|shadow|depth|flat|boring|cheap|muddy|card|cards|hero treatment|cta treatment|real elements|visual element|visual elements|font|fonts|typography|vibe|vibes|mood|art direction)\b/i.test(prompt);
}

function analyzeVisualPolish(currentHtml: string) {
  const html = String(currentHtml || "").toLowerCase();
  const hasTextureOrDepth = /(linear-gradient|radial-gradient|background-image|box-shadow|shadow-|drop-shadow|backdrop-filter|backdrop-blur|filter:\s*blur|pattern|noise)/.test(html);
  const hasLayeredSurfaces = /(border-radius|rounded-|border[^a-z]|outline[^a-z]|ring-|shadow-|box-shadow|card|panel)/.test(html);
  const hasStrongContrastPairing = /(bg-white|#fff|#f8fafc|#f9fafb|#fafafa|white).{0,180}(#0f172a|#111827|#18181b|text-zinc-900|text-slate-900|text-gray-900|text-black)/.test(html)
    || /(bg-(?:slate|zinc|neutral|gray|stone)-9\d\d|#0f172a|#111827|#18181b).{0,180}(#fff|white|text-white|text-zinc-50|text-slate-50)/.test(html);
  const hasRealMediaElement = /<(img|svg|video|figure)\b/.test(html);
  const hasProofCards = /(testimonial|review|result|metric|stat|case study|client|founder|logo cloud|trusted by)/.test(html);
  const hasStyledCta = /<(a|button)\b[^>]*(background|bg-|border-radius|rounded-|box-shadow|shadow-|padding|px-|py-)/.test(html);

  const issues: string[] = [];
  if (!hasTextureOrDepth) issues.push("the page still feels flat because the large surfaces have almost no depth, texture, or atmospheric treatment");
  if (!hasLayeredSurfaces) issues.push("the layout lacks layered cards, panels, or section treatments that would make the page feel composed instead of raw");
  if (!hasStrongContrastPairing) issues.push("the contrast system is not clearly staged, so the page can read muddy or visually indecisive");
  if (!hasRealMediaElement) issues.push("the page is missing real visual anchors such as media, iconography, or proof objects");
  if (!hasProofCards) issues.push("proof is not embodied in actual visual elements like testimonial cards, metrics, or credibility clusters");
  if (!hasStyledCta) issues.push("the CTA treatment does not yet feel like a designed conversion object");

  return {
    hasTextureOrDepth,
    hasLayeredSurfaces,
    hasStrongContrastPairing,
    hasRealMediaElement,
    hasProofCards,
    hasStyledCta,
    issues,
    summary: issues.length
      ? issues.slice(0, 3).join("; ")
      : "the page already has some visual depth, layered surfaces, and CTA styling to build on",
  };
}

function buildVisualPolishFallbackSourceActionPlan(input: {
  currentHtml: string;
  selectedRegion: { key: string; label: string; summary: string } | null;
  sectionPlanItems: string[];
}) {
  const analysis = analyzeVisualPolish(input.currentHtml);
  const targetLabel = input.selectedRegion?.label || input.sectionPlanItems[0] || "hero";
  const selectorHint = input.selectedRegion ? `#${input.selectedRegion.key}` : undefined;
  const moves: SourceActionPlanMove[] = [];

  if (!analysis.hasTextureOrDepth || !analysis.hasLayeredSurfaces) {
    moves.push({
      key: `visual-surface-${slugifyPlanKey(targetLabel)}`,
      target: targetLabel,
      change: `Rebuild ${targetLabel} as a layered surface instead of a flat content slab.` ,
      why: "Visual polish depends on depth, separation, and intentional surfaces rather than raw text sitting on one uninterrupted background.",
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
      ...(selectorHint ? { selectorHint } : {}),
      diff: [
        "Background: flat white or generic wash -> warm off-white base with one distinct secondary surface band",
        "Container treatment: little or no depth -> 20-28px radius, subtle border, and soft shadow to create separation",
      ],
    });
  }

  if (!analysis.hasStrongContrastPairing) {
    moves.push({
      key: `visual-contrast-${slugifyPlanKey(targetLabel)}`,
      target: targetLabel,
      change: `Tighten the contrast system in ${targetLabel} so hierarchy reads immediately.` ,
      why: "If headline, body copy, and surfaces sit too close in value, the page feels muddy instead of premium.",
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
      ...(selectorHint ? { selectorHint } : {}),
      diff: [
        "Headlines: mid-gray treatment -> dark ink headline color with clearer weight contrast",
        "Body/support copy: inconsistent low-contrast gray -> disciplined secondary text color that still reads cleanly on light surfaces",
      ],
    });
  }

  if (!analysis.hasRealMediaElement || !analysis.hasProofCards) {
    moves.push({
      key: `visual-proof-${slugifyPlanKey(targetLabel)}`,
      target: targetLabel,
      change: `Introduce real visual proof objects near ${targetLabel} instead of relying on text alone.` ,
      why: "Premium pages feel designed when proof is embodied in objects like testimonial cards, metrics, portrait/media, or operator credibility modules.",
      priority: "secondary",
      executionMode: "model-led",
      confidence: "medium",
      ...(selectorHint ? { selectorHint } : {}),
      diff: [
        "Support area: plain paragraph stack -> testimonial or metric card cluster with explicit hierarchy",
        "Visual anchor: none or generic filler -> real media, iconography, or credibility object that breaks text monotony",
      ],
    });
  }

  if (!analysis.hasStyledCta) {
    moves.push({
      key: `visual-cta-${slugifyPlanKey(targetLabel)}`,
      target: targetLabel,
      change: `Turn the primary CTA into a designed conversion object instead of a bare link or generic button.` ,
      why: "The booking handoff should feel intentional, obvious, and tactile when the visitor reaches it.",
      priority: "secondary",
      executionMode: "model-led",
      confidence: "medium",
      ...(selectorHint ? { selectorHint } : {}),
      diff: [
        "CTA styling: default button/link treatment -> filled primary button with distinct radius, padding, and contrast",
        "CTA framing: isolated action -> button paired with a short reassurance line or proof cue immediately around it",
      ],
    });
  }

  if (!moves.length) return null;

  return {
    summary: moves[0]?.change || `Polish ${targetLabel} with stronger surfaces, contrast, and proof treatment.`,
    moves: moves.slice(0, 4),
    watchouts: ["Do not add decorative styling that competes with the booking action or muddies readability."],
  } satisfies SourceActionPlan;
}

function buildScaffoldAwareFallbackSourceActionPlan(sectionPlanItems: string[]): SourceActionPlan | null {
  const moves: SourceActionPlanMove[] = sectionPlanItems.slice(0, 5).map((label, index) => {
    const normalized = label.toLowerCase();
    if (normalized.includes("hero")) {
      return {
        key: "scaffold-hero-upgrade",
        target: label,
        change: `Turn ${label} from a placeholder heading into a specific promise, qualifier, and booking CTA cluster.`,
        why: "The scaffold already reserves the opening beat, so the next pass should make that first decision moment concrete instead of generic.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      } satisfies SourceActionPlanMove;
    }
    if (normalized.includes("proof") || normalized.includes("testimonial")) {
      return {
        key: `scaffold-${slugifyPlanKey(label)}`,
        target: label,
        change: `Replace the placeholder ${label} content with concrete proof tied directly to the booking ask.`,
        why: "Trust should be staged near the first CTA and supported by real outcomes instead of generic reassurance.",
        priority: index <= 1 ? "primary" : "secondary",
        executionMode: "model-led",
        confidence: "high",
      } satisfies SourceActionPlanMove;
    }
    if (normalized.includes("benefit") || normalized.includes("detail") || normalized.includes("process")) {
      return {
        key: `scaffold-${slugifyPlanKey(label)}`,
        target: label,
        change: `Use ${label} to explain fit, process, and outcome logic instead of leaving it as generic filler.`,
        why: "This is where the scaffold should earn the booking handoff by clarifying what the visitor gets and what happens next.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "medium",
      } satisfies SourceActionPlanMove;
    }
    if (normalized.includes("cta") || normalized.includes("book") || normalized.includes("schedule")) {
      return {
        key: `scaffold-${slugifyPlanKey(label)}`,
        target: label,
        change: `Make ${label} the explicit booking handoff with one dominant action and reassurance immediately around it.`,
        why: "The scaffold already has a closing action beat, so the next pass should make that conversion moment specific and trustworthy.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      } satisfies SourceActionPlanMove;
    }
    return {
      key: `scaffold-${slugifyPlanKey(label)}`,
      target: label,
      change: `Replace the placeholder ${label} content with business-specific copy and a clearer role in the conversion flow.`,
      why: "Each scaffold section should have a concrete job in the page instead of staying as a neutral placeholder.",
      priority: index === 0 ? "primary" : "secondary",
      executionMode: "model-led",
      confidence: index === 0 ? "high" : "medium",
    } satisfies SourceActionPlanMove;
  });

  if (!moves.length) return null;

  return {
    summary: moves[0]?.change || "Upgrade the scaffold into a real conversion page.",
    moves,
    watchouts: ["Do not rebuild the section order until the scaffold sections have been made specific."],
  };
}

function buildFallbackSourceActionPlan(sceneQuality: ReturnType<typeof assessFunnelSceneQuality>): SourceActionPlan {
  const moves: SourceActionPlanMove[] = sceneQuality.structuralPriorities.slice(0, 3).map((item, index) => ({
    key: slugifyPlanKey(item.title),
    target: inferPlanTarget(item.title),
    change: item.detail,
    why: index === 0 ? sceneQuality.dominantIssue.detail : `This resolves ${item.title.toLowerCase()} in the current page flow.`,
    priority: index === 0 ? "primary" : "secondary",
    executionMode: "model-led",
    confidence: index === 0 ? "high" : "medium",
  }));

  return {
    summary: moves[0]?.change || "Tighten the current page around a clearer conversion path.",
    moves,
    watchouts: [sceneQuality.dominantIssue.detail].filter(Boolean),
  };
}

function buildIntentAwareFallbackSourceActionPlan(input: {
  currentHtml: string;
  intentProfile: FunnelPageIntentProfile;
  shellFrame: ReturnType<typeof resolveFunnelShellFrame>;
  foundation: ReturnType<typeof buildResolvedFunnelFoundation>;
  sectionPlanItems: string[];
  selectedRegion: { key: string; label: string; summary: string } | null;
}): SourceActionPlan | null {
  const text = htmlToPlainText(input.currentHtml).toLowerCase();
  const selectedLabel = input.selectedRegion?.label || input.sectionPlanItems[0] || "hero";
  const pageType = input.intentProfile.pageType;
  const sections = countMatches(input.currentHtml, /<section\b/gi);
  const hasBookingExpectationSetting = /\b(what happens|during the call|on the call|session includes|leave with|best fit|who this is for|next step)\b/.test(text);
  const hasNamedProof = /\b(testimonial|review|results?|case study|trusted by|operators|founder|client)\b/.test(text);
  const hasClearBookingHandoff = /\b(book|booking|schedule|available times|scheduler|consultation|strategy call)\b/.test(text);
  const hasOfferSpecificity = /\b(audit|assessment|consultation|implementation|workflow|automation|strategy)\b/.test(text);
  const hasScaffoldCopy = /frame the consultation|provide trust markers|book a call|hero|proofstrip|testimonialgrid|ctasection/.test(text);
  const moves: SourceActionPlanMove[] = [];

  if (pageType === "booking" || input.intentProfile.formStrategy === "booking") {
    if (hasScaffoldCopy) {
      moves.push({
        key: "booking-hero-specificity",
        target: "hero",
        change: `Replace the scaffold hero copy with an outcome-led promise for ${input.foundation.audience} that makes ${input.foundation.offer} feel worth booking now.`,
        why: "The current hero still reads like setup copy, so it is not yet carrying the authority or specificity expected from this booking page.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
      moves.push({
        key: "booking-proof-specificity",
        target: "proof strip",
        change: "Replace placeholder trust-strip language with named proof, concrete outcomes, or authority signals that directly support the booking decision.",
        why: "A booking page needs proof that reduces hesitation before the visitor reaches the scheduler, not a placeholder reminder that proof should exist.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
    }
    if (!hasOfferSpecificity) {
      moves.push({
        key: `booking-offer-${slugifyPlanKey(selectedLabel)}`,
        target: selectedLabel,
        change: `Rewrite ${selectedLabel} so it frames ${input.foundation.offer} for ${input.foundation.audience} instead of sounding like a generic consultation page.`,
        why: `The stored page intent expects a ${input.foundation.shellFrameLabel.toLowerCase()} shell, so the opening needs clearer offer and audience filtering before the booking ask.`,
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
        ...(input.selectedRegion ? { selectorHint: `#${input.selectedRegion.key}` } : {}),
      });
    }
    if (!hasNamedProof) {
      moves.push({
        key: "booking-proof-handoff",
        target: "proof and booking handoff",
        change: "Stage concrete proof close to the first CTA and repeat reassurance at the booking handoff instead of leaving the scheduler to stand alone.",
        why: `The resolved shell frame expects proof to support ${input.foundation.primaryCta.toLowerCase()} before visitors hit the booking step.`,
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
    }
    if (!hasBookingExpectationSetting || !hasClearBookingHandoff) {
      moves.push({
        key: "booking-expectations",
        target: "booking section",
        change: "Clarify who the session is for, what happens on the call, and what the visitor leaves with right at the booking handoff.",
        why: "Booking clarity improves when the scheduler is framed as a concrete next step instead of a naked action widget.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "high",
      });
    }
    if (sections <= 2) {
      moves.push({
        key: "booking-structure",
        target: "section flow",
        change: "Insert the missing trust and expectation beats between the opening, proof, and booking handoff so the page earns the existing CTA instead of jumping there too early.",
        why: "The resolved section plan is more developed than the current surface, so the page still needs its core trust and expectation beats.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "medium",
      });
    }
  }

  if (!moves.length) return null;

  return {
    summary: moves[0]?.change || `Tighten ${selectedLabel} around the resolved page intent.`,
    moves: moves.slice(0, 4),
    watchouts: [
      `Keep the critique aligned to the resolved conversion path: ${input.foundation.conversionPath}`,
    ],
  };
}

function buildObservedPageDiffSourceActionPlan(input: {
  currentHtml: string;
  observedSections: ObservedSection[];
  foundation: ReturnType<typeof buildResolvedFunnelFoundation>;
  selectedRegion: { key: string; label: string; summary: string } | null;
  visualPolishRequested: boolean;
}): SourceActionPlan | null {
  const observed = analyzeObservedPageDiffs(input.currentHtml, input.observedSections);
  if (!observed.pageLooksBooking) return null;

  const moves: SourceActionPlanMove[] = [];
  const targetLabel = input.selectedRegion?.label || (input.observedSections[0]?.role === "hero" ? "hero" : input.observedSections[0]?.label || "current page");
  const selectorHint = input.selectedRegion ? `#${input.selectedRegion.key}` : undefined;

  if (observed.hasGenericHero) {
    moves.push({
      key: "observed-hero-offer-clarity",
      target: "hero",
      change: `Rewrite the hero so it promises a specific outcome for ${input.foundation.audience} instead of using generic consultation language.`,
      why: `The current opening still reads as '${observed.heroHeadline || "generic booking copy"}', so it does not yet explain why this booking matters now.`,
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
      ...(selectorHint ? { selectorHint } : {}),
      diff: [
        `Headline: ${observed.heroHeadline || "generic booking headline"} -> outcome-led promise tied to ${input.foundation.offer}`,
        `Support copy: ${observed.heroSupport || "generic support line"} -> concrete fit and payoff statement for the right buyer`,
      ],
    });
  }

  if (observed.hasGenericProof) {
    moves.push({
      key: "observed-proof-specificity",
      target: observed.hasProofNearCta ? "proof" : "proof strip",
      change: "Replace the generic trust line with specific proof like named outcomes, client types, or credibility markers that earn the booking ask.",
      why: `The current proof copy still reads as '${observed.proofCopy || "generic trust language"}', which signals credibility loosely but does not actually prove the offer.`,
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
    });
  }

  if (!observed.hasBookingExpectationCopy) {
    moves.push({
      key: "observed-booking-expectations",
      target: observed.hasDedicatedBookingSection ? "booking section" : "cta path",
      change: "Clarify the existing CTA handoff with a short expectation-setting line that explains who the call is for, what happens next, and what the visitor gets from booking.",
      why: "The page asks for the booking, but it does not yet reduce uncertainty around the handoff.",
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
    });
  }

  if (observed.sectionCount <= 2 && !observed.hasDedicatedBookingSection) {
    moves.push({
      key: "observed-booking-structure",
      target: "section flow",
      change: "Insert one compact expectation or handoff section after proof so the page moves from promise to trust to a clearer next step instead of stopping after a generic proof band.",
      why: "With only a hero and proof section, the page does not yet bridge trust into a fully earned booking decision.",
      priority: "secondary",
      executionMode: "model-led",
      confidence: "high",
    });
  }

  if (input.visualPolishRequested) {
    moves.push({
      key: `observed-visual-surface-${slugifyPlanKey(targetLabel)}`,
      target: targetLabel,
      change: `Turn ${targetLabel} into a designed surface with stronger depth and separation instead of leaving it as a plain white content band.`,
      why: "The current page is visually thin, so the booking page still looks like a draft rather than a credible conversion surface.",
      priority: moves.length ? "secondary" : "primary",
      executionMode: "model-led",
      confidence: "high",
      ...(selectorHint ? { selectorHint } : {}),
      diff: [
        "Section surface: plain flat band -> contained panel or layered band with subtle border and shadow",
        "Proof treatment: simple paragraph -> distinct trust module with visual separation from the hero",
      ],
    });
  }

  if (!moves.length) return null;

  return {
    summary: moves[0]?.change || "Tighten the page around a clearer booking story.",
    moves: moves.slice(0, 4),
    watchouts: [
      "Do not invent extra sections that are not needed; keep the next pass focused on specific missing booking clarity.",
    ],
  };
}

function isThinAssistantReply(text: string) {
  const compact = String(text || "").trim();
  if (!compact) return true;
  if (compact.length < 160) return true;
  const sentenceCount = compact.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  const lineCount = compact.split(/\n+/).filter((line) => line.trim()).length;
  return sentenceCount < 2 && lineCount < 3;
}

function stripFutureActionLead(text: string) {
  const compact = String(text || "").trim().replace(/\s+/g, " ");
  if (!compact) return "";
  if (/\b(i|we|pura)\s+will\b|\bgoing to\b|\babout to\b/i.test(compact)) return "";
  return compact;
}

function analyzeCurrentPageState(currentHtml: string, sectionPlanItems: string[] = []) {
  const html = String(currentHtml || "").toLowerCase();
  const sectionLabels = sectionPlanItems.map((item) => String(item || "").toLowerCase());
  const pageText = htmlToPlainText(currentHtml).toLowerCase();
  const hasLightSurface = /bg-white|background(?:-color)?\s*:\s*(?:white|#fff(?:fff)?\b|#f8fafc\b|#f9fafb\b|#fafafa\b|rgb\(255\s*,\s*255\s*,\s*255\)|rgba\(255\s*,\s*255\s*,\s*255\s*,)|from-white|to-white/.test(html);
  const hasDarkReadableText = /text-(?:black|zinc-9\d\d|slate-9\d\d|gray-9\d\d|neutral-9\d\d)|color\s*:\s*(?:#0f172a\b|#111827\b|#18181b\b|#000\b|black\b|rgb\(15\s*,\s*23\s*,\s*42\)|rgb\(17\s*,\s*24\s*,\s*39\))/.test(html);
  const hasHeroSection = sectionLabels.some((label) => /hero|opening|headline/.test(label)) || /<h1\b|hero|headline/.test(html);
  const hasProofSection = sectionLabels.some((label) => /proof|testimonial|review|credib|trust/.test(label)) || /testimonial|review|proof|trusted by|results?|case stud/.test(pageText);
  const hasCtaSection = sectionLabels.some((label) => /cta|book|schedule|call to action|handoff/.test(label)) || /book|schedule|call|consultation/.test(pageText);
  const hasBookingExpectationCopy = /what happens|during the call|on the call|session includes|leave with|who this is for|best fit|next step|what to expect/.test(pageText);
  const hasConcreteOfferCopy = /audit|assessment|consultation|implementation|workflow|automation|strategy|quote|diagnostic/.test(pageText);
  const hasSpecificProofCopy = /case stud|results?|saved \d+|increased|reduced|operators across|founder|client/.test(pageText);
  return {
    hasLightSurface,
    hasDarkReadableText,
    hasHeroSection,
    hasProofSection,
    hasCtaSection,
    hasBookingExpectationCopy,
    hasConcreteOfferCopy,
    hasSpecificProofCopy,
  };
}

function moveLooksAlreadyTrueOnCurrentPage(move: SourceActionPlanMove, currentState: ReturnType<typeof analyzeCurrentPageState>) {
  const text = `${move.target} ${move.change} ${move.why}`.toLowerCase();
  const wantsLightSurface = /\b(white|near-white|lighter|lighten|light background|lighter background|white background|brighten)\b/.test(text)
    && /\b(background|surface|section|card|band|panel|hero)\b/.test(text);
  if (wantsLightSurface && currentState.hasLightSurface) return true;

  const wantsDarkReadableText = /\b(darken text|darker text|dark text|readable text|better contrast|improve contrast|increase contrast|text contrast|text color)\b/.test(text);
  if (wantsDarkReadableText && currentState.hasDarkReadableText) return true;

  const wantsProofAddition = /\b(add|introduce|include|place|move|replace)\b/.test(text)
    && /\b(testimonial|testimonials|review|reviews|social proof|trust markers|trust logos|proof)\b/.test(text);
  if (wantsProofAddition && currentState.hasProofSection) return true;

  const wantsSpecificProof = /\b(named proof|concrete proof|specific proof|credibility markers|named outcomes|client types|proof tied directly)\b/.test(text);
  if (wantsSpecificProof && currentState.hasSpecificProofCopy) return true;

  const wantsBookingActionAddition = /\b(add|introduce|include|make)\b/.test(text)
    && /\b(booking cta|book(?:ing)? handoff|call to action|cta|schedule|book a call|book now)\b/.test(text);
  if (wantsBookingActionAddition && currentState.hasCtaSection) return true;

  const wantsBookingExpectation = /\b(who the call is for|what happens next|what happens on the call|what the visitor gets|expectation-setting|what to expect|leave with)\b/.test(text);
  if (wantsBookingExpectation && currentState.hasBookingExpectationCopy) return true;

  const wantsHeroAddition = /\b(add|introduce|create)\b/.test(text)
    && /\b(hero|headline|opening cluster|first screen)\b/.test(text);
  if (wantsHeroAddition && currentState.hasHeroSection) return true;

  const wantsOfferClarification = /\b(outcome-led promise|generic consultation language|does not yet explain why this booking matters|frames .* instead of sounding generic|specific outcome)\b/.test(text);
  if (wantsOfferClarification && currentState.hasConcreteOfferCopy) return true;

  return false;
}

function vetSourceActionPlanAgainstCurrentPage(plan: SourceActionPlan | null, currentHtml: string, sectionPlanItems: string[] = []): SourceActionPlan | null {
  if (!plan) return null;
  const currentState = analyzeCurrentPageState(currentHtml, sectionPlanItems);
  const moves = plan.moves.filter((move) => !moveLooksAlreadyTrueOnCurrentPage(move, currentState));
  if (!moves.length) return null;
  return {
    summary: moves[0]?.change || plan.summary,
    moves,
    watchouts: plan.watchouts,
  };
}

function ensurePlanAnchorsSelectedRegion(
  plan: SourceActionPlan | null,
  selectedRegion: { key: string; label: string; summary: string } | null,
) {
  if (!selectedRegion) return plan;

  const regionNeedle = `${selectedRegion.key} ${selectedRegion.label}`.toLowerCase();
  const existingMoves = plan?.moves || [];
  const alreadyAnchored = existingMoves.some((move) => {
    const haystack = `${move.target} ${move.change} ${move.why} ${move.selectorHint || ""}`.toLowerCase();
    return regionNeedle.split(/\s+/).filter(Boolean).some((token) => token.length > 2 && haystack.includes(token));
  });
  if (alreadyAnchored) return plan;

  const anchoredMove: SourceActionPlanMove = {
    key: `focus-${slugifyPlanKey(selectedRegion.key || selectedRegion.label)}`,
    target: selectedRegion.label,
    change: `Start with ${selectedRegion.label} and keep the next pass anchored to that live region before changing anything broader.`,
    why: "The user is pointing at this exact draft region, so the plan should stay local to what is being critiqued instead of drifting into a generic page-wide rewrite.",
    priority: "primary",
    executionMode: "bounded-edit",
    confidence: "high",
    selectorHint: `#${selectedRegion.key}`,
    diff: ["Scope: generic page-wide advice -> targeted changes applied to this exact live region first"],
  };

  return {
    summary: anchoredMove.change,
    moves: [anchoredMove, ...existingMoves].slice(0, 5),
    watchouts: plan?.watchouts || [],
  };
}

function buildStructuredAssistantReply(input: {
  sceneQuality: ReturnType<typeof assessFunnelSceneQuality>;
  plan: SourceActionPlan | null;
  specificitySignal: ReturnType<typeof assessChatSpecificitySignal>;
  assistantText?: string;
  sectionPlanItems?: string[];
  hasCurrentHtml?: boolean;
  visualPolishSummary?: string;
}) {
  const moves = (input.plan?.moves || []).slice(0, 3);
  const preferredLead = stripFutureActionLead(input.assistantText || "");
  const lead = preferredLead || input.plan?.summary || (!input.hasCurrentHtml && (input.sectionPlanItems?.length || 0) > 0
    ? `This page is still on its initial scaffold. The next pass should turn ${joinHumanList((input.sectionPlanItems || []).slice(0, 3))} from placeholder structure into a real conversion sequence.`
    : input.visualPolishSummary
      ? `The main visual gap right now: ${input.visualPolishSummary}.`
      : input.sceneQuality.dominantIssue.detail);
  const moveLines = moves.length
    ? moves.map((move) => `- ${move.change} — ${move.why}`)
    : [`- ${input.sceneQuality.dominantIssue.detail}`];
  const closing = input.specificitySignal.underSpecified
    ? "If you want, I can turn these into an anchored pass on the hero, proof strip, or booking handoff without waiting for more setup."
    : "Reply with the exact section you want pushed harder and I will keep the next pass anchored there.";

  return [lead, "", "What I would change next:", ...moveLines, "", closing].join("\n");
}

function shouldForceStructuredAssistantReply(text: string, plan: SourceActionPlan | null) {
  const compact = String(text || "").trim();
  if (!compact) return true;
  if (isThinAssistantReply(compact)) return true;
  if (/(^|\n)\s*[-*]/.test(compact)) return false;
  if (/what i would change next:/i.test(compact)) return false;
  return Boolean(plan?.moves?.length);
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

  const body = (await req.json().catch(() => null)) as any;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });
  const useLiveState = body?.useLiveState === true;
  const currentHtmlFromClient = typeof body?.currentHtml === "string" ? body.currentHtml : "";
  const clientSectionPlanItems = coerceSectionPlanItems(body?.sectionPlanItems);
  const selectedRegion = coerceSelectedRegion(body?.selectedRegion);
  const allRegions = coerceRegionSummaryList(body?.allRegions);
  const contextMedia = coerceContextMedia(body?.contextMedia);
  const designContext = sanitizeFunnelDesignContext(body?.designContext);

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: withDraftHtmlSelect(
      {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        blocksJson: true,
        customHtml: true,
        customChatJson: true,
        funnel: { select: { id: true, slug: true, name: true } },
      },
      hasDraftHtml,
    ),
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const normalizedPage = normalizeDraftHtml(page);
  const ownerId = auth.session.user.id;
  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId }, select: { dataJson: true } })
    .catch(() => null);
  const persistedSectionPlanItems = collectSectionPlanItemsFromBlocks(normalizedPage.blocksJson);
  const sectionPlanItems = useLiveState
    ? clientSectionPlanItems
    : clientSectionPlanItems.length
      ? clientSectionPlanItems
      : persistedSectionPlanItems;

  const [businessContext, businessProfileContext] = await Promise.all([
    getBusinessProfileAiContext(ownerId).catch(() => ""),
    getBusinessProfileFoundationContext(ownerId).catch(() => null),
  ]);
  const routeLabel = buildFunnelPageRouteLabel(normalizedPage.funnel.slug, normalizedPage.slug);
  const funnelBrief = inferFunnelBriefProfile({
    existing: body?.funnelBrief || readFunnelBrief(settings?.dataJson ?? null, normalizedPage.funnel.id),
    funnelName: normalizedPage.funnel.name,
    funnelSlug: normalizedPage.funnel.slug,
  });
  const intentProfile = inferFunnelPageIntentProfile({
    existing: body?.intentProfile || readFunnelPageBrief(settings?.dataJson ?? null, normalizedPage.id),
    prompt,
    funnelBrief,
    funnelName: normalizedPage.funnel.name,
    funnelSlug: normalizedPage.funnel.slug,
    pageTitle: normalizedPage.title,
    pageSlug: normalizedPage.slug,
  });
  const shellFrame = resolveFunnelShellFrame({
    frameId: intentProfile.shellFrameId,
    pageType: intentProfile.pageType,
    formStrategy: intentProfile.formStrategy,
    audience: intentProfile.audience,
    offer: intentProfile.offer,
    companyContext: intentProfile.companyContext,
    pageGoal: intentProfile.pageGoal,
    primaryCta: intentProfile.primaryCta,
  });
  const foundation = buildResolvedFunnelFoundation({
    brief: funnelBrief,
    intent: intentProfile,
    routeLabel,
    funnelName: normalizedPage.funnel.name,
    pageTitle: normalizedPage.title,
    businessProfile: businessProfileContext,
  });
  const currentHtml = useLiveState
    ? currentHtmlFromClient
    : (currentHtmlFromClient.trim() ? currentHtmlFromClient : getFunnelPageCurrentHtml(normalizedPage));
  const observedSections = collectObservedSectionsFromHtml(currentHtml);
  const observedSectionPlanItems = collectObservedSectionLabelsFromHtml(currentHtml);
  const critiqueSectionPlanItems = observedSectionPlanItems.length ? observedSectionPlanItems : sectionPlanItems;
  const visualPolishRequested = wantsVisualPolishReview(prompt);
  const visualPolishAnalysis = analyzeVisualPolish(currentHtml);
  const specificitySignal = assessChatSpecificitySignal({ currentHtml, businessContext, sectionPlanItems: critiqueSectionPlanItems });
  const sceneQuality = assessFunnelSceneQuality({
    pageAnatomy: buildFragmentSceneAnatomy(currentHtml, ""),
    proofResolved: hasLikelyProofSurface(currentHtml),
    ctaResolved: /<(a|button|form|input|textarea|select)\b/i.test(currentHtml),
    sectionPlanItems: critiqueSectionPlanItems,
  });
  const visualWhyBlock = buildFunnelVisualWhyBlock({
    prompt,
    pageType: intentProfile.pageType,
    shellFrame,
    archetypes: [],
  });
  const requestInterpretationBlock = buildChatRequestInterpretationBlock({ prompt, selectedRegion });
  const buildFallbackChatPlan = () => {
    const observedPageDiffPlan = buildObservedPageDiffSourceActionPlan({
      currentHtml,
      observedSections,
      foundation,
      selectedRegion,
      visualPolishRequested,
    });
    const intentAwareFallbackPlan = buildIntentAwareFallbackSourceActionPlan({
      currentHtml,
      intentProfile,
      shellFrame,
      foundation,
      sectionPlanItems: critiqueSectionPlanItems,
      selectedRegion,
    });
    const visualFallbackPlan = visualPolishRequested
      ? buildVisualPolishFallbackSourceActionPlan({
          currentHtml,
          selectedRegion,
          sectionPlanItems: critiqueSectionPlanItems,
        })
      : null;
    const scaffoldFallbackPlan = (!observedSectionPlanItems.length && (!currentHtml.trim() || specificitySignal.underSpecified))
      ? buildScaffoldAwareFallbackSourceActionPlan(sectionPlanItems)
      : null;

    const contextAwarePlan = mergeSourceActionPlans(
      observedPageDiffPlan,
      mergeSourceActionPlans(
        visualFallbackPlan,
        mergeSourceActionPlans(intentAwareFallbackPlan, scaffoldFallbackPlan),
      ),
    );

    if (contextAwarePlan?.moves.length && contextAwarePlan.moves.length >= 2) {
      return contextAwarePlan;
    }

    return mergeSourceActionPlans(contextAwarePlan, buildFallbackSourceActionPlan(sceneQuality));
  };

  // Build prior chat history for context window (last 10 messages, strip intent-only messages)
  const prevChat = Array.isArray(normalizedPage.customChatJson)
    ? (stripFunnelPageIntentMessages<Record<string, unknown>>(normalizedPage.customChatJson) as Array<{
        role: string;
        content: string;
        at?: string;
      }>)
    : [];

  const chatHistory = prevChat
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map((m) => {
      const content = String(m.content);
      if (m.role === "assistant") {
        const plan = (m as Record<string, unknown>).sourceActionPlan as SourceActionPlan | null | undefined;
        const sanitizedPlan = vetSourceActionPlanAgainstObservedStructure(
          vetSourceActionPlanAgainstCurrentPage(plan || null, currentHtml, critiqueSectionPlanItems),
          observedSections,
        );
        if (sanitizedPlan?.moves?.length) {
          const planLines = sanitizedPlan.moves
            .slice(0, 4)
            .map((move) => `- ${move.target}: ${move.change}`)
            .join("\n");
          return {
            role: "assistant" as const,
            content: `[Previously recommended moves on this page:\n${planLines}]`,
          };
        }
        return null;
      }
      return { role: m.role as "user" | "assistant", content };
    })
    .filter((entry): entry is { role: "user" | "assistant"; content: string } => Boolean(entry));

  // Page context summary injected into the system prompt
  const pageContextBlock = [
    `Funnel: ${normalizedPage.funnel.name}`,
    `Page: ${normalizedPage.title}`,
    `Route: ${routeLabel}`,
    useLiveState ? "State anchor: use the exact live draft state from the editor for this turn, not the last saved server snapshot." : "",
    critiqueSectionPlanItems.length ? `Current observed sections: ${critiqueSectionPlanItems.join(" -> ")}` : "",
    sectionPlanItems.length ? `Stored builder sections: ${sectionPlanItems.join(" -> ")}` : "",
    selectedRegion ? `Current focus region: ${selectedRegion.label}${selectedRegion.summary ? ` - ${selectedRegion.summary}` : ""}` : "",
    allRegions.length ? `Current source regions: ${allRegions.map((region) => `${region.label}${region.summary ? ` (${region.summary})` : ""}`).join(" | ")}` : "",
    buildPageHtmlContextBlock(currentHtml, selectedRegion),
  ]
    .filter(Boolean)
    .join("\n\n");

  const businessBlock = businessContext ? `Business context:\n${clampText(businessContext, 1200)}` : "";
  const funnelBriefBlock = buildFunnelBriefPromptBlock(funnelBrief);
  const intentProfileBlock = buildFunnelPageIntentPromptBlock(intentProfile, routeLabel, businessProfileContext);
  const shellFrameBlock = buildShellFramePromptBlock(shellFrame);
  const foundationContextBlock = buildFoundationContextPromptBlock(foundation);
  const specificityBlock = `Current specificity signal: ${specificitySignal.summary}.`;
  const sceneQualityBlock = [
    "Current scene diagnosis:",
    `- Dominant issue: ${sceneQuality.dominantIssue.title}. ${sceneQuality.dominantIssue.detail}`,
    ...sceneQuality.structuralPriorities.slice(0, 3).map((item, index) => `- Priority ${index + 1}: ${item.title}. ${item.detail}`),
  ].join("\n");
  const visualPolishBlock = [
    `Visual polish requested: ${visualPolishRequested ? "yes" : "no"}`,
    `Visual polish diagnosis: ${visualPolishAnalysis.summary}.`,
  ].join("\n");
  const contextMediaBlock = contextMedia.length
    ? [
        "Selected visual references:",
        ...contextMedia.map((item) => {
          const name = item.fileName ? ` ${item.fileName}` : "";
          const mime = item.mimeType ? ` (${item.mimeType})` : "";
          return `- ${name}${mime}: ${toAbsoluteUrl(req, item.url)}`.trim();
        }),
      ].join("\n")
    : "";
  const designContextBlock = buildFunnelDesignContextPromptBlock(designContext);
  const contextImageUrls = contextMedia
    .filter((item) => isContextMediaImage(item))
    .map((item) => toAbsoluteUrl(req, item.url))
    .filter((url) => canForwardImageUrlToAi(url))
    .filter(Boolean)
    .slice(0, 8);

  const system = [
    // Role
    "You are Pura, an embedded AI design partner inside a funnel page builder. You are direct, honest, and practical.",
    "Your job: reason like a funnel operator, not a generic design critic. Diagnose the current page against the intended conversion blueprint, decide what changes first, and tell the user exactly what Pura will do. Plan it. Do not rewrite the page here.",
    "Always think in this order: page job -> shell posture -> section sequence -> proof placement -> CTA rhythm -> current-state diffs.",
    "If the page is weak, explain the gap between the current page and the intended funnel blueprint. Do not drift into generic taste commentary.",

    // Tone and voice
    "Be direct. Never say 'Great question', 'Certainly', 'Of course', or any filler affirmation. Never start a reply with 'I'.",
    "Write assistantText in plain prose. No markdown bold (**), no headers (###), no numbered lists with formatting. Dashes (-) for bullet lists only.",
    "Do not include confidence level, executionMode, priority, selectorHint, or diff field labels inside assistantText. Those fields exist only in sourceActionPlan.moves and are not visible to the user.",

    // Intent handling
    "If the user sounds confused, lost, or says they do not know what to do: open with one sentence that orients them to where the page is now, then list the 2-3 most important moves. Do not overwhelm them.",
    "If the user is vague (says 'make it better', 'fix it', 'help me'): pick the most impactful move from the current page and lead with that decision. Do not ask clarifying questions unless truly blocked.",
    "If the user asks a precise question (about CTA position, proof proximity, hierarchy, conversion flow): answer it directly and specifically. Do not hedge.",
    "If the user wants to book more clients or has a business goal: translate that goal into page-level moves. Tell them what on the page is costing them and what to change first.",
    "Treat the funnel as a system with required jobs: attention, belief building, proof, mechanism, CTA, reinforcement, and handoff. Work out which jobs are weak or missing before proposing style changes.",
    "When stored brief, page intent, shell frame, or foundation context exists, treat it as the intended blueprint. Compare the live page to that blueprint and return diffs, not generic advice.",

    // Move quality rules
    "When enough page context exists, sourceActionPlan should contain 3-5 concrete moves tied to the current page structure.",
    "Prefer moves like: tighten hero hierarchy, move proof beside the CTA, clarify the booking handoff, cut low-value sections, restage CTA rhythm.",
    "If current builder sections are provided, anchor moves to those exact sections. Do not propose new structure until existing sections are specific.",
    "If the page is still on a scaffold, describe how Pura will upgrade the existing scaffold sections. Do not pretend the page already has finished business-specific copy.",
    "Each move should read like a page diff: what is there now, what it should become, and why that change helps conversion.",
    "Prefer section-level diffs over general advice. Example: 'Hero proof is generic placeholder text -> replace it with named result proof beside the first booking CTA.'",
    "If a move depends on a funnel role, name that role explicitly: proof, qualification, scheduling, intake, confirmation, reinforcement, or media.",
    "Do not use the word 'resources'. Name the actual thing you need: a proof point, an offer detail, a booking URL, a founder story, a specific outcome number.",
    "Before asking for anything, first use the page context, business context, and prior chat thread.",

    // Visual polish rules
    "For visual requests, diagnose the surface system: texture, depth, card treatment, shadows, borders, contrast, spacing cadence, image/proof objects, CTA styling.",
    "Do not reduce visual critique to copy or hierarchy language when the real issue is styling or atmosphere.",
    "For visual moves, sourceActionPlan.moves should include selectorHint when possible and diff lines with concrete before-to-after surface changes.",
    "Good diff lines: 'Hero background: flat white -> warm off-white with subtle gradient and 1px border separation' or 'Proof area: plain paragraph list -> testimonial cards with border-radius, shadow, and metric eyebrow'.",
    "If real visual elements are missing, name them: testimonial cards, metric strip, founder portrait, logo cloud, screenshot frame, icon row, proof badge, CTA reassurance line.",
    "For color requests, apply a 60/30/10 approach: dominant light base, supporting secondary surfaces, restrained accent only for CTA and proof emphasis.",
    "Do not choose or justify surfaces mainly by 'premium feel'. Tie them to funnel role: proof object, CTA support, mechanism explanation, intake clarity, or booking reassurance.",

    // Context blocks
    businessBlock,
    funnelBriefBlock,
    intentProfileBlock,
    shellFrameBlock,
    foundationContextBlock,
    specificityBlock,
    sceneQualityBlock,
    visualPolishBlock,
    requestInterpretationBlock,
    designContextBlock,
    visualWhyBlock,
    contextMediaBlock,
    pageContextBlock,

    // JSON output instruction — placed last so the model follows it
    [
      "OUTPUT FORMAT — your entire response must be a single valid JSON object matching this schema. No text before or after. No code fences.",
      "{",
      '  "assistantText": "string — plain prose, no markdown bold or headers, no internal field labels. 2-3 short paragraphs or a short paragraph plus a dash-list. Speak in present tense about what the page needs and what Pura will change.",',
      '  "sourceActionPlan": {',
      '    "summary": "string — one sentence describing the primary source upgrade",',
      '    "moves": [',
      '      {',
      '        "key": "string — kebab-case identifier",',
      '        "target": "string — section or element name (e.g. hero, proof, cta)",',
      '        "change": "string — what Pura will change, phrased as an action",',
      '        "why": "string — short reason this matters for conversion",',
      '        "priority": "primary | secondary | optional",',
      '        "executionMode": "bounded-edit | model-led",',
      '        "confidence": "high | medium | low",',
      '        "selectorHint": "optional CSS selector for the target element",',
      '        "diff": ["optional before -> after surface change description"]',
      '      }',
      '    ],',
      '    "watchouts": ["optional — short failure modes to avoid, max 3"]',
      '  }',
      "}",
      "Set sourceActionPlan to null only if a concrete plan would be dishonest (e.g. user asked a pure yes/no question).",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  let assistantText: string;
  let sourceActionPlan: SourceActionPlan | null = null;
  try {
    const runTextOnlyChat = () => generateText({
      system,
      user: prompt,
      history: chatHistory,
      temperature: 0.55,
      responseFormat: "json",
    });
    const raw = contextImageUrls.length
      ? await generateTextWithImages({
          system,
          user: prompt,
          imageUrls: contextImageUrls,
          history: chatHistory,
          temperature: 0.55,
          responseFormat: "json",
        }).catch(async (error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!isRecoverableVisionRequestError(message)) throw error;
          return await runTextOnlyChat();
        })
      : await runTextOnlyChat();
    const parsed = extractSourceActionChatPayload(raw);
    sourceActionPlan = parsed?.sourceActionPlan || null;
    assistantText = (parsed?.assistantText || "").trim();
    if (!assistantText) {
      sourceActionPlan = sourceActionPlan || buildFallbackChatPlan();
      assistantText = "";
    }
  } catch (err) {
    sourceActionPlan = buildFallbackChatPlan();
    assistantText = "";
  }

  sourceActionPlan = vetSourceActionPlanAgainstCurrentPage(sourceActionPlan, currentHtml, critiqueSectionPlanItems);
  sourceActionPlan = vetSourceActionPlanAgainstObservedStructure(sourceActionPlan, observedSections);
  sourceActionPlan = ensurePlanAnchorsSelectedRegion(sourceActionPlan, selectedRegion);

  if (shouldForceStructuredAssistantReply(assistantText, sourceActionPlan)) {
    assistantText = buildStructuredAssistantReply({
      sceneQuality,
      plan: sourceActionPlan,
      specificitySignal,
      assistantText,
      sectionPlanItems: critiqueSectionPlanItems,
      hasCurrentHtml: Boolean(currentHtml.trim()),
      visualPolishSummary: visualPolishRequested ? visualPolishAnalysis.issues[0] : undefined,
    });
  }

  const userMsg = { role: "user" as const, content: prompt, at: new Date().toISOString() };
  const assistantMsg = {
    role: "assistant" as const,
    content: assistantText,
    at: new Date().toISOString(),
    ...(sourceActionPlan ? { sourceActionPlan } : {}),
  };
  const nextChat = [
    ...(Array.isArray(normalizedPage.customChatJson) ? (normalizedPage.customChatJson as any[]) : []),
    userMsg,
    assistantMsg,
  ].slice(-40);

  const updated = await prisma.creditFunnelPage.update({
    where: { id: normalizedPage.id },
    data: { customChatJson: nextChat as any },
    select: withDraftHtmlSelect(
      {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        blocksJson: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      },
      hasDraftHtml,
    ),
  });

  return NextResponse.json({
    ok: true,
    assistantText,
    sourceActionPlan,
    page: normalizeDraftHtml(updated),
  });
}
