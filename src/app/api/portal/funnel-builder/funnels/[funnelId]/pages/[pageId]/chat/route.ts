import { NextResponse } from "next/server";

import { generateText, generateTextWithImages } from "@/lib/ai";
import { getBusinessProfileFoundationContext, getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { sanitizeTrustedAiAttachmentUrl } from "@/lib/funnelBuilderAttachmentPolicy";
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
import { normalizeFunnelThreadMessages } from "@/lib/funnelThreads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampText(s: string, maxLen: number) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + " [truncated]";
}

function buildAssistantHistoryContext(input: {
  content: string;
  plan: SourceActionPlan | null;
  currentHtml: string;
  sectionPlanItems: string[];
  observedSections: ObservedSection[];
}) {
  const content = clampText(String(input.content || "").trim(), 1200);
  const sanitizedPlan = vetSourceActionPlanAgainstObservedStructure(
    vetSourceActionPlanAgainstCurrentPage(input.plan, input.currentHtml, input.sectionPlanItems),
    input.observedSections,
  );
  const planLines = sanitizedPlan?.moves?.length
    ? sanitizedPlan.moves
      .slice(0, 4)
      .map((move) => `- ${move.target}: ${move.change}`)
      .join("\n")
    : "";

  if (content && planLines) {
    return `${content}\n\n[Saved source-action plan:\n${planLines}]`;
  }
  if (content) return content;
  if (planLines) return `[Saved source-action plan:\n${planLines}]`;
  return "";
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

type BookingRuntimeSlotObservation = {
  slotName: string;
  role: "primary" | "secondary" | "other";
  sectionHeading: string;
  title: string;
  kicker: string;
  body: string;
  note: string;
  proofLabel: string;
  proofBody: string;
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

function readBookingRuntimeAttr(attrs: string, name: string) {
  const match = new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(attrs);
  return match ? String(match[1] || "").trim() : "";
}

function extractSectionHeading(sectionHtml: string) {
  const headingMatch = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(sectionHtml);
  return headingMatch ? htmlToPlainText(headingMatch[2] || "").trim().slice(0, 160) : "";
}

function classifyBookingRuntimeSlotRole(input: { slotName: string; sectionHeading: string; title: string; kicker: string }, index: number) {
  const combined = `${input.slotName} ${input.sectionHeading} ${input.title} ${input.kicker}`.toLowerCase();
  if (/\b(primary|main|dominant)\b/.test(combined)) return "primary" as const;
  if (/\b(secondary|fallback|quiet|calm|later)\b/.test(combined)) return "secondary" as const;
  return index === 0 ? "primary" as const : "other" as const;
}

function extractBookingRuntimeSlotsFromHtml(html: string) {
  const raw = String(html || "").trim();
  if (!raw) return [] as BookingRuntimeSlotObservation[];

  const slots: BookingRuntimeSlotObservation[] = [];
  const sectionPattern = /<section\b[^>]*>[\s\S]*?<\/section>/gi;
  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = sectionPattern.exec(raw)) !== null && slots.length < 8) {
    const sectionHtml = sectionMatch[0] || "";
    const sectionHeading = extractSectionHeading(sectionHtml);
    const hostPattern = /<([a-z0-9:-]+)\b([^>]*\bdata-pa-booking-runtime=["']([^"']+)["'][^>]*)>/gi;
    let hostMatch: RegExpExecArray | null;

    while ((hostMatch = hostPattern.exec(sectionHtml)) !== null && slots.length < 8) {
      const attrs = hostMatch[2] || "";
      const slotName = String(hostMatch[3] || "").trim() || `slot-${slots.length + 1}`;
      const title = readBookingRuntimeAttr(attrs, "data-pa-booking-title");
      const kicker = readBookingRuntimeAttr(attrs, "data-pa-booking-kicker");
      const body = readBookingRuntimeAttr(attrs, "data-pa-booking-body");
      const note = readBookingRuntimeAttr(attrs, "data-pa-booking-note");
      const proofLabel = readBookingRuntimeAttr(attrs, "data-pa-booking-proof-label");
      const proofBody = readBookingRuntimeAttr(attrs, "data-pa-booking-proof-body");

      slots.push({
        slotName,
        role: classifyBookingRuntimeSlotRole({ slotName, sectionHeading, title, kicker }, slots.length),
        sectionHeading,
        title,
        kicker,
        body,
        note,
        proofLabel,
        proofBody,
      });
    }
  }

  return slots;
}

function buildBookingRuntimeContextBlock(slots: BookingRuntimeSlotObservation[]) {
  if (!slots.length) return "";

  return [
    "BOOKING_RUNTIME_CONTEXT:",
    `- Runtime mounts detected: ${slots.length}`,
    ...slots.map((slot, index) => {
      const details = [
        `${slot.role} slot '${slot.slotName}'`,
        slot.sectionHeading ? `section '${slot.sectionHeading}'` : "section heading unknown",
        slot.kicker ? `kicker '${slot.kicker}'` : "",
        slot.title ? `title '${slot.title}'` : "",
        slot.note ? `note '${slot.note}'` : "",
      ].filter(Boolean);
      return `- Slot ${index + 1}: ${details.join("; ")}`;
    }),
    "- Page shell owns section framing, proof placement, CTA hierarchy, slot posture, reassurance copy, and why each slot exists in the funnel flow.",
    "- Booking runtime owns scheduler mechanics: availability, date and time selection, booking form state, submission, and confirmation behavior.",
  ].join("\n");
}

function wantsBookingRuntimeBoundaryAnswer(prompt: string) {
  return /\b(shell versus the booking runtime|page shell versus the booking runtime|only styling around the scheduler|redesigned calendar experience|calendar experience|booking runtime|supports a redesigned calendar)\b/i.test(prompt);
}

function buildBookingRuntimeBoundarySourceActionPlan(input: {
  slots: BookingRuntimeSlotObservation[];
  selectedRegion: { key: string; label: string; summary: string } | null;
}) {
  if (!input.slots.length) return null;

  const primarySlot = input.slots.find((slot) => slot.role === "primary") || input.slots[0];
  const secondarySlot = input.slots.find((slot) => slot.role === "secondary") || input.slots[1] || null;
  const moves: SourceActionPlanMove[] = [
    {
      key: "booking-runtime-boundary",
      target: primarySlot.sectionHeading || primarySlot.title || "booking handoff",
      change: "Keep the page shell responsible for the booking story while moving calendar experience changes into the runtime itself.",
      why: "The shell should decide why and where the visitor books, while the runtime should decide how the actual scheduler behaves after the visitor commits.",
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
      diff: [
        "Shell work: section framing, proof, CTA hierarchy, reassurance copy -> keep in the funnel page",
        "Runtime work: availability layout, time selection states, booking submission and confirmation -> redesign inside the scheduler runtime",
      ],
    },
    {
      key: "primary-slot-story",
      target: primarySlot.sectionHeading || primarySlot.title || "primary booking handoff",
      change: "Tighten the primary slot so its reassurance and proof cues make the dominant booking handoff feel earned before the scheduler UI takes over.",
      why: "The main slot should carry the clearest next-step promise and the strongest booking posture before the visitor interacts with the calendar mechanics.",
      priority: "primary",
      executionMode: "bounded-edit",
      confidence: "high",
      diff: [
        `${primarySlot.kicker || "Primary booking path"}: generic handoff label -> explicit dominant consultation handoff`,
        `${primarySlot.title || "Primary booking slot"}: simple scheduler title -> clearer value and next-step framing`,
      ],
    },
  ];

  if (secondarySlot) {
    moves.push({
      key: "secondary-slot-quiet-fallback",
      target: secondarySlot.sectionHeading || secondarySlot.title || "secondary fallback slot",
      change: "Keep the secondary slot quieter and more objection-aware so it reads as a calm fallback instead of a second competing CTA.",
      why: "The later slot should preserve momentum for hesitant visitors without stealing attention from the main booking handoff.",
      priority: "secondary",
      executionMode: "bounded-edit",
      confidence: "high",
      diff: [
        `${secondarySlot.kicker || "Fallback booking path"}: generic second CTA -> softer fallback framing tied to objections`,
        `${secondarySlot.note || "Secondary note"}: loose reminder copy -> explicit reason this later slot exists and why it stays lower priority`,
      ],
    });
  }

  return ensurePlanAnchorsSelectedRegion(
    {
      summary: moves[0]?.change || "Clarify shell versus runtime ownership for the booking experience.",
      moves,
      watchouts: [
        "Do not let the fallback slot become visually louder than the primary handoff.",
        "Do not describe calendar mechanics as if they are controlled by page-shell copy alone.",
      ],
    },
    input.selectedRegion,
  );
}

function buildBookingRuntimeBoundaryAssistantReply(input: {
  slots: BookingRuntimeSlotObservation[];
}) {
  if (!input.slots.length) return "";

  const primarySlot = input.slots.find((slot) => slot.role === "primary") || input.slots[0];
  const secondarySlot = input.slots.find((slot) => slot.role === "secondary") || input.slots[1] || null;
  const lines: string[] = [
    "This page can support a redesigned calendar experience because the shell and the booking runtime already have separate jobs. The page shell owns the section framing, proof placement, CTA rhythm, and slot-specific reassurance. The booking runtime owns the actual scheduler behavior: availability, date and time selection, submission states, and confirmation flow.",
    "",
    "What should change next:",
    `- ${primarySlot.sectionHeading || primarySlot.title || "Primary booking handoff"}: keep this as the dominant consultation path and tighten the promise, proof cue, and reassurance immediately around the runtime host before the scheduler UI takes over.`,
  ];

  if (secondarySlot) {
    lines.push(`- ${secondarySlot.sectionHeading || secondarySlot.title || "Secondary fallback slot"}: keep this quieter than the first slot and rewrite it as objection-aware fallback framing, not a second competing booking ask.`);
  }

  lines.push("- Booking runtime: redesign the in-calendar experience at the runtime layer if you want different availability presentation, time-pick states, or confirmation behavior. Do not treat those mechanics as page-shell styling only.");

  return lines.join("\n");
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
    if (!resolvedTarget) {
      if (move.executionMode === "bounded-edit") {
        moves.push(move);
      }
      continue;
    }

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

function coerceSelectedTarget(rawTarget: unknown) {
  if (!rawTarget || typeof rawTarget !== "object" || Array.isArray(rawTarget)) return null;
  const entry = rawTarget as Record<string, unknown>;
  const label = typeof entry.label === "string" ? entry.label.trim().slice(0, 160) : "";
  if (!label) return null;
  const blockType = typeof entry.blockType === "string" ? entry.blockType.trim().slice(0, 80) : "";
  const blockId = typeof entry.blockId === "string" ? entry.blockId.trim().slice(0, 160) : "";
  const summary = typeof entry.summary === "string" ? entry.summary.trim().slice(0, 400) : "";
  const itemIndex = typeof entry.itemIndex === "number" && Number.isFinite(entry.itemIndex) ? Math.max(0, Math.floor(entry.itemIndex)) : null;
  const featureIndex = typeof entry.featureIndex === "number" && Number.isFinite(entry.featureIndex) ? Math.max(0, Math.floor(entry.featureIndex)) : null;
  const currentState = coerceSelectedTargetCurrentState(entry.currentState);
  return {
    label,
    summary,
    blockType,
    blockId,
    itemIndex,
    featureIndex,
    currentState,
  };
}

function extractStrictSelectedTargetReplacement(prompt: string) {
  const colonMatch = String(prompt || "").match(/:\s*["“]?([^\n"”]+)["”]?\s*$/);
  return colonMatch?.[1]?.trim() || "";
}

function isExplicitPageStructureRequest(prompt: string) {
  const text = String(prompt || "").trim().toLowerCase();
  if (!text) return false;

  const structureAction = /\b(add|insert|create|build|include|move|reorder|restructure|remove|replace)\b/.test(text);
  const structureSurface = /\b(section|hero|pricing|offer|checkout|faq|guarantee|testimonial|proof|cta|booking|calendar|footer|header)\b/.test(text);
  const explicitPageScope = /\b(page|whole page|entire page|landing page|this page)\b/.test(text);

  return explicitPageScope || (structureAction && structureSurface);
}

function isStrictSelectedTargetEditPrompt(
  prompt: string,
  selectedTarget: ReturnType<typeof coerceSelectedTarget>,
) {
  if (!selectedTarget) return false;
  const text = String(prompt || "").trim().toLowerCase();
  if (!text) return false;
  if (isExplicitPageStructureRequest(text)) return false;

  const localAction = /\b(change|replace|rewrite|update|edit|fix|shorten|tighten|make|adjust|reduce|increase|decrease|nudge|soften|blend|align|separate|lighten|darken|shrink|grow)\b/.test(text);
  const localScope = /\b(only|just|this|selected)\b/.test(text);
  const targetLanguage = /\b(heading|headline|title|cta|button|card|section|paragraph|text|copy)\b/.test(text);
  const microDetail = /\b(padding|spacing|space|gap|margin|radius|corner|shadow|border|contrast|color|tone|surface|background|blend|alignment|align|width|height|size)\b/.test(text);
  return localAction && (localScope || targetLanguage || microDetail);
}

function buildSelectedTargetMicroEditPlan(input: {
  prompt: string;
  selectedTarget: ReturnType<typeof coerceSelectedTarget>;
  selectedRegion: { key: string; label: string; summary: string } | null;
}): SourceActionPlan | null {
  const selectedTarget = input.selectedTarget;
  if (!selectedTarget) return null;

  const rawPrompt = String(input.prompt || "").trim();
  const prompt = rawPrompt.toLowerCase();
  if (!prompt) return null;

  const targetLabel = selectedTarget.label;
  const selectorHint = input.selectedRegion?.key ? `#${input.selectedRegion.key}` : undefined;
  const currentStateSummary = selectedTarget.currentState ? formatSelectedTargetCurrentState(selectedTarget.currentState) : "";
  const anchorDiff = currentStateSummary ? `Current selected state: ${currentStateSummary}` : "Scope: selected target only";

  const buildPlan = (change: string, why: string, diff: string[]) => ({
    summary: change,
    moves: [
      {
        key: `micro-${slugifyPlanKey(selectedTarget.blockId || targetLabel)}`,
        target: targetLabel,
        change,
        why,
        priority: "primary" as const,
        executionMode: "bounded-edit" as const,
        confidence: "high" as const,
        ...(selectorHint ? { selectorHint } : {}),
        diff: [anchorDiff, ...diff],
      },
    ],
    watchouts: [
      "Do not widen this into a broader page strategy or section rewrite.",
      "Keep neighboring sections and unrelated CTA logic untouched.",
    ],
  } satisfies SourceActionPlan);

  if (/\b(padding|spacing|space|gap|margin|closer|tighter|looser|breathing room)\b/.test(prompt)) {
    return buildPlan(
      `Adjust only ${targetLabel} spacing and local padding so the complained-about gap is corrected without changing the rest of the page.`,
      "The user is calling out a precise spacing problem, so the next pass should make a small local diff instead of widening into a redesign.",
      [
        "Spacing cadence: current local gap/padding -> tighter, cleaner spacing on this selected surface only",
      ],
    );
  }

  if (/\b(blend|background|surface|panel|card|border|shadow|depth|flat|texture|separate)\b/.test(prompt)) {
    return buildPlan(
      `Adjust only ${targetLabel} surface treatment so it separates cleanly from nearby content instead of blending in.`,
      "The user is reacting to a local surface problem, so this pass should improve separation and depth on the selected target only.",
      [
        "Surface treatment: current flat or blended appearance -> clearer separation, border, or depth on this selected surface only",
      ],
    );
  }

  if (/\b(contrast|color|tone|lighten|darken|muted|readable|legible)\b/.test(prompt)) {
    return buildPlan(
      `Adjust only ${targetLabel} color and contrast treatment so the local readability issue is corrected without changing the rest of the page.`,
      "The user is pointing at a small visual readability complaint, so the fix should stay scoped to this selected target.",
      [
        "Color/contrast: current local tone balance -> clearer contrast and readability on this selected surface only",
      ],
    );
  }

  if (/\b(radius|corner|rounding|size|smaller|larger|bigger|width|height|scale)\b/.test(prompt)) {
    return buildPlan(
      `Adjust only ${targetLabel} local sizing and edge treatment so the complained-about proportion issue is corrected without moving the rest of the page.`,
      "The user is asking for a precise visual proportion change, so this should stay a bounded local refinement.",
      [
        "Proportion: current local size or corner treatment -> corrected sizing and edge treatment on this selected surface only",
      ],
    );
  }

  if (/\b(align|alignment|center|left|right|flush|line up|offset)\b/.test(prompt)) {
    return buildPlan(
      `Adjust only ${targetLabel} alignment and local positioning so the selected surface lines up cleanly without changing the rest of the page.`,
      "The user is asking for a technical alignment correction, so the next pass should stay on this surface and not reopen the whole page.",
      [
        "Alignment: current local offset or misalignment -> cleaner alignment on this selected surface only",
      ],
    );
  }

  return null;
}

function coerceApplyFailureContext(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const failureStage = entry.failureStage === "apply" ? "apply" : entry.failureStage === "derive" ? "derive" : null;
  const originalPrompt = typeof entry.originalPrompt === "string" ? entry.originalPrompt.trim().slice(0, 800) : "";
  const planSummary = typeof entry.planSummary === "string" ? entry.planSummary.trim().slice(0, 600) : "";
  const planMoves = Array.isArray(entry.planMoves)
    ? entry.planMoves
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 240))
        .slice(0, 4)
    : [];
  const warnings = Array.isArray(entry.warnings)
    ? entry.warnings
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 240))
        .slice(0, 4)
    : [];

  if (!failureStage && !originalPrompt && !planSummary && !planMoves.length && !warnings.length) return null;

  return {
    failureStage,
    originalPrompt,
    planSummary,
    planMoves,
    warnings,
  };
}

function buildApplyFailureContextBlock(input: NonNullable<ReturnType<typeof coerceApplyFailureContext>>) {
  return [
    "Apply clarification mode is active for this turn.",
    input.failureStage === "derive"
      ? "A builder auto-apply pass could not be mapped into concrete page mutations."
      : input.failureStage === "apply"
        ? "A builder auto-apply pass derived mutations, but none of them actually changed the current page."
        : "A builder auto-apply pass stalled before making any visible change.",
    input.originalPrompt ? `Original operator request: ${input.originalPrompt}` : "",
    input.planSummary ? `Planned pass: ${input.planSummary}` : "",
    input.planMoves.length ? `Planned moves:\n${input.planMoves.map((item) => `- ${item}`).join("\n")}` : "",
    input.warnings.length ? `What blocked the apply:\n${input.warnings.map((item) => `- ${item}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildApplyFailureFallbackAssistantReply(input: {
  context: NonNullable<ReturnType<typeof coerceApplyFailureContext>>;
  selectedRegion: { key: string; label: string; summary: string } | null;
  selectedTarget: ReturnType<typeof coerceSelectedTarget>;
}) {
  const anchor = input.selectedTarget?.label || input.selectedRegion?.label || "that part of the page";
  const lead = input.context.warnings[0]
    || `Pura could not map that apply request onto ${anchor} clearly enough to change it truthfully.`;
  const ask = input.selectedTarget?.label
    ? `Name the exact change you want inside ${input.selectedTarget.label}, and Pura can stay anchored there.`
    : input.selectedRegion?.label
      ? `Name the exact block, line, or visual change inside ${input.selectedRegion.label}, and Pura can try again without widening scope.`
      : "Name the exact block, section, or line that should change, and Pura can try again without guessing.";
  return `${lead} ${ask}`.trim();
}

function ensurePlanAnchorsSelectedTarget(
  plan: SourceActionPlan | null,
  selectedTarget: ReturnType<typeof coerceSelectedTarget>,
  prompt: string,
) {
  if (!selectedTarget) return plan;

  const targetNeedle = `${selectedTarget.label} ${selectedTarget.blockType || ""}`.toLowerCase();
  const existingMoves = plan?.moves || [];
  const alreadyAnchored = existingMoves.some((move) => {
    const haystack = `${move.target} ${move.change} ${move.why} ${move.selectorHint || ""}`.toLowerCase();
    return targetNeedle
      .split(/\s+/)
      .filter(Boolean)
      .some((token) => token.length > 2 && haystack.includes(token));
  });
  if (alreadyAnchored) return plan;

  const replacement = extractStrictSelectedTargetReplacement(prompt);
  const targetLabel = selectedTarget.label;
  const move: SourceActionPlanMove = {
    key: `selected-target-${slugifyPlanKey(selectedTarget.blockId || targetLabel)}`,
    target: targetLabel,
    change: replacement
      ? `Change only ${targetLabel} to: ${replacement}.`
      : `Change only ${targetLabel} and keep the rest of the page untouched.`,
    why: "The user selected this exact target and asked for a bounded local change, so the next pass should stay scoped there.",
    priority: "primary",
    executionMode: "bounded-edit",
    confidence: "high",
  };

  return {
    summary: move.change,
    moves: [move, ...existingMoves].slice(0, 5),
    watchouts: [
      ...(plan?.watchouts || []).filter(Boolean).slice(0, 2),
      "Do not widen this into a broader page strategy pass.",
    ],
  };
}

function buildStrictSelectedTargetAssistantReply(
  prompt: string,
  selectedTarget: NonNullable<ReturnType<typeof coerceSelectedTarget>>,
) {
  const replacement = extractStrictSelectedTargetReplacement(prompt);
  const targetType = selectedTarget.blockType ? ` ${selectedTarget.blockType}` : " target";
  return replacement
    ? `Keeping this scoped to ${selectedTarget.label}. Pura will change only this${targetType} to: ${replacement}. The rest of the page stays untouched.`
    : `Keeping this scoped to ${selectedTarget.label}. Pura will change only this${targetType} and leave the rest of the page untouched.`;
}

function coerceAssistantContext(rawContext: unknown) {
  if (!rawContext || typeof rawContext !== "object" || Array.isArray(rawContext)) return null;
  const entry = rawContext as Record<string, unknown>;
  const next: Record<string, string> = {};

  for (const [key, maxLen] of [
    ["funnel", 160],
    ["page", 160],
    ["surface", 40],
    ["mode", 40],
    ["state", 80],
    ["booking", 160],
    ["tracking", 160],
    ["seo", 160],
    ["commerce", 160],
  ] as const) {
    const value = typeof entry[key] === "string" ? String(entry[key]).trim().slice(0, maxLen) : "";
    if (value) next[key] = value;
  }

  return Object.keys(next).length ? next : null;
}

function formatAssistantContext(context: Record<string, string>) {
  const pageModel = [
    context.funnel ? `Funnel ${context.funnel}` : "",
    context.page ? `Page ${context.page}` : "",
    context.surface ? `Surface ${context.surface}` : "",
    context.mode ? `Mode ${context.mode}` : "",
    context.state ? `State ${context.state}` : "",
  ].filter(Boolean);

  const operationalModel = [
    context.booking ? `Booking ${context.booking}` : "",
    context.tracking ? `Tracking ${context.tracking}` : "",
    context.seo ? `SEO ${context.seo}` : "",
    context.commerce ? `Commerce ${context.commerce}` : "",
  ].filter(Boolean);

  return [pageModel.join(" | "), operationalModel.join(" | ")].filter(Boolean).join("\n");
}

function coerceSelectedTargetCurrentState(rawState: unknown) {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) return null;
  const entry = rawState as Record<string, unknown>;
  const stringField = (value: unknown, maxLen: number) => (typeof value === "string" ? value.trim().slice(0, maxLen) : "");
  const numberField = (value: unknown, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : null);
  const next: Record<string, string | number | string[]> = {};

  const scope = stringField(entry.scope, 40);
  if (scope) next.scope = scope;

  for (const [key, maxLen] of [
    ["fieldKind", 80],
    ["itemLabel", 120],
    ["name", 120],
    ["price", 80],
    ["billingPeriod", 80],
    ["description", 220],
    ["badge", 80],
    ["ctaText", 120],
    ["ctaHref", 220],
    ["routeKind", 80],
    ["calendarTitle", 160],
    ["text", 120],
    ["anchorId", 120],
    ["mediaType", 40],
    ["logoState", 80],
  ] as const) {
    const value = stringField(entry[key], maxLen);
    if (value) next[key] = value;
  }

  const featureCount = numberField(entry.featureCount, 20);
  if (featureCount !== null) next.featureCount = featureCount;

  const cardCount = numberField(entry.cardCount, 20);
  if (cardCount !== null) next.cardCount = cardCount;

  if (Array.isArray(entry.features)) {
    const features = entry.features
      .map((item) => (typeof item === "string" ? item.trim().slice(0, 120) : ""))
      .filter(Boolean)
      .slice(0, 6);
    if (features.length) next.features = features;
  }

  return Object.keys(next).length ? next : null;
}

function formatSelectedTargetCurrentState(state: Record<string, string | number | string[]>) {
  const stringValue = (key: string) => (typeof state[key] === "string" ? String(state[key]) : "");
  const numberValue = (key: string) => (typeof state[key] === "number" ? Number(state[key]) : null);
  const arrayValue = (key: string) => (Array.isArray(state[key]) ? (state[key] as string[]) : []);
  const parts: string[] = [];

  const name = stringValue("name");
  if (name) parts.push(`name ${name}`);

  const itemLabel = stringValue("itemLabel");
  if (itemLabel) parts.push(`item ${itemLabel}`);

  const fieldKind = stringValue("fieldKind");
  if (fieldKind) parts.push(`field ${fieldKind}`);

  const price = stringValue("price");
  const billingPeriod = stringValue("billingPeriod");
  if (price) parts.push(`price ${[price, billingPeriod].filter(Boolean).join(" ")}`.trim());
  else if (billingPeriod) parts.push(`billing ${billingPeriod}`);

  const badge = stringValue("badge");
  if (badge) parts.push(`badge ${badge}`);

  const ctaText = stringValue("ctaText");
  const ctaHref = stringValue("ctaHref");
  if (ctaText) parts.push(`CTA ${ctaText}`);
  else if (ctaHref) parts.push(`CTA href ${ctaHref}`);

  const routeKind = stringValue("routeKind");
  if (routeKind) parts.push(`routing ${routeKind}`);

  const calendarTitle = stringValue("calendarTitle");
  if (calendarTitle) parts.push(`calendar ${calendarTitle}`);

  const text = stringValue("text");
  if (text) parts.push(`text ${text}`);

  const anchorId = stringValue("anchorId");
  if (anchorId) parts.push(`anchor ${anchorId}`);

  const mediaType = stringValue("mediaType");
  if (mediaType) parts.push(`media ${mediaType}`);

  const logoState = stringValue("logoState");
  if (logoState) parts.push(`logo ${logoState}`);

  const cardCount = numberValue("cardCount");
  if (cardCount !== null) parts.push(`${cardCount} pricing cards`);

  const featureCount = numberValue("featureCount");
  if (featureCount !== null) parts.push(`${featureCount} features`);

  const features = arrayValue("features");
  if (features.length) parts.push(`features ${features.join(" | ")}`);

  const description = stringValue("description");
  if (description) parts.push(`description ${description}`);

  return parts.slice(0, 8).join("; ");
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

function isContextMediaImage(item: ContextMedia) {
  const mime = String(item.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(String(item.url || ""));
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

function describePageHandoff(pageType: FunnelPageIntentProfile["pageType"]) {
  if (pageType === "booking") return "booking handoff";
  if (pageType === "lead-capture") return "capture handoff";
  if (pageType === "webinar") return "registration handoff";
  if (pageType === "application") return "qualification handoff";
  if (pageType === "sales" || pageType === "checkout") return "purchase handoff";
  return "conversion handoff";
}

function buildPageJobRule(pageType: FunnelPageIntentProfile["pageType"]) {
  if (pageType === "booking") {
    return "Respect the page job: this page should earn the scheduling step with trust, expectation-setting, and a clear booking handoff instead of reading like a direct-purchase page.";
  }
  if (pageType === "lead-capture") {
    return "Respect the page job: this page should make the value exchange feel specific and low-friction, with proof supporting form completion instead of pushing a hard sale.";
  }
  if (pageType === "webinar") {
    return "Respect the page job: this page should sharpen the event promise, audience fit, and registration momentum instead of drifting into a general sales letter.";
  }
  if (pageType === "application") {
    return "Respect the page job: this page should qualify the right people, clarify the commitment, and make the application step feel worth completing instead of acting like instant checkout.";
  }
  if (pageType === "sales" || pageType === "checkout") {
    return "Respect the page job: this page should build purchase confidence, strengthen comparison and proof, and remove hesitation around the buying step instead of hiding the decision behind vague consultation language.";
  }
  return "Respect the page job: keep the page aligned to its real next step and conversion mechanism instead of forcing a generic funnel pattern.";
}

function buildPageMoveExamples(pageType: FunnelPageIntentProfile["pageType"]) {
  if (pageType === "booking") {
    return "Prefer moves like: tighten hero hierarchy, move proof beside the CTA, clarify the booking handoff, cut low-value sections, restage CTA rhythm.";
  }
  if (pageType === "lead-capture") {
    return "Prefer moves like: tighten the lead promise, clarify the value exchange before the form, move proof beside the opt-in ask, cut friction around the capture step, restage CTA rhythm.";
  }
  if (pageType === "webinar") {
    return "Prefer moves like: sharpen the event promise, clarify who the webinar is for, move proof beside the registration ask, cut low-value explanation, restage CTA rhythm around registration.";
  }
  if (pageType === "application") {
    return "Prefer moves like: tighten the qualification framing, clarify who should apply, move proof beside the application ask, cut low-value sections, restage CTA rhythm around the application step.";
  }
  if (pageType === "sales" || pageType === "checkout") {
    return "Prefer moves like: tighten hero hierarchy, move proof beside the buying CTA, clarify the purchase handoff, sharpen offer comparison, restage CTA rhythm.";
  }
  return "Prefer moves like: tighten hero hierarchy, move proof beside the CTA, clarify the main conversion handoff, cut low-value sections, restage CTA rhythm.";
}

function inferPromptRequestedPageType(prompt: string, fallback: FunnelPageIntentProfile["pageType"]) {
  const normalized = String(prompt || "").toLowerCase();
  if (/\bwebinar|registration page|register for\b/.test(normalized)) return "webinar";
  if (/\bapplication page|apply now|application funnel|qualif(?:y|ication)\b/.test(normalized)) return "application";
  if (/\bbooking page|book a call|schedule|consultation page\b/.test(normalized)) return "booking";
  if (/\bcheckout(?:-focused)? page|checkout flow|checkout path|purchase step|purchase flow\b/.test(normalized)) return "checkout";
  if (/\bsales page|purchase page|buy now\b/.test(normalized)) return "sales";

  const mentionsLeadCaptureRoute = /\blead capture|lead-capture|email funnel|contact funnel|lead funnel|signup funnel|sign up funnel|opt-?in\b/.test(normalized);
  const mentionsEducationalShift = /\beducational page|education page|educational\b/.test(normalized);
  const mentionsSingleLowFrictionAction = /\bone cta|single cta|one call to action|single call to action|sign up|contact us|get updates|learn more\b/.test(normalized);
  if (mentionsLeadCaptureRoute || (mentionsEducationalShift && mentionsSingleLowFrictionAction)) {
    return "lead-capture";
  }

  return fallback;
}

function buildRecentUserConversationContext(messages: Array<Record<string, unknown>>, prompt: string) {
  const recentUserTurns = messages
    .filter((message) => String(message.role || "") === "user")
    .map((message) => String(message.content || "").trim())
    .filter(Boolean)
    .slice(-4);
  const currentPrompt = String(prompt || "").trim();
  if (!currentPrompt) return recentUserTurns.join("\n");
  if (recentUserTurns[recentUserTurns.length - 1] === currentPrompt) return recentUserTurns.join("\n");
  return [...recentUserTurns, currentPrompt].join("\n");
}

function buildPromptDirectedPageTypeShiftBlock(input: {
  storedPageType: FunnelPageIntentProfile["pageType"];
  requestedPageType: FunnelPageIntentProfile["pageType"];
}) {
  if (input.storedPageType === input.requestedPageType) return "";
  return [
    "PROMPT_DIRECTED_PAGE_JOB_SHIFT:",
    `- Stored page type: ${input.storedPageType}`,
    `- Requested page type for this turn: ${input.requestedPageType}`,
    "- Treat this turn as a controlled pivot toward the requested page job.",
    "- Do not keep recommending moves from the stored page type when they conflict with the requested job.",
  ].join("\n");
}

function buildChatRequestInterpretationBlock(input: {
  prompt: string;
  selectedRegion: { key: string; label: string; summary: string } | null;
  pageType: FunnelPageIntentProfile["pageType"];
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
    directives.push(`Primary focus: section roles, proof placement, ${describePageHandoff(input.pageType)}, and CTA rhythm.`);
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
  prompt: string;
  currentHtml: string;
  intentProfile: FunnelPageIntentProfile;
  shellFrame: ReturnType<typeof resolveFunnelShellFrame>;
  foundation: ReturnType<typeof buildResolvedFunnelFoundation>;
  sectionPlanItems: string[];
  selectedRegion: { key: string; label: string; summary: string } | null;
}): SourceActionPlan | null {
  const promptText = String(input.prompt || "").toLowerCase().replace(/[’]/g, "'");
  const text = htmlToPlainText(input.currentHtml).toLowerCase();
  const selectedLabel = input.selectedRegion?.label || input.sectionPlanItems[0] || "hero";
  const pageType = input.intentProfile.pageType;
  const sections = countMatches(input.currentHtml, /<section\b/gi);
  const hasBookingExpectationSetting = /\b(what happens|during the call|on the call|session includes|leave with|best fit|who this is for|next step)\b/.test(text);
  const hasNamedProof = /\b(testimonial|review|results?|case study|trusted by|operators|founder|client)\b/.test(text);
  const hasClearBookingHandoff = /\b(book|booking|schedule|available times|scheduler|consultation|strategy call)\b/.test(text);
  const hasOfferSpecificity = /\b(audit|assessment|consultation|implementation|workflow|automation|strategy)\b/.test(text);
  const hasScaffoldCopy = /frame the consultation|provide trust markers|book a call|hero|proofstrip|testimonialgrid|ctasection/.test(text);
  const hasAudienceFitSection = /\b(who this is for|best for|property managers|regional operators|leasing and marketing)\b/.test(text);
  const hasAgendaSection = /\b(agenda|what attendees will learn|what this session covers|what you will learn|outcomes)\b/.test(text);
  const hasRegistrationTruth = /\b(placeholder test form|not a webinar registration flow|temporary connection|temporary handoff|still need to be finalized)\b/.test(text);
  const hasEducationalPositioning = /\b(educational|education|learn|teaches?|guide|walkthrough|explainer|how it works)\b/.test(promptText) || /\b(learn|guide|educational|how it works)\b/.test(text);
  const hasValuePropUnsettled = /\b(don'?t know|do not know|not sure|still forming|not final|not finalized|figure out|working out)\b.{0,80}\b(value prop|value proposition|reward|offer|sign(?:\s|-)?up|cta|lead magnet)\b/.test(promptText);
  const wantsSingleCta = /\b(one cta|single cta|one call to action|single call to action)\b/.test(promptText);
  const mentionsLeadCaptureShift = /\b(email funnel|contact funnel|lead funnel|lead capture|interest funnel|signup funnel|sign up funnel)\b/.test(promptText);
  const hasSalesOrBookingEnergy = /\b(book a call|booking|schedule|consultation|sales offer|buy now|purchase|reserve)\b/.test(text);
  const hasFlexibleInterestLanguage = /\b(join the waitlist|join the list|get updates|raise your hand|show interest|request details|learn more|get the guide|see how it works)\b/.test(text);
  const moves: SourceActionPlanMove[] = [];

  if (pageType === "booking" || input.intentProfile.formStrategy === "booking") {
    if (hasScaffoldCopy) {
      moves.push({
        key: "booking-hero-specificity",
        target: "hero",
        change: `Replace the scaffold hero copy with a tighter opening container: an outcome-led promise for ${input.foundation.audience}, a narrower max-width headline, and a proof module beside the CTA that makes ${input.foundation.offer} feel worth booking now.`,
        why: "The current hero still reads like setup copy, so it is not yet carrying the authority or specificity expected from this booking page.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
      moves.push({
        key: "booking-proof-specificity",
        target: "proof strip",
        change: "Replace placeholder trust-strip language with a real proof module that uses named proof, concrete outcomes, or authority signals and sits closer to the booking decision.",
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
        change: `Rewrite ${selectedLabel} so it frames ${input.foundation.offer} for ${input.foundation.audience} inside a cleaner container with a narrower max-width headline and clearer proof placement instead of sounding like a generic consultation page.`,
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
        change: "Stage concrete proof in a tighter proof module close to the first CTA and repeat reassurance inside the booking container instead of leaving the scheduler to stand alone.",
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
        change: "Clarify who the session is for, what happens on the call, and what the visitor leaves with right inside the booking container at the handoff.",
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
        change: "Insert the missing trust and expectation beats between the opening container, proof module, and booking handoff so the page earns the existing CTA instead of jumping there too early.",
        why: "The resolved section plan is more developed than the current surface, so the page still needs its core trust and expectation beats.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "medium",
      });
    }
  }

  if (pageType === "webinar") {
    moves.push({
      key: `webinar-hero-${slugifyPlanKey(selectedLabel)}`,
      target: selectedLabel,
      change: `Shorten and sharpen ${selectedLabel} so the event promise, audience fit, and first registration action land in one scan for ${input.foundation.audience}.`,
      why: `The resolved webinar shell expects a specific promise-to-registration opening, but the current top of page still works harder at explanation than conversion posture for ${input.foundation.offer}.`,
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
      ...(input.selectedRegion ? { selectorHint: `#${input.selectedRegion.key}` } : {}),
    });

    if (!hasAgendaSection || sections >= 5) {
      moves.push({
        key: "webinar-agenda-outcomes",
        target: "agenda and outcomes",
        change: "Turn the learning payload into a tighter agenda or outcome strip near the top so the visitor sees what the webinar unlocks before the longer operational sections.",
        why: "Webinar registration pages convert better when the event value is scannable early instead of being buried inside later explanation blocks.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
    }

    if (!hasAudienceFitSection || sections >= 5) {
      moves.push({
        key: "webinar-audience-fit",
        target: "audience fit section",
        change: "Make the audience-fit section more decisive by separating who the webinar is for from who should not treat this as a generic inspiration event.",
        why: "A webinar page should help the right operator self-qualify quickly instead of making every visitor read the whole page to understand fit.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "high",
      });
    }

    moves.push({
      key: "webinar-registration-handoff",
      target: "registration handoff",
      change: "Restage the registration handoff as a visually distinct RSVP section that keeps the placeholder honesty explicit while clarifying what happens next after someone raises their hand.",
      why: hasRegistrationTruth
        ? "The current page is honest about the temporary form route, but the handoff still needs to feel like a clear interim registration step rather than a warning repeated throughout the page."
        : "The registration section needs explicit truth about the current route and a clearer next-step explanation before the visitor clicks through.",
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
    });

    if (sections >= 6) {
      moves.push({
        key: "webinar-compression",
        target: "lower page sequence",
        change: "Compress repeated lower-page warnings into one cleaner FAQ and one final CTA so the page stops restating the same temporary-state caveats in multiple sections.",
        why: "Repetition makes the page feel draft-heavy and cheap even when the underlying message is truthful.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "medium",
      });
    }
  }

  if (pageType === "lead-capture") {
    moves.push({
      key: `lead-capture-opening-${slugifyPlanKey(selectedLabel)}`,
      target: selectedLabel,
      change: hasValuePropUnsettled
        ? `Reframe ${selectedLabel} around early interest and practical relevance without pretending the final reward is locked yet.`
        : `Rewrite ${selectedLabel} so the visitor immediately understands the value exchange instead of reading generic sales language.`,
      why: hasValuePropUnsettled
        ? "There is enough directional intent to move the page away from sales energy, but the copy should stay flexible until the exact reward is finalized."
        : "Lead-capture pages convert when the opening makes the signup value obvious in one scan instead of sounding like a consultation or purchase pitch.",
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
      ...(input.selectedRegion ? { selectorHint: `#${input.selectedRegion.key}` } : {}),
    });

    if (hasSalesOrBookingEnergy || mentionsLeadCaptureShift || hasEducationalPositioning) {
      moves.push({
        key: "lead-capture-posture-shift",
        target: "page posture",
        change: "Remove direct sales or booking energy and restage the page as an educational or low-friction interest path with one clear next step.",
        why: "The user is signaling a lead-capture job, so the page should stop acting like a hard-sell or consultation page before anything else.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
    }

    if (wantsSingleCta || !hasFlexibleInterestLanguage) {
      moves.push({
        key: "lead-capture-single-cta",
        target: "primary CTA path",
        change: hasValuePropUnsettled
          ? "Center the page on one low-friction interest CTA using flexible signup or contact language, and keep the route tied to the current safe handoff instead of inventing a new offer path."
          : "Center the page on one clear opt-in CTA and remove competing asks so the value exchange feels singular and easy to act on.",
        why: hasValuePropUnsettled
          ? "The CTA route should stay truthful and reversible while the exact offer is still forming."
          : "Multiple asks dilute lead capture, especially when the page is supposed to convert on a single signup action.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
    }

    if (!hasNamedProof) {
      moves.push({
        key: "lead-capture-proof-support",
        target: "proof near CTA",
        change: "Use proof to reduce hesitation around the signup step without inventing testimonials or claims that are not already supported.",
        why: "Lead capture still needs belief, but it should stay honest when hard proof details are not finalized yet.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "medium",
      });
    }
  }

  if (pageType === "application") {
    moves.push({
      key: `application-fit-${slugifyPlanKey(selectedLabel)}`,
      target: selectedLabel,
      change: `Rewrite ${selectedLabel} so it qualifies the right applicant, clarifies the commitment, and makes the application step feel intentional instead of generic.`,
      why: "Application pages should help the right people self-select quickly instead of reading like a vague contact or sales page.",
      priority: "primary",
      executionMode: "model-led",
      confidence: "high",
      ...(input.selectedRegion ? { selectorHint: `#${input.selectedRegion.key}` } : {}),
    });

    if (!hasAudienceFitSection) {
      moves.push({
        key: "application-fit-section",
        target: "qualification section",
        change: "Add or tighten a qualification beat that says who this is for, who it is not for, and why the application exists.",
        why: "Applications work best when the page filters clearly before the form ask instead of waiting until after submission.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
    }

    if (!hasClearBookingHandoff) {
      moves.push({
        key: "application-handoff",
        target: "application handoff",
        change: "Clarify the application CTA and next-step expectations so the visitor knows what happens after they apply.",
        why: "Without expectation-setting, the application step feels heavier and more ambiguous than it needs to.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "high",
      });
    }
  }

  if (pageType === "sales" || pageType === "checkout") {
    if (!hasOfferSpecificity || hasScaffoldCopy) {
      moves.push({
        key: `${pageType === "checkout" ? "checkout-offer" : "sales-offer"}-${slugifyPlanKey(selectedLabel)}`,
        target: selectedLabel,
        change: pageType === "checkout"
          ? `Rewrite ${selectedLabel} so the purchase step, buyer fit, and expected outcome are explicit instead of sounding like generic placeholder sales copy.`
          : `Rewrite ${selectedLabel} so the offer, buyer fit, and outcome are explicit instead of sounding like generic placeholder sales copy.`,
        why: pageType === "checkout"
          ? "A checkout-focused page should make the purchase step feel clear and safe immediately; vague sales language hides what the buyer is committing to right now."
          : "A sales page should make the decision object legible immediately; generic sales language hides what is actually being bought.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
        ...(input.selectedRegion ? { selectorHint: `#${input.selectedRegion.key}` } : {}),
      });
    }

    if (!hasNamedProof) {
      moves.push({
        key: pageType === "checkout" ? "checkout-proof-near-cta" : "sales-proof-near-cta",
        target: "proof near purchase CTA",
        change: "Move or strengthen proof beside the buying decision so the purchase step is supported by specific trust, not generic reassurance.",
        why: pageType === "checkout"
          ? "Checkout pages need trust closest to the payment decision so the buyer does not carry final hesitation alone."
          : "Sales pages should earn the decision close to the CTA instead of asking the buyer to carry that belief alone.",
        priority: "primary",
        executionMode: "model-led",
        confidence: "high",
      });
    }

    if (sections <= 2) {
      moves.push({
        key: pageType === "checkout" ? "checkout-reassurance-clarity" : "sales-comparison-clarity",
        target: "decision flow",
        change: pageType === "checkout"
          ? "Insert one compact reassurance or objection-handling beat between the promise and the purchase action so the page does more than make a naked payment ask."
          : "Insert one compact mechanism, comparison, or reassurance beat between the promise and the purchase action so the page does more than make a naked ask.",
        why: pageType === "checkout"
          ? "A thin checkout page often needs one more confidence beat before payment, not a full rewrite."
          : "A thin sales page often needs one more decision-support beat before the CTA, not a full rewrite.",
        priority: "secondary",
        executionMode: "model-led",
        confidence: "medium",
      });
    }
  }

  if (!moves.length) return null;

  const watchouts = pageType === "lead-capture"
    ? [
        hasValuePropUnsettled
          ? "Keep the CTA route honest and low-friction while the exact value prop is still forming."
          : "Keep the page centered on one low-friction capture step instead of drifting back into sales language.",
      ]
    : pageType === "checkout"
      ? ["Keep the page centered on one clear purchase step and do not drift back into booking or lead capture language."]
      : [
          `Keep the critique aligned to the resolved conversion path: ${input.foundation.conversionPath}`,
        ];

  return {
    summary: moves[0]?.change || `Tighten ${selectedLabel} around the resolved page intent.`,
    moves: moves.slice(0, 4),
    watchouts,
  };
}

function buildObservedPageDiffSourceActionPlan(input: {
  currentHtml: string;
  observedSections: ObservedSection[];
  foundation: ReturnType<typeof buildResolvedFunnelFoundation>;
  pageType: FunnelPageIntentProfile["pageType"];
  selectedRegion: { key: string; label: string; summary: string } | null;
  visualPolishRequested: boolean;
}): SourceActionPlan | null {
  if (input.pageType === "webinar") return null;
  const observed = analyzeObservedPageDiffs(input.currentHtml, input.observedSections);
  if (!observed.pageLooksBooking) return null;

  const moves: SourceActionPlanMove[] = [];
  const targetLabel = input.selectedRegion?.label || (input.observedSections[0]?.role === "hero" ? "hero" : input.observedSections[0]?.label || "current page");
  const selectorHint = input.selectedRegion ? `#${input.selectedRegion.key}` : undefined;

  if (observed.hasGenericHero) {
    moves.push({
      key: "observed-hero-offer-clarity",
      target: "hero",
      change: `Rewrite the hero into a tighter opening container with a clearer outcome promise for ${input.foundation.audience}, a narrower max-width headline, and a proof module sitting beside the CTA instead of generic consultation language.`,
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
      change: "Replace the generic trust line with a tighter proof module that names outcomes, client types, or credibility markers and sits closer to the booking CTA.",
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
      change: "Clarify the existing CTA handoff with a short expectation-setting line inside the booking container that explains who the call is for, what happens next, and what the visitor gets from booking.",
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
  if (/has been successfully updated|feel free to preview|take a moment to preview|i'?m here to help/i.test(compact)) return "";
  if (/\b(i|we|pura)\s+will\s+(take|make|do|handle)\s+(these|the following)\s+steps\b/i.test(compact)) return "";
  return compact;
}

function replySoundsConsultative(text: string) {
  const compact = String(text || "").trim().replace(/\s+/g, " ");
  if (!compact) return false;
  return /to make this effective|will help clarify|key moves will include|focus on clarity and purpose|likely around|to support your new goal|start by clarifying|will require focusing on/i.test(compact);
}

function planConflictsWithPageType(plan: SourceActionPlan | null, pageType: FunnelPageIntentProfile["pageType"]) {
  if (!plan) return false;
  const haystack = [
    plan.summary,
    ...plan.moves.map((move) => `${move.target} ${move.change} ${move.why}`),
  ].join(" ").toLowerCase();

  if (pageType === "lead-capture") {
    return /\bbooking section\b|\bbook a call\b|\bbooking handoff\b|\bschedule\b|\bconsultation\b/.test(haystack);
  }

  if (pageType === "application") {
    return /\bbooking section\b|\bbook a call\b|\bschedule\b/.test(haystack);
  }

  if (pageType === "checkout") {
    return /\blead capture\b|\blead-capture\b|\bopt-?in\b|\bsign up\b|\bcontact funnel\b|\bbook a call\b|\bbooking section\b/.test(haystack);
  }

  return false;
}

function analyzeCurrentPageState(currentHtml: string, sectionPlanItems: string[] = []) {
  const html = String(currentHtml || "").toLowerCase();
  const sectionLabels = sectionPlanItems.map((item) => String(item || "").toLowerCase());
  const pageText = htmlToPlainText(currentHtml).toLowerCase();
  const hasScaffoldOfferCopy = /frame the consultation or booking value|generic consultation page|generic placeholder sales copy|booking value/.test(pageText);
  const hasScaffoldProofCopy = /provide trust markers|proof point one|proof point two|proof point three|support the booking decision with client proof|add one short trust marker|use this space for a second proof point|keep the testimonials concrete/.test(pageText);
  const hasScaffoldExpectationCopy = /clarify who the session is for and what the visitor gets|use this to explain one clear outcome or deliverable|show what changes for the visitor after this step/.test(pageText);
  const hasLightSurface = /bg-white|background(?:-color)?\s*:\s*(?:white|#fff(?:fff)?\b|#f8fafc\b|#f9fafb\b|#fafafa\b|rgb\(255\s*,\s*255\s*,\s*255\)|rgba\(255\s*,\s*255\s*,\s*255\s*,)|from-white|to-white/.test(html);
  const hasDarkReadableText = /text-(?:black|zinc-9\d\d|slate-9\d\d|gray-9\d\d|neutral-9\d\d)|color\s*:\s*(?:#0f172a\b|#111827\b|#18181b\b|#000\b|black\b|rgb\(15\s*,\s*23\s*,\s*42\)|rgb\(17\s*,\s*24\s*,\s*39\))/.test(html);
  const hasHeroSection = sectionLabels.some((label) => /hero|opening|headline/.test(label)) || /<h1\b|hero|headline/.test(html);
  const hasProofSection = sectionLabels.some((label) => /proof|testimonial|review|credib|trust/.test(label)) || /testimonial|review|proof|trusted by|results?|case stud/.test(pageText);
  const hasCtaSection = sectionLabels.some((label) => /cta|book|schedule|call to action|handoff/.test(label)) || /book|schedule|call|consultation/.test(pageText);
  const hasBookingExpectationCopy = /what happens|during the call|on the call|session includes|leave with|who this is for|best fit|next step|what to expect/.test(pageText)
    && !hasScaffoldExpectationCopy;
  const hasConcreteOfferCopy = /audit|assessment|consultation|implementation|workflow|automation|strategy|quote|diagnostic/.test(pageText)
    && !hasScaffoldOfferCopy;
  const hasSpecificProofCopy = /case stud|results?|saved \d+|increased|reduced|operators across|founder|client/.test(pageText)
    && !hasScaffoldProofCopy;
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

function buildDirectPromptSourceActionPlan(input: {
  prompt: string;
  selectedRegion: { key: string; label: string; summary: string } | null;
  selectedTarget: ReturnType<typeof coerceSelectedTarget>;
}): SourceActionPlan | null {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return null;

  const headlineRewriteMatch = prompt.match(/change(?: only)? the top page headline from ["']([^"']+)["'] to ["']([^"']+)["']/i);
  if (headlineRewriteMatch) {
    const fromText = String(headlineRewriteMatch[1] || "").trim();
    const toText = String(headlineRewriteMatch[2] || "").trim();
    if (!toText) return null;
    return {
      summary: `Change the top page headline from "${fromText}" to "${toText}" and leave the rest of the page untouched.`,
      moves: [
        {
          key: "replace-top-page-headline",
          target: "top page headline",
          change: `Change the top page headline from "${fromText}" to "${toText}" and leave the rest of the page untouched.`,
          why: "The user asked for one explicit headline replacement, so the next pass should make that exact text change without widening scope.",
          priority: "primary",
          executionMode: "bounded-edit",
          confidence: "high",
          selectorHint: input.selectedRegion ? `#${input.selectedRegion.key}` : "h1",
          diff: [`Heading text: "${fromText}" -> "${toText}"`],
        },
      ],
      watchouts: ["Do not change any other page copy, layout, booking, cart, or CTA behavior in this pass."],
    };
  }

  const microEditPlan = buildSelectedTargetMicroEditPlan({
    prompt,
    selectedTarget: input.selectedTarget,
    selectedRegion: input.selectedRegion,
  });
  if (microEditPlan) return microEditPlan;

  return null;
}

function buildDirectPromptAssistantReply(plan: SourceActionPlan | null) {
  const move = plan?.moves?.[0];
  if (!move) return "";
  return `${move.change} This pass stays local to ${move.target || "that selected target"} and leaves the rest of the page untouched.`;
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
  const lead = preferredLead || (input.plan?.moves?.length && input.specificitySignal.underSpecified
    ? "There is enough direction here to make a reversible pass. The page can move away from its current posture, keep the copy flexible where the offer is not finalized, and center the next version on one clearer action."
    : input.plan?.summary || (!input.hasCurrentHtml && (input.sectionPlanItems?.length || 0) > 0
      ? `This page is still on its initial scaffold. The next pass should turn ${joinHumanList((input.sectionPlanItems || []).slice(0, 3))} from placeholder structure into a real conversion sequence.`
      : input.visualPolishSummary
        ? `The main visual gap right now: ${input.visualPolishSummary}.`
        : input.sceneQuality.dominantIssue.detail));
  const moveLines = moves.length
    ? moves.map((move) => `- ${move.change} — ${move.why}`)
    : [`- ${input.sceneQuality.dominantIssue.detail}`];
  const closing = input.plan?.moves?.length
    ? input.specificitySignal.underSpecified
      ? "Smallest open item: lock the final offer, proof, or CTA wording only where the page would otherwise need fake specificity. The current pass can stay flexible and reversible until then."
      : input.plan.watchouts[0]
        ? `Smallest open item: ${input.plan.watchouts[0]}`
        : "Smallest open item: choose the next section you want pushed harder and the next pass can stay anchored there."
    : input.specificitySignal.underSpecified
      ? "One focused answer can unlock the next pass if the page would otherwise need invented facts."
      : "Reply with the exact section you want pushed harder and the next pass can stay anchored there.";

  return [lead, "", input.plan?.moves?.length ? "Next pass:" : "What I would change next:", ...moveLines, "", closing].join("\n");
}

function planHasBookingSpatialLanguage(plan: SourceActionPlan | null) {
  if (!plan?.moves?.length) return false;
  const text = [plan.summary, ...plan.moves.map((move) => `${move.target} ${move.change} ${move.why}`)].join(" ").toLowerCase();
  return /\b(container|max-width|padding|spacing|clamp|proof module|section rhythm)\b/.test(text);
}

function buildBookingSpatialSupportPlan(input: {
  foundation: ReturnType<typeof buildResolvedFunnelFoundation>;
  selectedRegion: { key: string; label: string; summary: string } | null;
}): SourceActionPlan {
  const heroMove: SourceActionPlanMove = {
    key: "booking-spatial-hero-cluster",
    target: input.selectedRegion?.label || "hero",
    change: `Rewrite the hero into one tighter container with a narrower max-width headline, a proof module beside the CTA, and cleaner spacing so ${input.foundation.offer} feels worth booking immediately for ${input.foundation.audience}.`,
    why: "Booking pages convert more cleanly when the first screen carries the promise, proof, and action in one readable decision surface.",
    priority: "primary",
    executionMode: "model-led",
    confidence: "high",
    ...(input.selectedRegion ? { selectorHint: `#${input.selectedRegion.key}` } : {}),
  };
  const handoffMove: SourceActionPlanMove = {
    key: "booking-spatial-handoff-rhythm",
    target: "booking section",
    change: "Tighten the booking handoff into a single-column container with clearer expectation copy, steadier section rhythm, and proof support that stays visible at the moment of scheduling.",
    why: "The handoff should feel like the next logical step, not a separate widget that makes the visitor reconstruct trust on their own.",
    priority: "secondary",
    executionMode: "model-led",
    confidence: "high",
  };

  return {
    summary: heroMove.change,
    moves: [heroMove, handoffMove],
    watchouts: [
      `Keep the critique aligned to the resolved conversion path: ${input.foundation.conversionPath}`,
    ],
  };
}

function shouldForceStructuredAssistantReply(text: string, plan: SourceActionPlan | null, forceOperational = false) {
  const compact = String(text || "").trim();
  if (!compact) return true;
  if (forceOperational) return true;
  if (!plan?.moves?.length && /\?$/.test(compact)) return false;
  if (plan?.moves?.length === 1 && plan.moves[0]?.executionMode === "bounded-edit") return false;
  if (replySoundsConsultative(compact)) return true;
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
  const requestThreadMessages = stripFunnelPageIntentMessages<Record<string, unknown>>(
    normalizeFunnelThreadMessages(body?.threadMessages) as Array<Record<string, unknown>>,
  ) as Array<Record<string, unknown>>;
  const useLiveState = body?.useLiveState === true;
  const persistAssistantOnly = body?.persistAssistantOnly === true;
  const applyFailureContext = coerceApplyFailureContext(body?.applyFailureContext);
  const currentHtmlFromClient = typeof body?.currentHtml === "string" ? body.currentHtml : "";
  const clientSectionPlanItems = coerceSectionPlanItems(body?.sectionPlanItems);
  const selectedRegion = coerceSelectedRegion(body?.selectedRegion);
  const selectedTarget = coerceSelectedTarget(body?.selectedTarget);
  const strictSelectedTargetEdit = !applyFailureContext && isStrictSelectedTargetEditPrompt(prompt, selectedTarget);
  const assistantContext = coerceAssistantContext(body?.assistantContext);
  const allRegions = coerceRegionSummaryList(body?.allRegions);
  const contextMedia = coerceContextMedia(body?.contextMedia);
  const trustedContextMedia = contextMedia
    .map((item) => {
      const trustedUrl = sanitizeTrustedAiAttachmentUrl(req, item.url);
      return trustedUrl ? { ...item, url: trustedUrl } : null;
    })
    .filter((item): item is ContextMedia => Boolean(item));
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
  const recentConversationContext = buildRecentUserConversationContext(requestThreadMessages, prompt);
  const requestedPageType = inferPromptRequestedPageType(recentConversationContext || prompt, intentProfile.pageType);
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
  const bookingRuntimeSlots = extractBookingRuntimeSlotsFromHtml(currentHtml);
  const observedSectionPlanItems = collectObservedSectionLabelsFromHtml(currentHtml);
  const critiqueSectionPlanItems = observedSectionPlanItems.length ? observedSectionPlanItems : sectionPlanItems;
  const visualPolishRequested = wantsVisualPolishReview(prompt);
  const bookingRuntimeBoundaryRequested = wantsBookingRuntimeBoundaryAnswer(prompt);
  const visualPolishAnalysis = analyzeVisualPolish(currentHtml);
  const specificitySignal = assessChatSpecificitySignal({ currentHtml, businessContext, sectionPlanItems: critiqueSectionPlanItems });
  const directPromptPlan = applyFailureContext ? null : buildDirectPromptSourceActionPlan({ prompt, selectedRegion, selectedTarget });
  const sceneQuality = assessFunnelSceneQuality({
    pageAnatomy: buildFragmentSceneAnatomy(currentHtml, ""),
    proofResolved: hasLikelyProofSurface(currentHtml),
    ctaResolved: /<(a|button|form|input|textarea|select)\b/i.test(currentHtml),
    sectionPlanItems: critiqueSectionPlanItems,
  });
  const visualWhyBlock = buildFunnelVisualWhyBlock({
    prompt,
    pageType: requestedPageType,
    shellFrame,
    archetypes: [],
  });
  const requestInterpretationBlock = buildChatRequestInterpretationBlock({
    prompt,
    selectedRegion,
    pageType: requestedPageType,
  });
  const promptDirectedPageTypeShiftBlock = buildPromptDirectedPageTypeShiftBlock({
    storedPageType: intentProfile.pageType,
    requestedPageType,
  });
  const buildFallbackChatPlan = () => {
    const observedPageDiffPlan = buildObservedPageDiffSourceActionPlan({
      currentHtml,
      observedSections,
      foundation,
      pageType: requestedPageType,
      selectedRegion,
      visualPolishRequested,
    });
    const intentAwareFallbackPlan = buildIntentAwareFallbackSourceActionPlan({
      prompt,
      currentHtml,
      intentProfile: {
        ...intentProfile,
        pageType: requestedPageType,
      },
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
  const prevChatSource = requestThreadMessages.length
    ? requestThreadMessages
    : stripFunnelPageIntentMessages<Record<string, unknown>>(
      normalizeFunnelThreadMessages(normalizedPage.customChatJson) as Array<Record<string, unknown>>,
    );

  const prevChat = prevChatSource as Array<{
        role: string;
        content: string;
        sourceActionPlan?: SourceActionPlan | null;
        at?: string;
      }>;

  const chatHistory = prevChat
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map((m) => {
      const content = String(m.content);
      if (m.role === "assistant") {
        const plan = (m as Record<string, unknown>).sourceActionPlan as SourceActionPlan | null | undefined;
        const assistantContext = buildAssistantHistoryContext({
          content,
          plan: plan || null,
          currentHtml,
          sectionPlanItems: critiqueSectionPlanItems,
          observedSections,
        });
        if (!assistantContext) return null;
        return {
          role: "assistant" as const,
          content: assistantContext,
        };
      }
      return { role: m.role as "user" | "assistant", content: clampText(content, 1200) };
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
    assistantContext ? `Editor surface context:\n${formatAssistantContext(assistantContext)}` : "",
    selectedRegion ? `Current focus region: ${selectedRegion.label}${selectedRegion.summary ? ` - ${selectedRegion.summary}` : ""}` : "",
    selectedTarget ? `Current selected edit target: ${selectedTarget.label}${selectedTarget.blockType ? ` [${selectedTarget.blockType}]` : ""}${typeof selectedTarget.itemIndex === "number" ? ` card ${selectedTarget.itemIndex + 1}` : ""}${typeof selectedTarget.featureIndex === "number" ? ` feature ${selectedTarget.featureIndex + 1}` : ""}${selectedTarget.summary ? ` - ${selectedTarget.summary}` : ""}` : "",
    selectedTarget?.currentState ? `Selected target current state: ${formatSelectedTargetCurrentState(selectedTarget.currentState)}` : "",
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
  const applyFailureBlock = applyFailureContext ? buildApplyFailureContextBlock(applyFailureContext) : "";
  const visualPolishBlock = [
    `Visual polish requested: ${visualPolishRequested ? "yes" : "no"}`,
    `Visual polish diagnosis: ${visualPolishAnalysis.summary}.`,
  ].join("\n");
  const contextMediaBlock = trustedContextMedia.length
    ? [
        "Selected visual references:",
        ...trustedContextMedia.map((item) => {
          const name = item.fileName ? ` ${item.fileName}` : "";
          const mime = item.mimeType ? ` (${item.mimeType})` : "";
          return `- ${name}${mime}: ${item.url}`.trim();
        }),
      ].join("\n")
    : "";
  const designContextBlock = buildFunnelDesignContextPromptBlock(designContext);
  const bookingRuntimeBlock = buildBookingRuntimeContextBlock(bookingRuntimeSlots);
  const contextImageUrls = trustedContextMedia
    .filter((item) => isContextMediaImage(item))
    .map((item) => item.url)
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
    "Treat the prior chat history as a real ongoing conversation. Carry forward user constraints, decisions, and unresolved context unless the newest turn explicitly changes them.",
    "If the user wants more leads, bookings, registrations, applications, sales, or has a business goal: translate that goal into page-level moves. Tell them what on the page is costing them and what to change first.",
    "If the promised reward, outcome, or value exchange is fuzzy or missing, lead with that gap first. Clarify exactly what the visitor is signing up for, what they get, and why the next step is worth taking before drifting into secondary layout or styling advice.",
    "Do not freeze just because some business details are unfinished. If the direction is clear enough and the pass is reversible, act on it instead of defaulting to a consultation-only answer.",
    "When details are missing but not critical, use flexible truthful copy and keep the pass adjustable. Ask one focused question only when the edit would otherwise require invented price, proof, guarantees, claims, or a risky CTA route change.",
    "Do not force the same response pattern on every turn. Sometimes the right move is a direct answer, sometimes a reversible page pass, and sometimes one focused clarifying question.",
    "Treat the funnel as a system with required jobs: attention, belief building, proof, mechanism, CTA, reinforcement, and handoff. Work out which jobs are weak or missing before proposing style changes.",
    "When stored brief, page intent, shell frame, or foundation context exists, treat it as the intended blueprint. Compare the live page to that blueprint and return diffs, not generic advice.",
    buildPageJobRule(requestedPageType),
    "If booking runtime mounts are present, explicitly separate page-shell ownership from booking-runtime ownership. Do not talk as if the whole booking experience lives only in shell copy or only in scheduler mechanics.",
    "If there is more than one booking runtime mount, explain the role of the dominant slot and the quieter fallback slot separately. Preserve their hierarchy instead of flattening them into duplicate CTAs.",
    strictSelectedTargetEdit
      ? [
          "Strict local edit mode is active for this turn.",
          "Treat the selected edit target as the only allowed scope unless the user explicitly asks to widen scope.",
          "Do not ask broad strategy, offer, or page-level clarification questions when the prompt already names a direct local edit.",
          "If the user provides replacement wording for a heading, CTA, or text target, treat that wording as sufficient instruction.",
          "assistantText should confirm the exact local change and state that the rest of the page stays untouched.",
          "sourceActionPlan should start with one bounded-edit move anchored to the selected edit target.",
        ].join("\n")
      : "",
    applyFailureContext
      ? [
          "Apply clarification mode overrides normal planning for this turn.",
          "Do not claim that any page change was made.",
          "Explain, in natural language, what part of the requested apply could not be mapped or verified against the current page.",
          "If one precise follow-up instruction would unblock the apply, say exactly what Pura still needs next.",
          "Do not turn this into a broad redesign plan or a generic fallback speech.",
          "Set sourceActionPlan to null unless returning a real plan is the only truthful response.",
        ].join("\n")
      : "",

    // Move quality rules
    "When enough page context exists, sourceActionPlan should contain 3-5 concrete moves tied to the current page structure.",
    buildPageMoveExamples(requestedPageType),
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
    promptDirectedPageTypeShiftBlock,
    shellFrameBlock,
    foundationContextBlock,
    specificityBlock,
    sceneQualityBlock,
    applyFailureBlock,
    visualPolishBlock,
    requestInterpretationBlock,
    designContextBlock,
    visualWhyBlock,
    contextMediaBlock,
    bookingRuntimeBlock,
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
      "If enough context exists for a reversible pass, return a real sourceActionPlan and assistantText that sounds operational, not merely advisory.",
      "If clarification is truly required, ask one focused question in assistantText and explain why that answer changes the page direction. Do not ask a long intake list.",
      "Set sourceActionPlan to null only if a concrete plan would be dishonest (e.g. user asked a pure yes/no question).",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  let assistantText: string;
  let sourceActionPlan: SourceActionPlan | null = null;
  const fallbackChatPlan = buildFallbackChatPlan();
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
    sourceActionPlan = applyFailureContext ? null : (directPromptPlan || parsed?.sourceActionPlan || null);
    assistantText = directPromptPlan ? buildDirectPromptAssistantReply(directPromptPlan) : (parsed?.assistantText || "").trim();
    if (!assistantText) {
      if (applyFailureContext) {
        assistantText = buildApplyFailureFallbackAssistantReply({ context: applyFailureContext, selectedRegion, selectedTarget });
        sourceActionPlan = null;
      } else {
        sourceActionPlan = sourceActionPlan || fallbackChatPlan;
        assistantText = "";
      }
    } else if (!applyFailureContext && !directPromptPlan && !strictSelectedTargetEdit && fallbackChatPlan && (specificitySignal.underSpecified || !sourceActionPlan || sourceActionPlan.moves.length < 3)) {
      sourceActionPlan = mergeSourceActionPlans(fallbackChatPlan, sourceActionPlan);
    }
  } catch {
    if (applyFailureContext) {
      sourceActionPlan = null;
      assistantText = buildApplyFailureFallbackAssistantReply({ context: applyFailureContext, selectedRegion, selectedTarget });
    } else if (directPromptPlan) {
      sourceActionPlan = directPromptPlan;
      assistantText = buildDirectPromptAssistantReply(directPromptPlan);
    } else if (strictSelectedTargetEdit && selectedTarget) {
      sourceActionPlan = ensurePlanAnchorsSelectedTarget(null, selectedTarget, prompt);
      assistantText = buildStrictSelectedTargetAssistantReply(prompt, selectedTarget);
    } else {
      sourceActionPlan = fallbackChatPlan;
      assistantText = "";
    }
  }

  sourceActionPlan = applyFailureContext
    ? null
    : vetSourceActionPlanAgainstCurrentPage(sourceActionPlan, currentHtml, critiqueSectionPlanItems);
  sourceActionPlan = applyFailureContext ? null : vetSourceActionPlanAgainstObservedStructure(sourceActionPlan, observedSections);
  sourceActionPlan = applyFailureContext ? null : ensurePlanAnchorsSelectedRegion(sourceActionPlan, selectedRegion);
  const needsOperationalRewrite = !applyFailureContext && (
    replySoundsConsultative(assistantText)
    || planConflictsWithPageType(sourceActionPlan, requestedPageType)
  );
  if (!applyFailureContext && fallbackChatPlan && needsOperationalRewrite) {
    sourceActionPlan = mergeSourceActionPlans(fallbackChatPlan, sourceActionPlan);
    assistantText = "";
  }
  if (!applyFailureContext && strictSelectedTargetEdit && selectedTarget) {
    sourceActionPlan = ensurePlanAnchorsSelectedTarget(sourceActionPlan, selectedTarget, prompt);
    if (sourceActionPlan?.moves?.length) {
      const primaryMove = sourceActionPlan.moves[0];
      sourceActionPlan = {
        summary: primaryMove.change,
        moves: [primaryMove],
        watchouts: [
          ...(sourceActionPlan.watchouts || []).filter(Boolean).slice(0, 2),
          "Do not widen this into a broader page strategy pass.",
        ],
      };
    }
    if (!assistantText.trim() || /\?|what is|what's|which|should it|offer or service/i.test(assistantText)) {
      assistantText = buildStrictSelectedTargetAssistantReply(prompt, selectedTarget);
    }
  }

  if (!applyFailureContext && bookingRuntimeBoundaryRequested) {
    const boundaryPlan = buildBookingRuntimeBoundarySourceActionPlan({
      slots: bookingRuntimeSlots,
      selectedRegion,
    });
    sourceActionPlan = mergeSourceActionPlans(boundaryPlan, sourceActionPlan);

    if (!/page shell|booking runtime|runtime owns|shell owns/i.test(assistantText)) {
      assistantText = buildBookingRuntimeBoundaryAssistantReply({
        slots: bookingRuntimeSlots,
      });
    }
  }

  if (!applyFailureContext && requestedPageType === "booking" && (!sourceActionPlan?.moves?.length || sourceActionPlan.moves.length < 2 || !planHasBookingSpatialLanguage(sourceActionPlan))) {
    sourceActionPlan = mergeSourceActionPlans(
      buildBookingSpatialSupportPlan({ foundation, selectedRegion }),
      sourceActionPlan,
    );
  }

  if (!applyFailureContext && shouldForceStructuredAssistantReply(assistantText, sourceActionPlan, needsOperationalRewrite)) {
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

  const userMsg = persistAssistantOnly ? null : { role: "user" as const, content: prompt, at: new Date().toISOString() };
  const assistantMsg = assistantText.trim() ? {
    role: "assistant" as const,
    content: assistantText,
    at: new Date().toISOString(),
    ...(sourceActionPlan ? { sourceActionPlan } : {}),
  } : null;
  const nextChat = normalizeFunnelThreadMessages([
    ...(Array.isArray(normalizedPage.customChatJson) ? (normalizedPage.customChatJson as any[]) : []),
    ...(userMsg ? [userMsg] : []),
    ...(assistantMsg ? [assistantMsg] : []),
  ]);

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
    page: {
      ...normalizeDraftHtml(updated),
      customChatJson: normalizeFunnelThreadMessages(updated.customChatJson),
    },
  });
}
