import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText, generateTextWithImages } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import {
  buildFunnelExhibitArchetypeBlock,
  readFunnelExhibitArchetypePack,
  selectRelevantFunnelExhibitArchetypes,
  type FunnelExhibitArchetype,
} from "@/lib/funnelExhibitArchetypes";
import { synthesizeFunnelGenerationPrompt } from "@/lib/funnelPromptSynthesizer";
import {
  buildFunnelBriefPromptBlock,
  buildFunnelPageIntentPromptBlock,
  buildFunnelPageRouteLabel,
  inferFunnelBriefProfile,
  inferFunnelPageIntentProfile,
  readFunnelBrief,
  readFunnelPageBrief,
} from "@/lib/funnelPageIntent";
import { assessFunnelSceneQuality, buildFragmentSceneAnatomy } from "@/lib/funnelSceneQuality";
import { resolveFunnelShellFrame, type FunnelShellFrame } from "@/lib/funnelShellFrames";
import { buildFunnelVisualWhyBlock } from "@/lib/funnelVisualWhy";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function cleanMediaReference(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const url = cleanString(rec.url, 2000);
  if (!url) return null;
  const fileName = cleanString(rec.fileName, 400);
  const mimeType = cleanString(rec.mimeType, 160);
  return {
    url,
    ...(fileName ? { fileName } : null),
    ...(mimeType ? { mimeType } : null),
  };
}

type NormalizedGenerateRequest = {
  funnelId: string;
  pageId: string;
  prompt: string;
  currentHtml: string;
  currentCss: string;
  contextKeys: string[];
  contextMedia: Array<{ url: string; fileName?: string; mimeType?: string }>;
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  intentProfile?: Record<string, unknown>;
  funnelBrief?: Record<string, unknown>;
};

function normalizeGenerateBody(raw: unknown): NormalizedGenerateRequest {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const intentProfileRaw =
    rec.intentProfile && typeof rec.intentProfile === "object" && !Array.isArray(rec.intentProfile)
      ? (rec.intentProfile as Record<string, unknown>)
      : null;
  const mediaPlanRaw =
    intentProfileRaw?.mediaPlan && typeof intentProfileRaw.mediaPlan === "object" && !Array.isArray(intentProfileRaw.mediaPlan)
      ? (intentProfileRaw.mediaPlan as Record<string, unknown>)
      : null;
  const funnelBriefRaw =
    rec.funnelBrief && typeof rec.funnelBrief === "object" && !Array.isArray(rec.funnelBrief)
      ? (rec.funnelBrief as Record<string, unknown>)
      : null;

  return {
    funnelId: cleanString(rec.funnelId, 200),
    pageId: cleanString(rec.pageId, 200),
    prompt: cleanString(rec.prompt, 12000),
    currentHtml: typeof rec.currentHtml === "string" ? rec.currentHtml : "",
    currentCss: typeof rec.currentCss === "string" ? rec.currentCss : "",
    contextKeys: cleanStringList(rec.contextKeys, 60, 160),
    contextMedia: Array.isArray(rec.contextMedia)
      ? rec.contextMedia
          .map((item) => cleanMediaReference(item))
          .filter((item): item is { url: string; fileName?: string; mimeType?: string } => Boolean(item))
          .slice(0, 24)
      : [],
    chatHistory: Array.isArray(rec.chatHistory)
      ? rec.chatHistory
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            const row = item as Record<string, unknown>;
            const role = row.role === "assistant" ? "assistant" : row.role === "user" ? "user" : "";
            const content = cleanString(row.content, 16000);
            if (!role || !content) return null;
            return { role: role as "user" | "assistant", content };
          })
          .filter((item): item is { role: "user" | "assistant"; content: string } => Boolean(item))
          .slice(0, 30)
      : [],
    intentProfile: intentProfileRaw
      ? {
          pageType: cleanString(intentProfileRaw.pageType, 40),
          pageGoal: cleanString(intentProfileRaw.pageGoal, 480),
          audience: cleanString(intentProfileRaw.audience, 320),
          offer: cleanString(intentProfileRaw.offer, 320),
          primaryCta: cleanString(intentProfileRaw.primaryCta, 160),
          companyContext: cleanString(intentProfileRaw.companyContext, 720),
          qualificationFields: cleanString(intentProfileRaw.qualificationFields, 480),
          routingDestination: cleanString(intentProfileRaw.routingDestination, 480),
          formStrategy: cleanString(intentProfileRaw.formStrategy, 40),
          shellConcept: cleanString(intentProfileRaw.shellConcept, 1200),
          sectionPlan: cleanString(intentProfileRaw.sectionPlan, 1200),
          askClarifyingQuestions: typeof intentProfileRaw.askClarifyingQuestions === "boolean" ? intentProfileRaw.askClarifyingQuestions : undefined,
          mediaPlan: mediaPlanRaw
            ? {
                heroAssetMode: cleanString(mediaPlanRaw.heroAssetMode, 20),
                heroAssetNote: cleanString(mediaPlanRaw.heroAssetNote, 240),
                heroImage: cleanMediaReference(mediaPlanRaw.heroImage) || undefined,
                heroVideo: cleanMediaReference(mediaPlanRaw.heroVideo) || undefined,
              }
            : undefined,
        }
      : undefined,
    funnelBrief: funnelBriefRaw
      ? {
          companyContext: cleanString(funnelBriefRaw.companyContext, 960),
          funnelGoal: cleanString(funnelBriefRaw.funnelGoal, 320),
          offerSummary: cleanString(funnelBriefRaw.offerSummary, 320),
          audienceSummary: cleanString(funnelBriefRaw.audienceSummary, 320),
          qualificationFields: cleanString(funnelBriefRaw.qualificationFields, 480),
          routingDestination: cleanString(funnelBriefRaw.routingDestination, 480),
          integrationPlan: cleanString(funnelBriefRaw.integrationPlan, 480),
        }
      : undefined,
  };
}

function buildRecentIterationNotes(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  maxItems = 4,
) {
  return history
    .slice(-8)
    .map((entry) => {
      const content = cleanString(entry.content, 220);
      if (!content) return null;
      return `${entry.role === "assistant" ? "Last applied change or learned note" : "Recent user direction"}: ${content}`;
    })
    .filter((item): item is string => Boolean(item))
    .slice(-maxItems);
}

const bodySchema = z.object({
  funnelId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(12000),
  currentHtml: z.string().optional().default(""),
  currentCss: z.string().optional().default(""),
  contextKeys: z.array(z.string().trim().min(1).max(160)).max(60).optional().default([]),
  contextMedia: z
    .array(
      z
        .object({
          url: z.string().trim().min(1).max(2000),
          fileName: z.string().trim().max(400).optional(),
          mimeType: z.string().trim().max(160).optional(),
        })
        .strip(),
    )
    .max(24)
    .optional()
    .default([]),
  chatHistory: z
    .array(
      z
        .object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(16000),
        })
        .strip(),
    )
    .max(30)
    .optional()
    .default([]),
  intentProfile: z
    .object({
      pageType: z.string().trim().max(40).optional(),
      pageGoal: z.string().trim().max(480).optional(),
      audience: z.string().trim().max(320).optional(),
      offer: z.string().trim().max(320).optional(),
      primaryCta: z.string().trim().max(160).optional(),
      companyContext: z.string().trim().max(720).optional(),
      qualificationFields: z.string().trim().max(480).optional(),
      routingDestination: z.string().trim().max(480).optional(),
      formStrategy: z.string().trim().max(40).optional(),
      shellConcept: z.string().trim().max(1200).optional(),
      sectionPlan: z.string().trim().max(1200).optional(),
      askClarifyingQuestions: z.boolean().optional(),
      mediaPlan: z
        .object({
          heroAssetMode: z.string().trim().max(20).optional(),
          heroAssetNote: z.string().trim().max(240).optional(),
          heroImage: z
            .object({
              url: z.string().trim().min(1).max(2000),
              fileName: z.string().trim().max(400).optional(),
              mimeType: z.string().trim().max(160).optional(),
            })
            .strip()
            .optional(),
          heroVideo: z
            .object({
              url: z.string().trim().min(1).max(2000),
              fileName: z.string().trim().max(400).optional(),
              mimeType: z.string().trim().max(160).optional(),
            })
            .strip()
            .optional(),
        })
        .strip()
        .optional(),
    })
    .strip()
    .optional(),
  funnelBrief: z
    .object({
      companyContext: z.string().trim().max(960).optional(),
      funnelGoal: z.string().trim().max(320).optional(),
      offerSummary: z.string().trim().max(320).optional(),
      audienceSummary: z.string().trim().max(320).optional(),
      qualificationFields: z.string().trim().max(480).optional(),
      routingDestination: z.string().trim().max(480).optional(),
      integrationPlan: z.string().trim().max(480).optional(),
    })
    .strip()
    .optional(),
});

const blockStyleSchema = z
  .object({
    textColor: z.string().trim().max(40).optional(),
    backgroundColor: z.string().trim().max(40).optional(),
    backgroundImageUrl: z.string().trim().max(2000).optional(),
    fontSizePx: z.number().finite().min(8).max(96).optional(),
    fontFamily: z.string().trim().max(120).optional(),
    fontGoogleFamily: z.string().trim().max(120).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    marginTopPx: z.number().finite().min(0).max(240).optional(),
    marginBottomPx: z.number().finite().min(0).max(240).optional(),
    paddingPx: z.number().finite().min(0).max(240).optional(),
    borderRadiusPx: z.number().finite().min(0).max(160).optional(),
    borderColor: z.string().trim().max(40).optional(),
    borderWidthPx: z.number().finite().min(0).max(24).optional(),
    maxWidthPx: z.number().finite().min(120).max(1400).optional(),
  })
  .strip();

const chatbotBlockSchema = z
  .object({
    type: z.literal("chatbot"),
    props: z
      .object({
        agentId: z.string().trim().max(120).optional(),
        primaryColor: z.string().trim().max(40).optional(),
        launcherStyle: z.enum(["bubble", "dots", "spark"]).optional(),
        launcherImageUrl: z.string().trim().max(2000).optional(),
        placementX: z.enum(["left", "center", "right"]).optional(),
        placementY: z.enum(["top", "middle", "bottom"]).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const imageBlockSchema = z
  .object({
    type: z.literal("image"),
    props: z
      .object({
        src: z.string().trim().max(2000),
        alt: z.string().trim().max(400).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const videoBlockSchema = z
  .object({
    type: z.literal("video"),
    props: z
      .object({
        src: z.string().trim().max(2000),
        name: z.string().trim().max(200).optional(),
        posterUrl: z.string().trim().max(2000).optional(),
        controls: z.boolean().optional(),
        autoplay: z.boolean().optional(),
        loop: z.boolean().optional(),
        muted: z.boolean().optional(),
        aspectRatio: z.enum(["auto", "16:9", "9:16", "4:3", "1:1"]).optional(),
        fit: z.enum(["contain", "cover"]).optional(),
        showFrame: z.boolean().optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const headingBlockSchema = z
  .object({
    type: z.literal("heading"),
    props: z
      .object({
        text: z.string().trim().min(1).max(240),
        level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const paragraphBlockSchema = z
  .object({
    type: z.literal("paragraph"),
    props: z
      .object({
        text: z.string().trim().min(1).max(2000),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const buttonBlockSchema = z
  .object({
    type: z.literal("button"),
    props: z
      .object({
        text: z.string().trim().min(1).max(120),
        href: z.string().trim().min(1).max(600),
        variant: z.enum(["primary", "secondary"]).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const spacerBlockSchema = z
  .object({
    type: z.literal("spacer"),
    props: z
      .object({
        height: z.number().finite().min(0).max(240).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const formLinkBlockSchema = z
  .object({
    type: z.literal("formLink"),
    props: z
      .object({
        formSlug: z.string().trim().min(1).max(120),
        text: z.string().trim().max(120).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const formEmbedBlockSchema = z
  .object({
    type: z.literal("formEmbed"),
    props: z
      .object({
        formSlug: z.string().trim().min(1).max(120),
        height: z.number().finite().min(120).max(1600).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const calendarEmbedBlockSchema = z
  .object({
    type: z.literal("calendarEmbed"),
    props: z
      .object({
        calendarId: z.string().trim().min(1).max(120),
        height: z.number().finite().min(120).max(1600).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const salesCheckoutButtonBlockSchema = z
  .object({
    type: z.literal("salesCheckoutButton"),
    props: z
      .object({
        priceId: z.string().trim().max(140).optional().default(""),
        quantity: z.number().finite().min(1).max(20).optional(),
        text: z.string().trim().max(120).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiInsertableBlockSchema = z.discriminatedUnion("type", [
  chatbotBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
  headingBlockSchema,
  paragraphBlockSchema,
  buttonBlockSchema,
  spacerBlockSchema,
  formLinkBlockSchema,
  formEmbedBlockSchema,
  calendarEmbedBlockSchema,
  salesCheckoutButtonBlockSchema,
]);

const presetKeySchema = z.enum(["hero", "body", "form", "shop"]);

const aiInsertAfterActionSchema = z
  .object({
    type: z.literal("insertAfter"),
    block: aiInsertableBlockSchema,
  })
  .strip();

const aiInsertPresetAfterActionSchema = z
  .object({
    type: z.literal("insertPresetAfter"),
    preset: presetKeySchema,
  })
  .strip();

const aiActionSchema = z.union([aiInsertAfterActionSchema, aiInsertPresetAfterActionSchema]);

const aiActionsPayloadSchema = z
  .object({
    actions: z.array(aiActionSchema).min(1).max(6),
  })
  .strip();

const aiFormPickSchema = z
  .object({
    pick: z.enum(["default", "bySlug", "byName"]),
    value: z.string().trim().max(120).optional(),
  })
  .strip();

const aiCalendarPickSchema = z
  .object({
    pick: z.enum(["default", "byId", "byTitle"]),
    value: z.string().trim().max(120).optional(),
  })
  .strip();

const aiAnalysisFormLinkBlockSchema = z
  .object({
    type: z.literal("formLink"),
    props: z
      .object({
        form: aiFormPickSchema,
        text: z.string().trim().max(120).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiAnalysisFormEmbedBlockSchema = z
  .object({
    type: z.literal("formEmbed"),
    props: z
      .object({
        form: aiFormPickSchema,
        height: z.number().finite().min(120).max(1600).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiAnalysisCalendarEmbedBlockSchema = z
  .object({
    type: z.literal("calendarEmbed"),
    props: z
      .object({
        calendar: aiCalendarPickSchema,
        height: z.number().finite().min(120).max(1600).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiAnalysisSalesCheckoutButtonBlockSchema = z
  .object({
    type: z.literal("salesCheckoutButton"),
    props: z
      .object({
        priceId: z.string().trim().max(140).optional().default(""),
        quantity: z.number().finite().min(1).max(20).optional(),
        text: z.string().trim().max(120).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiAnalysisInsertableBlockSchema = z.discriminatedUnion("type", [
  chatbotBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
  headingBlockSchema,
  paragraphBlockSchema,
  buttonBlockSchema,
  spacerBlockSchema,
  aiAnalysisFormLinkBlockSchema,
  aiAnalysisFormEmbedBlockSchema,
  aiAnalysisCalendarEmbedBlockSchema,
  aiAnalysisSalesCheckoutButtonBlockSchema,
]);

const aiAnalysisInsertAfterActionSchema = z
  .object({
    type: z.literal("insertAfter"),
    block: aiAnalysisInsertableBlockSchema,
  })
  .strip();

const aiAnalysisInsertPresetAfterActionSchema = z
  .object({
    type: z.literal("insertPresetAfter"),
    preset: presetKeySchema,
  })
  .strip();

const aiAnalysisActionSchema = z.union([aiAnalysisInsertAfterActionSchema, aiAnalysisInsertPresetAfterActionSchema]);

const aiAnalysisDiagnosisSchema = z
  .object({
    problemType: z
      .enum(["placement", "layout", "hierarchy", "flatness", "tone", "feedback", "cta", "proof", "readability", "other"])
      .optional(),
    affectedRegion: z.string().trim().min(1).max(120).optional(),
    offendingElement: z.string().trim().min(1).max(160).optional(),
    collisionTarget: z.string().trim().min(1).max(160).optional(),
    intendedOutcome: z.string().trim().min(1).max(220).optional(),
    safePlacement: z.string().trim().min(1).max(220).optional(),
    missingQualities: z.array(z.string().trim().min(1).max(120)).max(4).optional(),
    coexistenceRisks: z.array(z.string().trim().min(1).max(160)).max(4).optional(),
  })
  .strip();

const aiAnalysisPayloadSchema = z
  .object({
    output: z.enum(["actions", "html", "question"]),
    summary: z.string().trim().min(1).max(180).optional(),
    diagnosis: aiAnalysisDiagnosisSchema.optional(),
    actions: z.array(aiAnalysisActionSchema).min(1).max(6).optional(),
    buildPrompt: z.string().trim().min(1).max(4000).optional(),
    question: z.string().trim().min(1).max(800).optional(),
  })
  .strip();

function clampText(s: string, maxLen: number) {
  const text = String(s || "");
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n/* truncated */";
}

function compactPromptIntent(value: string, maxLen = 96) {
  const compact = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!compact) return "this block";

  const stripped = compact.replace(
    /^(can you |could you |please |i want you to |make sure |go ahead and |just |i need you to |can we |let'?s )/i,
    "",
  );
  if (stripped.length <= maxLen) return stripped;
  const cut = stripped.slice(0, maxLen).lastIndexOf(" ");
  return `${stripped.slice(0, cut > 36 ? cut : maxLen).trimEnd()}...`;
}

function trimSentenceEnding(value: string) {
  return String(value || "").replace(/[\s.!?]+$/g, "").trim();
}

function sentenceFromFragment(value: string) {
  const trimmed = trimSentenceEnding(value);
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

function joinSummaryPhrases(parts: string[]) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts.length - 2} more`;
}

function pickMeaningfulAnalysisSummary(value: string) {
  const sentence = sentenceFromFragment(String(value || "").slice(0, 180));
  if (!sentence) return "";
  const normalized = sentence.toLowerCase();
  if (/^(enhance|improve|refine|strengthen|elevate|clarify|repair|fix|reduce|increase|push|make|adjust|revise|rework|redesign|move|shift|place|change)\b/.test(normalized)) {
    return "";
  }
  if (/(premium consultation experience|visual hierarchy and spacing|intentional, polished presentation)/.test(normalized)) {
    return "";
  }
  if (!/^(added|updated|refined|reworked|restored|removed|created|improved|reduced|resolved|tightened|simplified|repositioned|aligned|organized|the\b.*\bnow\b)/.test(normalized)) {
    return "";
  }
  return sentence;
}

function extractPromptFocus(value: string, maxLen = 72) {
  const compact = compactPromptIntent(value, maxLen)
    .replace(/^(update|change|edit|adjust|refine|improve|clean up|cleanup|tighten|rework|rewrite|restyle|polish|move|shift|set|switch|turn|replace|add|remove|save|fix|make)\s+/i, "")
    .replace(/^(the|this|that|my|our)\s+/i, "")
    .replace(/\s+(feel|looks?|be|become|seem|read|reads)\b.*$/i, "")
    .replace(/\s+(with|using|while|so that|so the|to keep|to make)\b.*$/i, "")
    .replace(/[,:;]+$/g, "")
    .trim();
  const cleaned = trimSentenceEnding(compact).replace(/^["']+|["']+$/g, "").trim();
  if (!cleaned || /^(it|this|that|here|there|this block)$/i.test(cleaned)) return "";
  return `${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
}

function buildActionsResultSummary(actions: z.infer<typeof aiActionsPayloadSchema>["actions"]) {
  if (!actions.length) return "Prepared the next page update.";

  const labels = actions.map((action) => {
    if (action.type === "insertPresetAfter") {
      if (action.preset === "hero") return "hero section";
      if (action.preset === "body") return "body section";
      if (action.preset === "form") return "form section";
      if (action.preset === "shop") return "shop section";
      return "preset section";
    }

    const blockType = action.block.type;
    if (blockType === "calendarEmbed") return "booking calendar";
    if (blockType === "formEmbed") return "embedded form";
    if (blockType === "formLink") return "form link";
    if (blockType === "salesCheckoutButton") return "checkout action";
    if (blockType === "chatbot") return "chatbot block";
    if (blockType === "image") return "image block";
    if (blockType === "video") return "video block";
    if (blockType === "heading") return "heading block";
    if (blockType === "paragraph") return "text block";
    if (blockType === "button") return "button block";
    return `${blockType} block`;
  });

  const unique = Array.from(new Set(labels));
  if (unique.length === 1) return `Added a ${unique[0]} to the page.`;
  if (unique.length === 2) return `Added ${unique[0]} and ${unique[1]} to the page.`;
  return `Added ${joinSummaryPhrases(unique.slice(0, 3))} to the page.`;
}

function buildCustomCodeResultSummary(opts: {
  prompt: string;
  previousHtml: string;
  nextHtml: string;
  previousCss: string;
  nextCss: string;
  analysisSummary?: string;
}) {
  const analysisSummary = pickMeaningfulAnalysisSummary(opts.analysisSummary || "");
  if (analysisSummary) return analysisSummary;

  const htmlChanged = String(opts.previousHtml || "") !== String(opts.nextHtml || "");
  const cssChanged = String(opts.previousCss || "") !== String(opts.nextCss || "");

  if (htmlChanged && cssChanged) return "Reworked the block layout and styles.";
  if (htmlChanged) return "Updated the block layout.";
  if (cssChanged) return "Refined the block styles.";
  return "Reviewed the block, but nothing new was saved.";
}

function buildAnalysisDiagnosisBlock(diagnosis: z.infer<typeof aiAnalysisDiagnosisSchema> | undefined) {
  if (!diagnosis) return "";

  const lines: string[] = [];
  if (diagnosis.problemType) lines.push(`- Problem type: ${diagnosis.problemType}`);
  if (diagnosis.affectedRegion) lines.push(`- Affected region: ${diagnosis.affectedRegion}`);
  if (diagnosis.offendingElement) lines.push(`- Offending element: ${diagnosis.offendingElement}`);
  if (diagnosis.collisionTarget) lines.push(`- Collision target: ${diagnosis.collisionTarget}`);
  if (diagnosis.intendedOutcome) lines.push(`- Intended outcome: ${diagnosis.intendedOutcome}`);
  if (diagnosis.safePlacement) lines.push(`- Safe placement: ${diagnosis.safePlacement}`);
  if (diagnosis.missingQualities?.length) lines.push(`- Missing qualities: ${diagnosis.missingQualities.join(", ")}`);
  if (diagnosis.coexistenceRisks?.length) lines.push(`- Coexistence risks: ${diagnosis.coexistenceRisks.join(", ")}`);
  if (!lines.length) return "";

  return ["SCENE_DIAGNOSIS:", ...lines].join("\n");
}

function countPatternMatches(value: string, pattern: RegExp) {
  return (String(value || "").match(pattern) || []).length;
}

function buildShellFrameContextBlock(shellFrame: FunnelShellFrame | null) {
  if (!shellFrame) return "";
  return [
    "SHELL_FRAME:",
    `- Label: ${shellFrame.label}`,
    `- Summary: ${shellFrame.summary}`,
    `- Shell concept: ${shellFrame.shellConcept}`,
    `- Section plan: ${shellFrame.sectionPlan}`,
    `- Visual tone: ${shellFrame.visualTone}`,
    `- Proof model: ${shellFrame.proofModel}`,
    `- CTA rhythm: ${shellFrame.ctaRhythm}`,
    `- Brand use: ${shellFrame.brandUse}`,
    ...(shellFrame.designDirectives.length ? [`- Design directives: ${shellFrame.designDirectives.join(" | ")}`] : []),
  ].join("\n");
}

function buildArchetypeContextBlock(archetypes: FunnelExhibitArchetype[]) {
  if (!archetypes.length) return "";
  const lines = ["RELEVANT_ARCHETYPE_SIGNALS:"];
  for (const archetype of archetypes) {
    lines.push(`- Archetype: ${archetype.label}`);
    if (archetype.designTone) lines.push(`- ${archetype.label} tone: ${archetype.designTone}`);
    if (archetype.proofStrategy) lines.push(`- ${archetype.label} proof strategy: ${archetype.proofStrategy}`);
    if (archetype.ctaCadence) lines.push(`- ${archetype.label} CTA cadence: ${archetype.ctaCadence}`);
    if (archetype.antiPatterns.length) lines.push(`- ${archetype.label} anti-patterns: ${archetype.antiPatterns.join(" | ")}`);
  }
  return lines.join("\n");
}

function buildStructuralGuidanceBlock(sceneQuality: ReturnType<typeof assessFunnelSceneQuality>) {
  const lines = [
    "STRUCTURAL_PASS_GUIDANCE:",
    `- Dominant issue: ${sceneQuality.dominantIssue.title}`,
    `- Detail: ${sceneQuality.dominantIssue.detail}`,
    ...sceneQuality.structuralPriorities.map((item, index) => `${index + 1}. ${item.title}: ${item.detail}`),
  ];
  return lines.join("\n");
}

function detectPremiumToneRequest(prompt: string, shellFrame: FunnelShellFrame | null, archetypes: FunnelExhibitArchetype[]) {
  const blob = [prompt, shellFrame?.visualTone || "", ...archetypes.map((item) => `${item.designTone} ${item.label}`)].join(" ");
  return /premium|character|intentional|editorial|refined|elevated|calm|high-trust|luxury|distinct/i.test(blob);
}

function getSurfaceCharacterSignals(css: string) {
  const value = String(css || "");
  return {
    gradientCount: countPatternMatches(value, /gradient\(/gi),
    shadowCount: countPatternMatches(value, /box-shadow\s*:/gi),
    borderCount: countPatternMatches(value, /border(?:-radius|-color|-width)?\s*:/gi),
    textureCount: countPatternMatches(value, /(backdrop-filter|filter\s*:|mix-blend-mode|opacity\s*:|transform\s*:)/gi),
    backgroundToneCount: countPatternMatches(value, /background(?:-color)?\s*:/gi),
  };
}

function isNarrowRepairPrompt(prompt: string) {
  return /overlap|header|collid|cover|clipp|inside the hero|nearby content|too large|padding is wrong|fix the overlap/i.test(String(prompt || ""));
}

function parseScenePlanItems(raw: string) {
  return String(raw || "")
    .split(/->|\n|•|\u2022/g)
    .map((item) => item.replace(/^[-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function buildCurrentFragmentSceneSnapshot(
  currentHtml: string,
  currentCss: string,
  shellFrame: FunnelShellFrame | null,
  archetypes: FunnelExhibitArchetype[],
) {
  const html = String(currentHtml || "");
  const css = String(currentCss || "");
  if (!html.trim() && !css.trim()) return "";

  const anatomy = buildFragmentSceneAnatomy(html, css);
  const sectionPlanItems = parseScenePlanItems(shellFrame?.sectionPlan || "");
  const sceneQuality = assessFunnelSceneQuality({
    pageAnatomy: anatomy,
    proofResolved: Boolean(shellFrame?.proofModel && shellFrame.proofModel !== "Not resolved yet."),
    ctaResolved: anatomy.actions + anatomy.forms >= 1,
    sectionPlanItems,
    proofModel: shellFrame?.proofModel,
  });
  const sectionCount = anatomy.sections;
  const headingCount = anatomy.headers;
  const paragraphCount = anatomy.textNodes;
  const actionCount = anatomy.actions;
  const mediaCount = anatomy.media;
  const formSignalCount = anatomy.forms;
  const negativeSpacingCount = countPatternMatches(css, /(margin-top|margin-bottom|top|bottom)\s*:\s*-\d|(translate|translateY)\(\s*-\d/gi);
  const offsetPositionCount = countPatternMatches(css, /position\s*:\s*(relative|absolute|fixed|sticky)[\s\S]{0,160}?(top|right|bottom|left)\s*:\s*-?\d/gi);
  const viewportShellCount = countPatternMatches(css, /(100d?vh|position\s*:\s*fixed|min-height\s*:\s*100%)/gi);
  const flatnessRisk = sectionCount <= 1 && headingCount <= 1 && mediaCount === 0;
  const weakChecks = sceneQuality.pageQualityChecks.filter((item) => item.tone !== "good").slice(0, 3);
  const toneRequested = detectPremiumToneRequest(html + css, shellFrame, archetypes);
  const surfaceSignals = getSurfaceCharacterSignals(css);
  const surfaceCharacterThin = surfaceSignals.gradientCount + surfaceSignals.shadowCount + surfaceSignals.textureCount + Math.min(surfaceSignals.backgroundToneCount, 2) <= 1;

  const lines = [
    "CURRENT_FRAGMENT_SCENE:",
    `- Sections: ${sectionCount}`,
    `- Headings: ${headingCount}`,
    `- Paragraphs: ${paragraphCount}`,
    `- Actions: ${actionCount}`,
    `- Media nodes: ${mediaCount}`,
    `- Form signals: ${formSignalCount}`,
    `- Text-heavy risk: ${sceneQuality.textHeavy ? "high" : "low"}`,
    `- Flatness risk: ${flatnessRisk ? "high" : "low"}`,
    `- Negative spacing signals: ${negativeSpacingCount}`,
    `- Positioned offset signals: ${offsetPositionCount}`,
    `- Viewport shell signals: ${viewportShellCount}`,
    `- Opening frame: ${sceneQuality.pageQualityChecks.find((item) => item.key === "opening-frame")?.state || "Weak"}`,
    `- Hierarchy and contrast: ${sceneQuality.pageQualityChecks.find((item) => item.key === "hierarchy-contrast")?.state || "Flat"}`,
    `- Section rhythm: ${sceneQuality.pageQualityChecks.find((item) => item.key === "section-rhythm")?.state || "Monotone"}`,
    `- Proof staging: ${sceneQuality.pageQualityChecks.find((item) => item.key === "proof-staging")?.state || "Underdesigned"}`,
    `- CTA placement: ${sceneQuality.pageQualityChecks.find((item) => item.key === "cta-placement")?.state || "Under-supported"}`,
    `- Composition system: ${sceneQuality.pageQualityChecks.find((item) => item.key === "composition-system")?.state || "Thin"}`,
    `- Surface character: ${surfaceCharacterThin ? "plain" : "developing"}`,
  ];

  if (shellFrame) {
    lines.push(`- Shell expectation: ${shellFrame.summary}`);
    lines.push(`- Shell tone target: ${shellFrame.visualTone}`);
    lines.push(`- Shell proof target: ${shellFrame.proofModel}`);
    lines.push(`- Shell CTA target: ${shellFrame.ctaRhythm}`);
  }
  if (archetypes.length) {
    lines.push(`- Relevant archetypes: ${archetypes.map((item) => item.label).join(", ")}`);
  }

  if (negativeSpacingCount > 0 || offsetPositionCount > 0) {
    lines.push("- Coexistence warning: current spacing or offsets may be pushing content into neighboring regions.");
  }
  if (flatnessRisk) {
    lines.push("- Design warning: this fragment may read as a flat slab and may need hierarchy or contrast work instead of only local spacing changes.");
  }
  if (!sceneQuality.proofStagingResolved && shellFrame?.proofModel) {
    lines.push("- Design warning: the fragment is not yet expressing the shell's proof model strongly enough.");
  }
  if (!sceneQuality.actionPlacementResolved && shellFrame?.ctaRhythm) {
    lines.push("- Design warning: the fragment is not yet supporting the shell's CTA rhythm clearly enough.");
  }
  if (flatnessRisk && archetypes.some((item) => item.antiPatterns.some((pattern) => /generic|template|startup|noise/i.test(pattern)))) {
    lines.push("- Archetype warning: the fragment risks drifting into a generic template feel instead of the intended funnel posture.");
  }
  if (!sceneQuality.proofStagingResolved && archetypes.some((item) => item.antiPatterns.some((pattern) => /proof|trust/i.test(pattern)))) {
    lines.push("- Archetype warning: proof appears buried relative to the active funnel archetype.");
  }
  if (!sceneQuality.actionPlacementResolved && archetypes.some((item) => item.antiPatterns.some((pattern) => /cta|action/i.test(pattern)))) {
    lines.push("- Archetype warning: CTA support is weaker than the active funnel archetype expects.");
  }
  if (toneRequested && surfaceCharacterThin) {
    lines.push("- Tone warning: the fragment still reads visually plain for the requested premium or character-led direction.");
  }
  for (const check of weakChecks) {
    lines.push(`- Structural pressure: ${check.title} -> ${check.detail}`);
  }

  return lines.join("\n");
}

function buildGeneratedFragmentWarnings(
  nextHtml: string,
  nextCss: string,
  shellFrame: FunnelShellFrame | null,
  archetypes: FunnelExhibitArchetype[],
  prompt: string,
) {
  const html = String(nextHtml || "");
  const css = String(nextCss || "");
  const warnings: string[] = [];
  const anatomy = buildFragmentSceneAnatomy(html, css);
  const sceneQuality = assessFunnelSceneQuality({
    pageAnatomy: anatomy,
    proofResolved: Boolean(shellFrame?.proofModel && shellFrame.proofModel !== "Not resolved yet."),
    ctaResolved: anatomy.actions + anatomy.forms >= 1,
    sectionPlanItems: parseScenePlanItems(shellFrame?.sectionPlan || ""),
    proofModel: shellFrame?.proofModel,
  });
  const sectionCount = anatomy.sections;
  const paragraphCount = anatomy.textNodes;
  const headingCount = anatomy.headers;
  const actionCount = anatomy.actions;
  const mediaCount = anatomy.media;
  const toneRequested = detectPremiumToneRequest(html + css, shellFrame, archetypes);
  const surfaceSignals = getSurfaceCharacterSignals(css);
  const surfaceCharacterThin = surfaceSignals.gradientCount + surfaceSignals.shadowCount + surfaceSignals.textureCount + Math.min(surfaceSignals.backgroundToneCount, 2) <= 1;
  const narrowRepair = isNarrowRepairPrompt(prompt);

  if (countPatternMatches(css, /(margin-top|margin-bottom|top|bottom)\s*:\s*-\d|(translate|translateY)\(\s*-\d/gi) > 0) {
    warnings.push("Generated fragment still uses negative offsets or spacing that may reintroduce overlap.");
  }
  if (countPatternMatches(css, /position\s*:\s*(fixed|sticky)\b/gi) > 0) {
    warnings.push("Generated fragment uses fixed or sticky positioning, which can conflict with surrounding funnel layout.");
  }
  if (countPatternMatches(css, /(100d?vh|min-height\s*:\s*100%)/gi) > 0) {
    warnings.push("Generated fragment behaves like a full-screen shell instead of an embeddable section.");
  }
  if (countPatternMatches(html, /<(html|body|main)\b/gi) > 0) {
    warnings.push("Generated fragment includes full-page wrapper tags that may not coexist inside the current block.");
  }
  if (
    sectionCount <= 1 &&
    mediaCount === 0 &&
    !narrowRepair &&
    archetypes.some((item) => item.antiPatterns.some((pattern) => /generic|template|startup|noise/i.test(pattern)))
  ) {
    warnings.push("Generated fragment may still read like a flat generic section instead of the intended funnel archetype.");
  }
  if (!narrowRepair && sectionCount <= 2 && headingCount <= 2 && paragraphCount >= Math.max(2, actionCount + 1) && mediaCount === 0) {
    warnings.push("Generated fragment may still be too text-heavy and visually flat for a premium funnel section.");
  }
  if (!narrowRepair && actionCount <= 1 && archetypes.some((item) => /cta/i.test(item.ctaCadence))) {
    warnings.push("Generated fragment may still under-support CTA cadence relative to the active funnel archetype.");
  }
  if (!narrowRepair && toneRequested && surfaceCharacterThin) {
    warnings.push("Generated fragment may still feel too plain for the requested premium or character-led direction.");
  }
  for (const check of sceneQuality.pageQualityChecks.filter((item) => item.tone !== "good")) {
    if (narrowRepair && check.key !== "opening-frame" && check.key !== "composition-system") continue;
    if (check.key === "opening-frame") warnings.push("Generated fragment still lacks a deliberate opening frame with a clear action path.");
    if (check.key === "hierarchy-contrast") warnings.push("Generated fragment still lacks enough hierarchy or contrast to avoid a flat read.");
    if (check.key === "section-rhythm") warnings.push("Generated fragment may still read as one continuous slab instead of a sequenced funnel section.");
    if (check.key === "proof-staging" && shellFrame?.proofModel) warnings.push("Generated fragment still under-stages proof relative to the intended shell.");
    if (check.key === "cta-placement" && shellFrame?.ctaRhythm) warnings.push("Generated fragment still under-supports CTA placement across the section.");
  }

  return Array.from(new Set(warnings)).slice(0, 4);
}

function extractFence(text: string, lang: string): string {
  const re = new RegExp("```" + lang + "\\s*([\\s\\S]*?)\\s*```", "i");
  const m = String(text || "").match(re);
  return m?.[1] ? m[1].trim() : "";
}

function extractInlineStyleTags(html: string): { html: string; css: string } {
  const h = String(html || "");
  if (!h.trim()) return { html: "", css: "" };

  const cssParts: string[] = [];
  const nextHtml = h.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
    const c = String(css || "").trim();
    if (c) cssParts.push(c);
    return "";
  });

  return { html: nextHtml.trim(), css: cssParts.join("\n\n").trim() };
}

function coerceHtmlFragment(html: string): { html: string; cssFromHtml: string } {
  const raw = String(html || "").trim();
  if (!raw) return { html: "", cssFromHtml: "" };

  const { html: withoutStyles, css } = extractInlineStyleTags(raw);
  const h = withoutStyles.trim();

  if (!/(<!doctype\b|<html\b|<head\b|<body\b)/i.test(h)) {
    return { html: h, cssFromHtml: css };
  }

  const bodyMatch = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const inner = (bodyMatch?.[1] ?? h)
    .replace(/^\s*<!doctype[^>]*>\s*/i, "")
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .trim();

  return { html: inner, cssFromHtml: css };
}

function hasPlaceholderOrPortalLinks(html: string, css: string) {
  const blob = `${String(html || "")}\n${String(css || "")}`;
  const lower = blob.toLowerCase();
  if (!lower.trim()) return false;

  // Common placeholder patterns the model should never emit.
  if (/\byour_[a-z0-9_\-]+_here\b/i.test(blob)) return true;
  if (/\byour_[a-z0-9_\-]+_link_here\b/i.test(blob)) return true;
  if (lower.includes("your_calendar_embed_link_here")) return true;
  if (lower.includes("your_chatbot_link_here")) return true;

  // Internal portal routes do not exist on public funnels.
  if (lower.includes("/portal/")) return true;

  return false;
}

function promptPrefersInPlaceHtmlEdit(prompt: string) {
  const text = String(prompt || "").trim().toLowerCase();
  if (!text) return false;

  const styleFixIntent =
    /\b(contrast|readable|readability|legible|visibility|visible|text color|background|color|spacing|padding|margin|font|typography|style|restyle|redesign|clean up|cleanup|polish|tighten|fix|tweak|align|layout)\b/i.test(
      text,
    );

  const explicitIntegrationIntent =
    /\b(add|insert|embed|connect|wire|hook up|swap in|replace with|use my|place)\b[\s\S]{0,40}\b(form|calendar|booking|chatbot|chat widget|cart|checkout|shop|store|stripe|product)\b/i.test(
      text,
    ) ||
    /\b(form|calendar|booking|chatbot|chat widget|cart|checkout|shop|store|stripe|product)\b[\s\S]{0,40}\b(add|insert|embed|connect|wire|hook up|swap in|replace with|use my|place)\b/i.test(
      text,
    );

  return styleFixIntent && !explicitIntegrationIntent;
}

function promptRequestsFunctionalEmbed(prompt: string) {
  const text = String(prompt || "").trim().toLowerCase();
  if (!text) return false;

  const embedVerb = /(add|insert|embed|connect|wire|hook up|swap in|replace with|use my|place|attach|drop in)/;
  const integrationTarget = /(form|calendar|booking widget|booking calendar|chatbot|chat widget|cart|checkout|shop|store|stripe|product list|payment link)/;
  return embedVerb.test(text) && integrationTarget.test(text);
}

function inferForcedActionsFromIntent(opts: {
  prompt: string;
  html: string;
  forms: Array<{ slug: string; name: string; status: string }>;
  calendars: Array<{ id: string; enabled: boolean; title: string }>;
  hasStripeProducts: boolean;
}) {
  const prompt = String(opts.prompt || "");
  const haystack = prompt.toLowerCase();
  const explicitEmbedIntent = promptRequestsFunctionalEmbed(prompt);

  const wantsCalendar =
    (explicitEmbedIntent && /\b(calendar|booking|book\b|schedule|appointment|appoint)\b/i.test(haystack)) ||
    haystack.includes("your_calendar_embed_link_here");
  const wantsForm =
    (explicitEmbedIntent && /\b(form|application|apply\b|intake|questionnaire|survey)\b/i.test(haystack)) ||
    haystack.includes("/forms/") ||
    haystack.includes("/portal/forms/");
  const wantsChatbot =
    (explicitEmbedIntent && /\b(chatbot|chat widget|live chat|ai chat)\b/i.test(haystack)) ||
    haystack.includes("your_chatbot_link_here");

  // Only force shop preset when the user is clearly asking for a commerce integration.
  const wantsShop =
    explicitEmbedIntent &&
    /\b(add to cart|cart\b|checkout\b|buy now|purchase\b|stripe\b|shop\b|store\b)\b/i.test(haystack) &&
    (opts.hasStripeProducts || /\b(stripe|checkout|add to cart|cart)\b/i.test(haystack));

  const actions: Array<any> = [];

  if (wantsShop) {
    actions.push({ type: "insertPresetAfter", preset: "shop" });
  }

  if (wantsForm) {
    const formSlug = pickDefaultFormSlug(opts.forms);
    if (formSlug) actions.push({ type: "insertAfter", block: { type: "formEmbed", props: { formSlug, height: 720 } } });
  }

  if (wantsCalendar) {
    const calendarId = pickDefaultCalendarId(opts.calendars);
    if (calendarId)
      actions.push({ type: "insertAfter", block: { type: "calendarEmbed", props: { calendarId, height: 780 } } });
  }

  if (wantsChatbot) {
    actions.push({ type: "insertAfter", block: { type: "chatbot", props: {} } });
  }

  return actions.length ? actions.slice(0, 6) : null;
}

function toAbsoluteUrl(req: Request, url: string): string {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin = new URL(req.url).origin;
  return new URL(u, origin).toString();
}

function pickDefaultFormSlug(forms: Array<{ slug: string; name: string; status: string }>): string {
  const active = forms.find((f) => String(f.status).toUpperCase() === "ACTIVE");
  return (active ?? forms[0])?.slug ?? "";
}

function resolveFormSlug(
  pick: z.infer<typeof aiFormPickSchema>,
  forms: Array<{ slug: string; name: string; status: string }>,
): string {
  const fallback = pickDefaultFormSlug(forms);
  if (!forms.length) return "";

  if (pick.pick === "default") return fallback;
  const value = (pick.value ?? "").trim();
  if (!value) return fallback;

  if (pick.pick === "bySlug") {
    const found = forms.find((f) => f.slug.toLowerCase() === value.toLowerCase());
    return found?.slug ?? fallback;
  }

  // byName
  const needle = value.toLowerCase();
  const found = forms.find((f) => (f.name ?? "").toLowerCase() === needle);
  if (found) return found.slug;
  const fuzzy = forms.find((f) => (f.name ?? "").toLowerCase().includes(needle));
  return fuzzy?.slug ?? fallback;
}

function pickDefaultCalendarId(calendars: Array<{ id: string; enabled: boolean; title: string }>): string {
  const enabled = calendars.find((c) => c.enabled);
  return (enabled ?? calendars[0])?.id ?? "";
}

function resolveCalendarId(
  pick: z.infer<typeof aiCalendarPickSchema>,
  calendars: Array<{ id: string; enabled: boolean; title: string }>,
): string {
  const fallback = pickDefaultCalendarId(calendars);
  if (!calendars.length) return "";

  if (pick.pick === "default") return fallback;
  const value = (pick.value ?? "").trim();
  if (!value) return fallback;

  if (pick.pick === "byId") {
    const found = calendars.find((c) => c.id.toLowerCase() === value.toLowerCase());
    return found?.id ?? fallback;
  }

  // byTitle
  const needle = value.toLowerCase();
  const found = calendars.find((c) => (c.title ?? "").toLowerCase() === needle);
  if (found) return found.id;
  const fuzzy = calendars.find((c) => (c.title ?? "").toLowerCase().includes(needle));
  return fuzzy?.id ?? fallback;
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
  if (!secretKey) {
    return {
      ok: false as const,
      products: [] as Array<{ id: string; name: string; description: string | null; images: string[]; defaultPriceId: string; unitAmount: number | null; currency: string }>,
    };
  }

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

export async function POST(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  // IMPORTANT: This route is called from inside the portal editor, but the
  // generated output must work on hosted/public funnels (NOT under /portal).
  const hostedBasePath = auth.variant === "credit" ? "/credit" : "";

  const json = await req.json().catch(() => null);
  const normalizedBody = normalizeGenerateBody(json);
  if (!normalizedBody.funnelId || !normalizedBody.pageId || !normalizedBody.prompt) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(normalizedBody);
  const body = parsed.success ? parsed.data : normalizedBody;
  const { funnelId, pageId, prompt, contextKeys, contextMedia, chatHistory } = body;
  const currentHtml = String(body.currentHtml || "");
  const currentCss = String(body.currentCss || "");

  // Ensure the funnel/page belongs to the current owner (authorization + context).
  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: {
      id: true,
      slug: true,
      title: true,
      funnel: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
    .catch(() => null);

  const ownerId = auth.session.user.id;
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const funnelBrief = inferFunnelBriefProfile({
    existing: body.funnelBrief || readFunnelBrief(settings?.dataJson ?? null, page.funnel.id),
    funnelName: page.funnel.name,
    funnelSlug: page.funnel.slug,
  });
  const intentProfile = inferFunnelPageIntentProfile({
    existing: body.intentProfile || readFunnelPageBrief(settings?.dataJson ?? null, page.id),
    prompt,
    funnelBrief,
    funnelName: page.funnel.name,
    funnelSlug: page.funnel.slug,
    pageTitle: page.title,
    pageSlug: page.slug,
  });
  const shellFrame = resolveFunnelShellFrame({
    frameId: null,
    pageType: intentProfile.pageType,
    formStrategy: intentProfile.formStrategy,
  });
  const routeLabel = buildFunnelPageRouteLabel(page.funnel.slug, page.slug);
  const storedExhibitArchetypePack = readFunnelExhibitArchetypePack(settings?.dataJson ?? null, page.funnel.id);
  const relevantArchetypes = selectRelevantFunnelExhibitArchetypes(storedExhibitArchetypePack, {
    pageType: intentProfile.pageType,
    prompt,
    routeLabel,
    pageTitle: page.title,
  });
  const exhibitArchetypeBlock = buildFunnelExhibitArchetypeBlock(storedExhibitArchetypePack, {
    pageType: intentProfile.pageType,
    prompt,
    routeLabel,
    pageTitle: page.title,
  });
  const strategicBusinessContext = [businessContext, exhibitArchetypeBlock].filter(Boolean).join("\n\n");
  const promptStrategy = await synthesizeFunnelGenerationPrompt({
    surface: "custom-code",
    requestPrompt: prompt,
    routeLabel,
    funnelName: page.funnel.name,
    pageTitle: page.title,
    businessContext: strategicBusinessContext,
    funnelBrief,
    intentProfile,
    currentHtml,
    currentCss,
    contextKeys,
    contextMedia,
    recentChatHistory: chatHistory,
    recentIterationMemory: buildRecentIterationNotes(chatHistory),
  });
  const strategicPrompt = promptStrategy.prompt;
  const shellFrameBlock = buildShellFrameContextBlock(shellFrame);
  const archetypeContextBlock = buildArchetypeContextBlock(relevantArchetypes);
  const visualWhyBlock = buildFunnelVisualWhyBlock({
    pageType: intentProfile.pageType,
    prompt,
    shellFrame,
    archetypes: relevantArchetypes,
  });
  const currentFragmentSceneSnapshot = buildCurrentFragmentSceneSnapshot(currentHtml, currentCss, shellFrame, relevantArchetypes);
  const currentSceneQuality = assessFunnelSceneQuality({
    pageAnatomy: buildFragmentSceneAnatomy(currentHtml, currentCss),
    proofResolved: Boolean(shellFrame?.proofModel && shellFrame.proofModel !== "Not resolved yet."),
    ctaResolved: countPatternMatches(currentHtml, /<(a|button|form|input|textarea|select)\b/gi) >= 1,
    sectionPlanItems: parseScenePlanItems(shellFrame?.sectionPlan || ""),
    proofModel: shellFrame?.proofModel,
  });
  const structuralGuidanceBlock = buildStructuralGuidanceBlock(currentSceneQuality);
  const toneRequested = detectPremiumToneRequest(prompt, shellFrame, relevantArchetypes);
  const toneGuidanceBlock = toneRequested
    ? [
        "SURFACE_CHARACTER_GUIDANCE:",
        "- Preserve the structural fixes, but avoid a plain default marketing treatment.",
        "- Create a more intentional premium feel through contrast, containment, restrained surface variation, and more distinct proof/CTA moments.",
        "- Do not solve this only by making everything larger or adding loud color.",
      ].join("\n")
    : "";
  const stripeProducts = await getStripeProductsForOwner(ownerId).catch(() => ({ ok: false as const, products: [] as any[] }));

  const forms = await prisma.creditForm.findMany({
    where: { ownerId },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    select: { slug: true, name: true, status: true },
  });

  const calendarsConfig = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] }));
  const calendars = (calendarsConfig as any)?.calendars && Array.isArray((calendarsConfig as any).calendars)
    ? ((calendarsConfig as any).calendars as Array<{ id: string; enabled: boolean; title: string }>)
    : ([] as Array<{ id: string; enabled: boolean; title: string }>);

  const hasCurrent = Boolean(currentHtml.trim() || currentCss.trim());

  const contextBlock = contextKeys.length
    ? [
        "",
        "SELECTED_CONTEXT (prefer these building blocks/presets when relevant):",
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
          return `- ${name}${mime}: ${toAbsoluteUrl(req, m.url)}`.trim();
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

  const buildSystem = [
    "You generate HTML + CSS for a *custom code block* inside a funnel page.",
    "If the request is ambiguous or missing key details, ask ONE concise follow-up question instead of guessing.",
    "Return ONLY code fences, no explanation.",
    "Output options (choose ONE):",
    "A) HTML/CSS (default):",
    "- A single ```html fenced block containing an HTML fragment (no <html>, no <head>).",
    "- Optionally a ```css fenced block for styles used by that fragment.",
    "OR",
    "C) Clarifying question:",
    "- A single ```json fenced block: { \"question\": \"...\" }",
    "B) Funnel blocks (when the request is better represented as built-in blocks like chatbot, images, or videos):",
    "- A single ```json fenced block with shape: { actions: [...] }",
    "- Action types:",
    "  - { type: 'insertAfter', block: { type, props } }",
    "  - { type: 'insertPresetAfter', preset: 'hero'|'body'|'form'|'shop' }",
    "- Allowed block types for insertAfter: chatbot, image, video, heading, paragraph, button, spacer, formLink, formEmbed, calendarEmbed, salesCheckoutButton.",
    "- Do NOT include HTML/CSS fences when you return JSON actions.",
    "Constraints:",
    "- No external JS/CSS, no frameworks.",
    "- Prefer semantic HTML and classes; keep it minimal.",
    "- Make it safe to embed inside an existing page.",
    "- If a baseline shell concept or section plan is provided, treat that as the starting architecture for the first pass instead of inventing a new shell.",
    "- Do NOT treat this fragment like a full page. Avoid html/body styles, viewport-height wrappers, or fixed-position layout shells unless the user explicitly asks for them.",
    "- Keep the fragment responsive inside its parent container. Avoid hardcoded phone-width wrappers or device mockups.",
    "- Do NOT output placeholder URLs (e.g. 'your_calendar_embed_link_here'). If you don't have a real URL, ask a question or return JSON actions.",
    "- Do NOT link to /portal/* routes. Those do not exist on hosted funnels.",
    "- Links should be relative and keep the user on the hosted funnel site.",
    "Integration:",
    `- This page is hosted at: ${hostedBasePath}/f/${page.funnel.slug}`,
    `- Hosted forms are at: ${hostedBasePath}/forms/{formSlug}`,
    "- For booking/scheduling: prefer returning a calendarEmbed block rather than hardcoding a booking URL.",
    "- If the user asks for a shop/store/product list, prefer insertPresetAfter with preset='shop'.",
    "- If STRIPE_PRODUCTS are provided, assume Stripe is connected and avoid asking 'what do you sell?'.",
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Available calendars (id: title [enabled]):",
    ...calendars.map((c) => `- ${c.id}: ${c.title} [${c.enabled ? "enabled" : "disabled"}]`),
    hasCurrent
      ? "Editing mode: you will receive CURRENT_HTML and CURRENT_CSS. Apply the user's instruction as a minimal change and return the full updated fragment + CSS."
      : "Generation mode: create a new fragment + CSS from the user's instruction.",
  ].join("\n");

  const analysisSystem = [
    "You are an intent + asset selector for a funnel builder custom code assistant.",
    "Return ONLY a single ```json fenced block, no other text.",
    "Your job: decide whether to return structured funnel block actions or request an HTML/CSS build.",
    "Output schema:",
    "{",
    "  output: 'actions' | 'html' | 'question',",
    "  summary?: 'One short sentence describing what the successful result should change',",
    "  diagnosis?: {",
    "    problemType?: 'placement'|'layout'|'hierarchy'|'flatness'|'tone'|'feedback'|'cta'|'proof'|'readability'|'other',",
    "    affectedRegion?: string,",
    "    offendingElement?: string,",
    "    collisionTarget?: string,",
    "    intendedOutcome?: string,",
    "    safePlacement?: string,",
    "    missingQualities?: string[],",
    "    coexistenceRisks?: string[]",
    "  },",
    "  actions?: [",
    "    { type: 'insertAfter', block: { type, props } },",
    "    { type: 'insertPresetAfter', preset: 'hero'|'body'|'form'|'shop' }",
    "  ],",
    "  buildPrompt?: string,",
    "  question?: string",
    "}",
    "Rules:",
    "- Synthesize the strongest coherent baseline from BUSINESS_PROFILE, FUNNEL_BRIEF, INTENT_PROFILE, route cues, and the user's request before asking a question.",
    "- If user says 'embed my calendar' or anything about booking/scheduling, prefer output='actions' with a calendarEmbed block.",
    "- If user says 'embed my form' or anything about forms, prefer output='actions' with a formEmbed (or formLink if they want a link).",
    "- If user asks for a chatbot/chat widget, prefer output='actions' with a chatbot block.",
    "- If user asks for a VSL, explainer video, hero video, or video section and a real video asset is available, prefer output='actions' with a video block.",
    "- If user asks for a shop/store/product list, prefer output='actions' with an insertPresetAfter preset='shop'.",
    "- If user mentions cart/checkout/add-to-cart/Stripe, prefer output='actions' with preset='shop' (do NOT generate a fake shop in HTML).",
    "- For calendarEmbed, props must include { calendar: { pick: 'default'|'byId'|'byTitle', value? }, height?, style? }.",
    "- For formEmbed/formLink, props must include { form: { pick: 'default'|'bySlug'|'byName', value? }, ... }.",
    "- Use pick='default' for 'my calendar'/'my form' when no specific name/slug is provided.",
    "- For other block types, follow the normal props shapes.",
    "- IMPORTANT: If CURRENT_HTML or CURRENT_CSS are present and the user is asking for styling, contrast, readability, spacing, color, or layout fixes on the existing block, return output='html'. Do not redirect that into block actions and do not ask what type of block to use.",
    "- If output='html' and CURRENT_HTML or CURRENT_CSS are present, include diagnosis. Describe the scene problem before describing the fix.",
    "- Diagnosis should explain what region is affected, what element is causing the issue, what it is colliding with or failing to express, and where the safe placement or stronger composition should be.",
    "- Treat overlap, flatness, weak hierarchy, weak CTA staging, weak proof staging, and missing interaction feedback as scene problems, not isolated styling words.",
    "- If a baseline shell concept is provided and there is no CURRENT_HTML, assume the shell is already conceptually approved and choose assets or blocks that fit that shell.",
    "- If output='html', set buildPrompt to a concise instruction for the HTML/CSS generator.",
    "- If key info is missing, output='question' and ask ONE question only when the ambiguity would materially change the shell, CTA path, or required platform asset.",
    "- IMPORTANT: If STRIPE_PRODUCTS are present, do NOT ask what they sell. At most ask which products to feature (if needed).",
    "- Recommendation-first behavior: make the strongest reasonable assumptions from the available context and give the user something intelligent to iterate on instead of waiting for exhaustive inputs.",
    "Context:",
    `- Funnel page host path: ${hostedBasePath}/f/${page.funnel.slug}`,
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Available calendars (id: title [enabled]):",
    ...calendars.map((c) => `- ${c.id}: ${c.title} [${c.enabled ? "enabled" : "disabled"}]`),
  ].join("\n");

  const baseUser = [
    businessContext ? businessContext : "",
    buildFunnelBriefPromptBlock(funnelBrief),
    buildFunnelPageIntentPromptBlock(intentProfile, routeLabel),
    shellFrameBlock,
    archetypeContextBlock,
    visualWhyBlock,
    exhibitArchetypeBlock,
    stripeProductsBlock,
    `Funnel: ${page.funnel.name} (slug: ${page.funnel.slug})`,
    `Page: ${page.title} (slug: ${page.slug})`,
    "",
    contextBlock,
    contextMediaBlock,
    currentFragmentSceneSnapshot,
    hasCurrent
      ? [
          "CURRENT_HTML:",
          "```html",
          clampText(currentHtml, 20000),
          "```",
          "",
          "CURRENT_CSS:",
          "```css",
          clampText(currentCss, 20000),
          "```",
          "",
        ].join("\n")
      : "",
    "DIRECTION_RULE:",
    "Follow the strategic build brief below and do not mirror the user's wording back verbatim.",
    "",
    "STRATEGIC_BUILD_BRIEF:",
    strategicPrompt,
  ]
    .filter(Boolean)
    .join("\n");

  const prefersInPlaceHtml = hasCurrent && promptPrefersInPlaceHtmlEdit(prompt);

  // Step 1: analyze intent and select assets.
  let analysisRaw = "";
  try {
    analysisRaw = await generateText({ system: analysisSystem, user: baseUser, history: chatHistory });
  } catch {
    analysisRaw = "";
  }

  const analysisJsonFence = extractFence(analysisRaw, "json");
  const analysisParsed = analysisJsonFence.trim()
    ? aiAnalysisPayloadSchema.safeParse((() => {
        try {
          return JSON.parse(analysisJsonFence) as unknown;
        } catch {
          return null;
        }
      })())
    : { success: false as const };

  if (!prefersInPlaceHtml && analysisParsed.success && analysisParsed.data.output === "question") {
    const q = (analysisParsed.data.question || "").trim();
    if (q) {
      return NextResponse.json({ ok: true, question: q.slice(0, 800), summary: q.slice(0, 180) });
    }
  }

  if (!prefersInPlaceHtml && analysisParsed.success && analysisParsed.data.output === "actions" && analysisParsed.data.actions?.length) {
    // Resolve asset picks into concrete props.
    const resolvedActions = analysisParsed.data.actions
      .map((a) => {
        if (a.type === "insertPresetAfter") return a;
        const block = a.block as any;
        if (block.type === "formLink" || block.type === "formEmbed") {
          const formSlug = resolveFormSlug(block.props.form, forms);
          const nextProps = { ...block.props };
          delete (nextProps as any).form;
          (nextProps as any).formSlug = formSlug;
          return { type: "insertAfter" as const, block: { type: block.type, props: nextProps } };
        }
        if (block.type === "calendarEmbed") {
          const calendarId = resolveCalendarId(block.props.calendar, calendars);
          const nextProps = { ...block.props };
          delete (nextProps as any).calendar;
          (nextProps as any).calendarId = calendarId;
          return { type: "insertAfter" as const, block: { type: block.type, props: nextProps } };
        }
        return a as any;
      })
      .filter(Boolean);

    const validated = aiActionsPayloadSchema.safeParse({ actions: resolvedActions });
    if (validated.success) {
      const summary = pickMeaningfulAnalysisSummary(analysisParsed.data.summary || "") || buildActionsResultSummary(validated.data.actions);
      return NextResponse.json({ ok: true, actions: validated.data.actions, summary, assistantText: summary });
    }
  }

  // Step 2: build HTML/CSS (fallback to the original prompt if analysis is missing).
  const buildPrompt =
    !prefersInPlaceHtml && analysisParsed.success && analysisParsed.data.output === "html" && analysisParsed.data.buildPrompt
      ? analysisParsed.data.buildPrompt
      : strategicPrompt;
  const diagnosisBlock = analysisParsed.success ? buildAnalysisDiagnosisBlock(analysisParsed.data.diagnosis) : "";

  const buildUser = [
    baseUser,
    "",
    diagnosisBlock,
    diagnosisBlock ? "" : null,
    structuralGuidanceBlock,
    toneGuidanceBlock,
    "",
    "BUILD_INSTRUCTION:",
    buildPrompt,
  ]
    .filter(Boolean)
    .join("\n");

  const imageUrls = Array.from(
    new Set(
      contextMedia
        .map((m) => toAbsoluteUrl(req, String(m?.url || "").trim()))
        .filter(Boolean)
        .slice(0, 8),
    ),
  ).slice(0, 6);

  let buildRaw = "";
  try {
    buildRaw = imageUrls.length
      ? await generateTextWithImages({ system: buildSystem, user: buildUser, imageUrls, history: chatHistory })
      : await generateText({ system: buildSystem, user: buildUser, history: chatHistory });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as any)?.message ? String((e as any).message) : "AI generation failed" },
      { status: 500 },
    );
  }

  const buildQuestion = (() => {
    const qFence = extractFence(buildRaw, "json");
    if (!qFence.trim()) return "";
    try {
      const parsed = JSON.parse(qFence) as any;
      return typeof parsed?.question === "string" ? String(parsed.question).trim().slice(0, 800) : "";
    } catch {
      return "";
    }
  })();

  if (buildQuestion) {
    return NextResponse.json({ ok: true, question: buildQuestion, summary: buildQuestion.slice(0, 180) });
  }

  const buildJsonFence = extractFence(buildRaw, "json");
  if (buildJsonFence.trim()) {
    try {
      const payload = JSON.parse(buildJsonFence) as unknown;
      const parsedActions = aiActionsPayloadSchema.safeParse(payload);
      if (parsedActions.success) {
        const summary = buildActionsResultSummary(parsedActions.data.actions);
        return NextResponse.json({ ok: true, actions: parsedActions.data.actions, summary, assistantText: summary });
      }
    } catch {
      // ignore: fall back to html/css
    }
  }

  const rawHtmlFence = extractFence(buildRaw, "html");
  const rawCssFence = extractFence(buildRaw, "css");
  const coerced = coerceHtmlFragment(rawHtmlFence);
  const html = coerced.html;
  const css = [rawCssFence, coerced.cssFromHtml].filter(Boolean).join("\n\n").trim();

  if (!html.trim()) {
    return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });
  }

  // Final guardrail: if the model emitted placeholders or portal-only URLs, or if intent is clearly
  // better represented as blocks, force actions instead of returning broken HTML.
  const shouldForceActions =
    hasPlaceholderOrPortalLinks(html, css) ||
    (!prefersInPlaceHtml && promptRequestsFunctionalEmbed(prompt));

  if (shouldForceActions) {
    const forced = inferForcedActionsFromIntent({
      prompt,
      html,
      forms,
      calendars,
      hasStripeProducts: Boolean(stripeProducts.ok && stripeProducts.products.length),
    });

    if (forced?.length) {
      const validated = aiActionsPayloadSchema.safeParse({ actions: forced });
      if (validated.success) {
        const summary = buildActionsResultSummary(validated.data.actions);
        return NextResponse.json({ ok: true, actions: validated.data.actions, summary, assistantText: summary });
      }
    }

    try {
      const question = String(
        await generateText({
          system:
            "You are an assistant in a funnel builder. The user asked for custom HTML/CSS, but the best path is to insert a proper Funnel Builder block instead. Ask one concise question to choose the block type. Offer these options: Form, Calendar, Chatbot, Shop. Keep it to 1-2 sentences.",
          user: `Context (JSON):\n${JSON.stringify({ prompt }, null, 2)}`,
        }),
      ).trim();
      return NextResponse.json({ ok: true, question: question.slice(0, 800), summary: question.slice(0, 180) });
    } catch {
      return NextResponse.json({ ok: false, error: "AI provider not configured" }, { status: 502 });
    }
  }

  const summary = buildCustomCodeResultSummary({
    prompt,
    previousHtml: currentHtml,
    nextHtml: html,
    previousCss: currentCss,
    nextCss: css,
    analysisSummary: analysisParsed.success ? analysisParsed.data.summary : "",
  });
  const warnings = buildGeneratedFragmentWarnings(html, css, shellFrame, relevantArchetypes, prompt);
  const assistantText = summary;

  return NextResponse.json({ ok: true, html, css, summary, assistantText, warnings });
}
