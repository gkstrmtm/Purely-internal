import { assessBusinessProfileContextHealth } from "@/lib/businessProfileContextHealth";
import type { FunnelDesignContext } from "@/lib/funnelDesignContext";
import type { FunnelFoundationBusinessContext } from "@/lib/funnelPageIntent";

export type FunnelPageHealthTone = "clear" | "watch";

export type FunnelPageHealthCheck = {
  label: string;
  tone: FunnelPageHealthTone;
  summary: string;
  watchouts: string[];
  strengths: string[];
  scores: {
    overall: number;
    businessProfile: number;
    businessProfileGrade: "A" | "B" | "C" | "D" | "F";
    context: number;
  };
  states: {
    previewLive: "staged-source" | "draft-newer-than-live" | "saved-aligned";
    snapshotReady: boolean;
    transactionReady: boolean;
  };
  metrics: {
    contextSignals: number;
    referenceCount: number;
    htmlChars: number;
    inlineMediaCount: number;
    heavyInlineMediaCount: number;
    imageCount: number;
    actionCount: number;
    wordCount: number;
  };
};

type AssessFunnelPageHealthInput = {
  html: string;
  designContext?: FunnelDesignContext | null;
  businessProfile?: FunnelFoundationBusinessContext | null;
  contextMediaCount?: number;
  pageType?: string | null;
  transactionReady?: boolean;
  currentDraftNewerThanLive?: boolean;
  sourceHasPendingChanges?: boolean;
  needsSaveForDeployableSource?: boolean;
};

const HEALTH_LABEL = "Page guidance check";

export type BusinessProfileReadiness = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  completedSignals: number;
  totalSignals: number;
  summary: string;
  missingSignals: string[];
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function countMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) || []).length;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function gradeScore(value: number): BusinessProfileReadiness["grade"] {
  if (value >= 85) return "A";
  if (value >= 70) return "B";
  if (value >= 55) return "C";
  if (value >= 40) return "D";
  return "F";
}

function countWordsFromHtml(html: string) {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "and")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").filter(Boolean).length : 0;
}

function countContextSignals(designContext: FunnelDesignContext | null | undefined, contextMediaCount: number) {
  const vibeCount = Array.isArray(designContext?.vibeKeywords)
    ? designContext!.vibeKeywords.map((item) => cleanString(item)).filter(Boolean).length
    : 0;

  return [
    cleanString(designContext?.designBrief),
    cleanString(designContext?.fontDirection),
    cleanString(designContext?.colorDirection),
    cleanString(designContext?.designConcepts),
    cleanString(designContext?.avoid),
    vibeCount > 0 ? "vibe" : "",
    contextMediaCount > 0 ? "media" : "",
  ].filter(Boolean).length;
}

export function assessBusinessProfileReadiness(profile: FunnelFoundationBusinessContext | null | undefined): BusinessProfileReadiness {
  const contextHealth = assessBusinessProfileContextHealth({
    businessName: profile?.businessName,
    industry: profile?.industry,
    businessModel: profile?.businessModel,
    primaryGoals: profile?.primaryGoals,
    targetCustomer: profile?.targetCustomer,
    brandVoice: profile?.brandVoice,
    businessContext: profile?.businessContext,
  });
  const signalLabels: Record<keyof typeof contextHealth.signals, string> = {
    offer: "main offer",
    audience: "target customer",
    painPoints: "pain points",
    pricing: "pricing",
    serviceArea: "service area",
    proof: "proof",
    tone: "brand voice",
    brandAssets: "brand assets",
    ctaPreference: "preferred CTA",
    salesProcess: "sales process",
    avoidClaims: "avoid claims",
  };
  const signalEntries = Object.entries(contextHealth.signals) as Array<[keyof typeof contextHealth.signals, boolean]>;
  const completedSignals = signalEntries.filter(([, filled]) => filled).length;
  const totalSignals = signalEntries.length;
  const score = clampScore(contextHealth.score);
  const grade = gradeScore(score);
  const missingSignals = signalEntries
    .filter(([, filled]) => !filled)
    .map(([key]) => signalLabels[key])
    .slice(0, 4);
  const summary = contextHealth.explanation;

  return {
    score,
    grade,
    completedSignals,
    totalSignals,
    summary,
    missingSignals,
  };
}

function readInlineMediaMatches(html: string) {
  return Array.from(html.matchAll(/<(img|video|source)\b[^>]+(?:src|poster)=['"](data:[^'"]+)['"][^>]*>/gi));
}

export function assessFunnelPageHealth(input: AssessFunnelPageHealthInput): FunnelPageHealthCheck {
  const html = String(input.html || "");
  const contextMediaCount = Number.isFinite(Number(input.contextMediaCount)) ? Math.max(0, Number(input.contextMediaCount)) : 0;
  const contextSignals = countContextSignals(input.designContext, contextMediaCount);
  const businessProfileReadiness = assessBusinessProfileReadiness(input.businessProfile);
  const contextScore = clampScore((contextSignals / 7) * 100);
  const inlineMediaMatches = readInlineMediaMatches(html);
  const heavyInlineMediaCount = inlineMediaMatches.filter((match) => String(match[2] || "").length >= 150_000).length;
  const inlineMediaCount = inlineMediaMatches.length;
  const imageCount = countMatches(html, /<(img|picture|video)\b/gi);
  const actionCount = countMatches(html, /<(a|button)\b/gi);
  const wordCount = countWordsFromHtml(html);
  const htmlChars = html.length;
  const watchouts: string[] = [];
  const strengths: string[] = [];
  const pageType = cleanString(input.pageType).toLowerCase();
  const transactionReady = input.transactionReady !== false;
  const sourceHasPendingChanges = input.sourceHasPendingChanges === true;
  const currentDraftNewerThanLive = input.currentDraftNewerThanLive === true;
  const needsSaveForDeployableSource = input.needsSaveForDeployableSource === true;
  const conversionRouteScore = transactionReady ? 100 : ["booking", "checkout", "sales", "application", "lead-capture"].includes(pageType) ? 35 : 100;
  const previewSyncScore = sourceHasPendingChanges
    ? 45
    : needsSaveForDeployableSource
      ? 60
      : currentDraftNewerThanLive
        ? 78
        : 100;
  const previewLive: FunnelPageHealthCheck["states"]["previewLive"] = sourceHasPendingChanges
    ? "staged-source"
    : currentDraftNewerThanLive
      ? "draft-newer-than-live"
      : "saved-aligned";
  let payloadScore = 100;

  if (sourceHasPendingChanges) {
    watchouts.push("You are previewing staged source that is not saved yet. Save the page before treating this pass as the real draft.");
  }

  if (needsSaveForDeployableSource) {
    watchouts.push("Save the page to refresh the deployable source snapshot before checking preview-versus-live parity.");
  }

  if (!transactionReady && ["booking", "checkout", "sales", "application", "lead-capture"].includes(pageType)) {
    watchouts.push("The conversion route still needs booking or payment wiring before operator QA should rely on this page.");
  }

  if (contextSignals <= 1) {
    watchouts.push("The page brief is still light. Add one strong brief, reference image, or avoid note before asking for nuanced visual changes.");
  } else if (contextSignals >= 4) {
    strengths.push("Direction context is strong enough that the next AI pass should stay closer to the operator's intent.");
  }

  if (businessProfileReadiness.score < 55) {
    watchouts.push("Your business setup is still light. Fill in the core business fields so AI and platform context stay consistent.");
  } else if (businessProfileReadiness.score >= 80) {
    strengths.push("Business profile details are strong enough to stabilize context across the platform.");
  }

  if (heavyInlineMediaCount > 0) {
    watchouts.push("The draft is carrying heavy inline media. Move large assets to uploaded files before publish so first paint does not drag.");
    payloadScore -= 30;
  } else if (inlineMediaCount === 0 && htmlChars > 0 && htmlChars <= 120_000) {
    strengths.push("The saved draft does not look unusually heavy for a first-pass page surface.");
  }

  if (htmlChars >= 220_000) {
    watchouts.push("The saved draft is getting heavy. Recheck image payloads and repeated markup before pushing this live.");
    payloadScore -= 25;
  }

  if (wordCount >= 1100 && actionCount <= 2) {
    watchouts.push("The page is carrying a lot of copy relative to its action count. Recheck whether the first screen is still easy to act on.");
    payloadScore -= 15;
  }

  if ((pageType === "booking" || pageType === "application" || pageType === "lead-capture") && actionCount >= 5) {
    watchouts.push("This conversion page is presenting several actions. Reconfirm that the primary ask still dominates the first pass.");
    payloadScore -= 12;
  }

  if (imageCount > 0 && heavyInlineMediaCount === 0) {
    strengths.push("Media is present without obvious inline payload abuse.");
  }

  if (!sourceHasPendingChanges && currentDraftNewerThanLive) {
    strengths.push("Draft and live are still separated clearly, so you can keep iterating without silently changing the live page.");
  }

  if (!sourceHasPendingChanges && !currentDraftNewerThanLive && !needsSaveForDeployableSource) {
    strengths.push("Saved preview and deployable source look aligned at the current draft layer.");
  }

  const dedupedWatchouts = Array.from(new Set(watchouts)).slice(0, 3);
  const dedupedStrengths = Array.from(new Set(strengths)).slice(0, 2);
  const tone: FunnelPageHealthTone = dedupedWatchouts.length ? "watch" : "clear";
  const overallScore = clampScore(
    businessProfileReadiness.score * 0.28
    + contextScore * 0.22
    + conversionRouteScore * 0.18
    + previewSyncScore * 0.17
    + clampScore(payloadScore) * 0.15,
  );

  const summary = dedupedWatchouts.length
    ? dedupedWatchouts[0]
    : businessProfileReadiness.score < 55
      ? businessProfileReadiness.summary
      : contextSignals <= 1
      ? "The page saved cleanly, but the next AI pass still needs a bit more direction to stay tightly aligned."
      : "The page saved cleanly. Direction, business context, and route setup all look solid for the next pass.";

  return {
    label: HEALTH_LABEL,
    tone,
    summary,
    watchouts: dedupedWatchouts,
    strengths: dedupedStrengths,
    scores: {
      overall: overallScore,
      businessProfile: businessProfileReadiness.score,
      businessProfileGrade: businessProfileReadiness.grade,
      context: contextScore,
    },
    states: {
      previewLive,
      snapshotReady: !needsSaveForDeployableSource,
      transactionReady,
    },
    metrics: {
      contextSignals,
      referenceCount: contextMediaCount,
      htmlChars,
      inlineMediaCount,
      heavyInlineMediaCount,
      imageCount,
      actionCount,
      wordCount,
    },
  };
}