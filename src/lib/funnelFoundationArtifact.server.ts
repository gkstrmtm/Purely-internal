import crypto from "crypto";

import { generateText } from "@/lib/ai";
import {
  buildResolvedFunnelFoundation,
  type FunnelBriefProfile,
  type FunnelFoundationArtifact,
  type FunnelFoundationBusinessContext,
  type FunnelFoundationCapabilityInputs,
  type FunnelPageIntentProfile,
} from "@/lib/funnelPageIntent";

type FoundationArtifactInput = {
  routeLabel?: string | null;
  funnelName?: string | null;
  pageTitle?: string | null;
  brief?: FunnelBriefProfile | null;
  intent?: FunnelPageIntentProfile | null;
  businessProfile?: FunnelFoundationBusinessContext | null;
  capabilityInputs?: FunnelFoundationCapabilityInputs | null;
  businessContext?: string | null;
};

function cleanText(value: unknown, max = 1200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanParagraph(value: unknown, max = 2400) {
  return typeof value === "string"
    ? value.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim().slice(0, max)
    : "";
}

function cleanList(value: unknown, maxItems = 4, maxLen = 220) {
  if (!Array.isArray(value)) return [] as string[];
  const out: string[] = [];
  for (const item of value) {
    const next = cleanText(item, maxLen);
    if (!next || out.includes(next)) continue;
    out.push(next);
    if (out.length >= maxItems) break;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildMaterialInput(input: FoundationArtifactInput) {
  return {
    routeLabel: cleanText(input.routeLabel, 160),
    funnelName: cleanText(input.funnelName, 160),
    pageTitle: cleanText(input.pageTitle, 160),
    brief: input.brief ?? null,
    intent: input.intent ?? null,
    businessProfile: input.businessProfile ?? null,
    capabilityInputs: input.capabilityInputs ?? null,
    businessContext: cleanParagraph(input.businessContext, 2400),
  };
}

export function buildFunnelFoundationMaterialHash(input: FoundationArtifactInput) {
  const materialInput = buildMaterialInput(input);
  return crypto.createHash("sha256").update(JSON.stringify(materialInput)).digest("hex");
}

function buildFallbackArtifact(input: FoundationArtifactInput, materialHash: string): FunnelFoundationArtifact {
  const resolvedFoundation = buildResolvedFunnelFoundation(input);
  const blockingCapability = resolvedFoundation.capabilityGraph.find((capability) => capability.status === "needs-setup") || null;
  const plannedCapability = resolvedFoundation.capabilityGraph.find((capability) => capability.status === "planned") || null;
  const assumption =
    resolvedFoundation.missingContext[0]
      ? `Assuming the missing ${resolvedFoundation.missingContext[0]} will not change the overall shell or CTA path.`
      : "";

  const shellRationale = [
    resolvedFoundation.frameSummary,
    resolvedFoundation.shellConcept,
    resolvedFoundation.sectionPlan ? `Section order: ${resolvedFoundation.sectionPlan}` : "",
  ].filter(Boolean).slice(0, 3);

  const conversionRisks = [
    blockingCapability ? blockingCapability.summary : "",
    plannedCapability ? plannedCapability.summary : "",
    ...resolvedFoundation.missingContext.map((item) => `Still thin on ${item}.`),
  ].filter(Boolean).slice(0, 4);

  const nextMoves = [
    blockingCapability ? `Resolve ${blockingCapability.label.toLowerCase()} before calling the page fully live.` : "",
    plannedCapability ? `Bind ${plannedCapability.label.toLowerCase()} to a concrete live asset.` : "",
    resolvedFoundation.askForClarification ? "Answer one decisive clarification before the first draft hardens." : "Generate from this foundation and refine on the canvas.",
  ].filter(Boolean).slice(0, 4);

  return {
    version: 1,
    materialHash,
    generatedAt: new Date().toISOString(),
    source: "fallback",
    strategicSummary: cleanText(`${resolvedFoundation.summary} ${resolvedFoundation.capabilitySummary}`, 420),
    narrative: cleanText(`${resolvedFoundation.businessNarrative} ${resolvedFoundation.contextSummary}`, 900),
    assumption: cleanText(assumption, 220),
    shellRationale,
    conversionRisks,
    nextMoves,
    resolvedFoundation,
  };
}

function parseJsonObject(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export function coerceStoredFunnelFoundationArtifact(raw: unknown): FunnelFoundationArtifact | null {
  if (!isRecord(raw)) return null;
  const resolvedFoundation = isRecord(raw.resolvedFoundation) ? (raw.resolvedFoundation as FunnelFoundationArtifact["resolvedFoundation"]) : null;
  if (!resolvedFoundation) return null;

  const materialHash = cleanText(raw.materialHash, 128);
  if (!materialHash) return null;

  return {
    version: 1,
    materialHash,
    generatedAt: cleanText(raw.generatedAt, 80) || new Date().toISOString(),
    source: raw.source === "ai" ? "ai" : "fallback",
    strategicSummary: cleanText(raw.strategicSummary, 600),
    narrative: cleanText(raw.narrative, 1400),
    assumption: cleanText(raw.assumption, 280),
    shellRationale: cleanList(raw.shellRationale, 4, 240),
    conversionRisks: cleanList(raw.conversionRisks, 5, 240),
    nextMoves: cleanList(raw.nextMoves, 5, 240),
    resolvedFoundation,
  };
}

export async function synthesizeFunnelFoundationArtifact(input: FoundationArtifactInput): Promise<FunnelFoundationArtifact> {
  const materialHash = buildFunnelFoundationMaterialHash(input);
  const fallback = buildFallbackArtifact(input, materialHash);

  const system = [
    "You produce a persisted foundation artifact for a funnel builder.",
    "Return JSON only.",
    "The JSON shape must be:",
    '{ "strategicSummary": "...", "narrative": "...", "assumption": "...", "shellRationale": ["..."], "conversionRisks": ["..."], "nextMoves": ["..."] }',
    "Do not mirror every field in order.",
    "Be decisive, commercially useful, and truthful about blockers or staged capabilities.",
    "Keep the output concise enough to render inside a product UI.",
  ].join("\n");

  const user = [
    `ROUTE: ${fallback.resolvedFoundation.routeLabel}`,
    `FUNNEL: ${cleanText(input.funnelName, 160) || "this funnel"}`,
    `PAGE: ${cleanText(input.pageTitle, 160) || "this page"}`,
    cleanParagraph(input.businessContext, 1800) ? `BUSINESS_CONTEXT:\n${cleanParagraph(input.businessContext, 1800)}` : "",
    `RESOLVED_FOUNDATION_JSON:\n${JSON.stringify(fallback.resolvedFoundation, null, 2)}`,
    "Write the artifact from the resolved foundation. Treat staged or missing runtime capabilities as real blockers, not footnotes.",
  ].filter(Boolean).join("\n\n");

  try {
    const raw = await generateText({ system, user, temperature: 0.35 });
    const parsed = parseJsonObject(raw);
    if (!parsed) return fallback;

    const artifact: FunnelFoundationArtifact = {
      ...fallback,
      generatedAt: new Date().toISOString(),
      source: "ai",
      strategicSummary: cleanText(parsed.strategicSummary, 600) || fallback.strategicSummary,
      narrative: cleanText(parsed.narrative, 1400) || fallback.narrative,
      assumption: cleanText(parsed.assumption, 280) || fallback.assumption,
      shellRationale: cleanList(parsed.shellRationale, 4, 240).length ? cleanList(parsed.shellRationale, 4, 240) : fallback.shellRationale,
      conversionRisks: cleanList(parsed.conversionRisks, 5, 240).length ? cleanList(parsed.conversionRisks, 5, 240) : fallback.conversionRisks,
      nextMoves: cleanList(parsed.nextMoves, 5, 240).length ? cleanList(parsed.nextMoves, 5, 240) : fallback.nextMoves,
    };

    return artifact;
  } catch {
    return fallback;
  }
}