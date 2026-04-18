import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { persistPortalAiChatRun, type PortalAiChatRunStatus, type PortalAiChatRunTraceInput } from "@/lib/portalAiChatRunLedger";
import { ensurePortalAiChatRunAiSummary } from "@/lib/portalAiChatRunSummary";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";
import { generatePuraText as generateText, isPuraAiConfigured, runWithPuraAiProfile } from "@/lib/puraAi";
import { PURA_AI_PROFILE_VALUES, normalizePuraAiProfile } from "@/lib/puraAiProfile";
import {
  PortalAgentActionKeySchema,
  extractJsonObject,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import {
  classifyPortalAgentFailure,
  deriveThreadContextPatchFromAction,
  executePortalAgentAction,
  executePortalAgentActionForThread,
  type PortalAgentFailureMeta,
} from "@/lib/portalAgentActionExecutor";
import { getConfirmSpecForPortalAgentAction, isReadOnlyPortalAgentAction, portalCanvasUrlForAction, portalContactUiUrl } from "@/lib/portalAgentActionMeta";
import { encodeScheduledActionEnvelope } from "@/lib/portalAiChatScheduledActionEnvelope";
import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";
import { previewResultForPlanner, summarizeIdsFromArgs } from "@/lib/portalAgentPlannerContextPreview";
import { resolvePlanArgs } from "@/lib/puraResolver";
import { detectPuraDirectIntentSignals } from "@/lib/puraDirectIntentSignals";
import { getPuraDirectActionPlan, getPuraDirectPrerequisiteMessage } from "@/lib/puraDirectIntentPlans";
import { absolutizeAssistantTextLinks, formatAssistantMarkdownLink } from "@/lib/portalAssistantLinks";
import { generateClientBlogDraft } from "@/lib/clientBlogAutomation";
import { generateClientNewsletterDraft } from "@/lib/clientNewsletterAutomation";
import { slugify } from "@/lib/slugify";

import {
  buildKnownPortalIdsSystemNote,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  getInteractiveConfirmSpecForPortalAgentAction,
  isImperativeRequest,
  looksLikeNonActionDeflection,
  looksLikePortalHowToInstructions,
  looksLikeProceedLoopMessage,
  parseChatWrapperDecision,
  stripEmptyAssistantBullets,
  toolCheatSheetForPrompt,
} from "@/lib/portalAiChatPlannerShared";

import {
  addContactTagAssignment,
  createOwnerContactTag,
  removeContactTagAssignment,
} from "@/lib/portalContactTags";
import { normalizeEmailKey, normalizeNameKey, normalizePhoneKey } from "@/lib/portalContacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AttachmentSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  url: z.string().trim().min(1).max(500),
});

const ChoiceSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("booking_calendar"),
        calendarId: z.string().trim().min(1).max(80),
        label: z.string().trim().min(1).max(160).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("entity"),
        kind: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(200),
        label: z.string().trim().min(1).max(160).optional(),
        description: z.string().trim().min(1).max(240).optional(),
      })
      .strict(),
  ])
  .optional();

const WidgetSuggestionSchema = z
  .object({
    key: z.string().trim().min(1).max(500),
    serviceSlug: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    actionIds: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
    detailLines: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  })
  .strict()
  .optional();

const SendMessageSchema = z
  .object({
    text: z.string().trim().max(4000).optional(),
    url: z.string().trim().optional(),
    canvasUrl: z.string().trim().max(1200).optional(),
    chatMode: z.enum(["plan", "work"]).optional(),
    responseProfile: z.enum(PURA_AI_PROFILE_VALUES).optional(),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    contextKeys: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    clientTimeZone: z.string().trim().max(80).optional(),
    confirmToken: z.string().trim().min(1).max(200).optional(),
    choice: ChoiceSchema,
    widgetSuggestion: WidgetSuggestionSchema,
    redoLastAssistant: z.boolean().optional(),
    redoMessageId: z.string().trim().min(1).max(200).optional(),
    editMessageId: z.string().trim().min(1).max(200).optional(),
  })
  .refine(
    (d) =>
      Boolean((d as any).redoLastAssistant) ||
      Boolean(String((d as any).redoMessageId || "").trim()) ||
      Boolean(String((d as any).confirmToken || "").trim()) ||
      Boolean((d.text || "").trim()) ||
      Boolean((d as any).choice) ||
      Boolean((d as any).widgetSuggestion) ||
      (Array.isArray(d.attachments) && d.attachments.length > 0),
    { message: "Text or attachments required" },
  );

function buildWidgetSuggestionAssistantContext(widgetSuggestion: NonNullable<z.infer<typeof WidgetSuggestionSchema>>) {
  const serviceLabel = String(widgetSuggestion.serviceSlug || "")
    .trim()
    .split("-")
    .filter(Boolean)
    .slice(0, 12)
    .map((part) => (/^(ai|crm|sms)$/i.test(part) ? part.toUpperCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`))
    .join(" ");
  const detailLines = Array.isArray(widgetSuggestion.detailLines)
    ? widgetSuggestion.detailLines
        .map((line) => String(line || "").trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];
  return { serviceLabel, detailLines };
}

function normalizeThreadChatMode(raw: unknown): "plan" | "work" {
  return raw === "work" ? "work" : "plan";
}

async function generateWidgetSuggestionAssistantText(widgetSuggestion: NonNullable<z.infer<typeof WidgetSuggestionSchema>>): Promise<string> {
  const { serviceLabel, detailLines } = buildWidgetSuggestionAssistantContext(widgetSuggestion);
  const suggestionSummary = {
    title: String(widgetSuggestion.title || "").trim().slice(0, 240),
    serviceLabel: serviceLabel || null,
    detailLines,
    actionIds: widgetSuggestion.actionIds.slice(0, 50),
  };

  const text = await generateText({
    system:
      "You are a helpful assistant inside a SaaS portal. Write a brief, friendly message explaining that you found a suggested setup for the current page and that the user can apply it. Mention the suggestion title. If there are detail lines, render them as a short bullet list. End with a question asking whether to apply it now. Do not claim you already applied changes.",
    user: `Widget suggestion (JSON):\n${JSON.stringify(suggestionSummary, null, 2)}`,
  });
  return String(text || "").trim();
}

function looksLikeImageAttachment(a: any): boolean {
  const mime = typeof a?.mimeType === "string" ? a.mimeType.trim().toLowerCase() : "";
  if (mime.startsWith("image/")) return true;
  const name = typeof a?.fileName === "string" ? a.fileName.trim().toLowerCase() : "";
  const url = typeof a?.url === "string" ? a.url.trim().toLowerCase() : "";
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(`${name} ${url}`);
}

type AttachmentTextKind = "utf8" | "pdf" | "docx";

function classifyTextAttachment(a: any): AttachmentTextKind | null {
  const mime = typeof a?.mimeType === "string" ? a.mimeType.trim().toLowerCase() : "";
  const name = typeof a?.fileName === "string" ? a.fileName.trim().toLowerCase() : "";

  if (mime === "application/pdf" || /\.(pdf)(\?|#|$)/i.test(name)) return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.(docx)(\?|#|$)/i.test(name)
  ) {
    return "docx";
  }

  if (mime.startsWith("text/")) return "utf8";
  if (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/x-yaml" ||
    mime === "application/yaml" ||
    mime === "application/javascript" ||
    mime === "application/x-javascript"
  ) {
    return "utf8";
  }

  if (/\.(txt|md|markdown|csv|tsv|json|yaml|yml|xml|html?|js|ts|tsx|jsx)(\?|#|$)/i.test(name)) return "utf8";

  return null;
}

function looksLikeTextAttachment(a: any): boolean {
  return classifyTextAttachment(a) !== null;
}

function looksLikeMostlyTextUtf8(buf: Buffer): boolean {
  if (!buf.length) return false;
  const max = Math.min(buf.length, 4096);
  let nul = 0;
  let control = 0;
  for (let i = 0; i < max; i++) {
    const b = buf[i]!;
    if (b === 0) nul += 1;
    // Count control chars excluding common whitespace.
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) control += 1;
  }
  if (nul / max > 0.01) return false;
  if (control / max > 0.2) return false;
  return true;
}

function cleanExtractedText(raw: string, maxChars: number): string {
  const s = String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  return s.trim().slice(0, maxChars);
}

function stripAssistantVisibleAccountingFields(value: unknown): unknown {
  const OMIT_KEYS = new Set(["credits", "creditsRemaining", "creditsAdded", "estimatedCredits", "balance"]);

  const walk = (v: unknown, depth: number): unknown => {
    if (depth <= 0) return v;
    if (v == null) return v;
    if (Array.isArray(v)) return v.slice(0, 200).map((x) => walk(x, depth - 1));
    if (typeof v !== "object") return v;
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(obj)) {
      if (OMIT_KEYS.has(k)) continue;
      out[k] = walk(child, depth - 1);
    }
    return out;
  };

  return walk(value, 6);
}


async function extractPdfText(bytes: Buffer): Promise<string> {
  const mod: any = await import("pdf-parse");
  const pdfParse: any = mod?.default ?? mod;
  const res = await pdfParse(bytes);
  return typeof (res as any)?.text === "string" ? String((res as any).text) : "";
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const res = await (mammoth as any).extractRawText({ buffer: bytes });
  return typeof res?.value === "string" ? String(res.value) : "";
}

async function extractTextContextFromAttachments(opts: {
  ownerId: string;
  attachments: any[];
  maxTotalChars?: number;
}): Promise<string> {
  const ownerId = String(opts.ownerId || "").trim();
  const attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
  const maxTotalChars = typeof opts.maxTotalChars === "number" && Number.isFinite(opts.maxTotalChars)
    ? Math.max(1000, Math.min(20_000, Math.floor(opts.maxTotalChars)))
    : 8000;
  if (!ownerId || !attachments.length) return "";

  const ids = Array.from(
    new Set(
      attachments
        .filter((a) => a && typeof a === "object" && looksLikeTextAttachment(a) && !looksLikeImageAttachment(a))
        .map((a) => String((a as any).id || "").trim())
        .filter(Boolean)
        .slice(0, 10),
    ),
  );
  if (!ids.length) return "";

  const rows = await (prisma as any).portalMediaItem.findMany({
    where: { ownerId, id: { in: ids } },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, bytes: true },
  });

  const byId = new Map<string, any>();
  for (const r of rows || []) byId.set(String(r.id), r);

  const MAX_BYTES_PER_FILE = 220_000;
  const MAX_BYTES_PDF = 4_000_000;
  const MAX_BYTES_DOCX = 4_000_000;
  const MAX_CHARS_PER_FILE = 4000;

  let budget = maxTotalChars;
  const parts: string[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;

    const fileSize = typeof r.fileSize === "number" && Number.isFinite(r.fileSize) ? r.fileSize : 0;
    if (fileSize > 2_000_000) continue; // don't try to ingest huge files

    const attachment = attachments.find((a) => String((a as any)?.id || "").trim() === String(id));
    const kind = classifyTextAttachment(attachment);
    if (!kind) continue;

    const bytes = Buffer.isBuffer(r.bytes) ? r.bytes : Buffer.from(r.bytes || "");
    let rawText = "";

    if (kind === "utf8") {
      const slice = bytes.subarray(0, Math.min(bytes.length, MAX_BYTES_PER_FILE));
      if (!looksLikeMostlyTextUtf8(slice)) continue;
      rawText = slice.toString("utf8");
    } else if (kind === "pdf") {
      if (bytes.length > MAX_BYTES_PDF) continue;
      try {
        rawText = await extractPdfText(bytes);
      } catch {
        rawText = "";
      }
    } else if (kind === "docx") {
      if (bytes.length > MAX_BYTES_DOCX) continue;
      try {
        rawText = await extractDocxText(bytes);
      } catch {
        rawText = "";
      }
    }

    const text = cleanExtractedText(rawText, Math.min(MAX_CHARS_PER_FILE, budget));
    if (!text) continue;

    const fileName = typeof r.fileName === "string" ? String(r.fileName).trim().slice(0, 160) : "attachment";
    const mimeType = typeof r.mimeType === "string" ? String(r.mimeType).trim().slice(0, 120) : "";

    parts.push([`[Attachment: ${fileName}${mimeType ? ` (${mimeType})` : ""}]`, text].join("\n"));
    budget -= text.length;
    if (budget <= 0) break;
  }

  if (!parts.length) return "";
  return ["\n\nAttachment text (for context):", parts.join("\n\n---\n\n")].join("\n");
}

function cleanSuggestedTitle(raw: string): string {
  const s = String(raw || "").trim().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  // Keep it short and UI-friendly.
  return s.replace(/^"|"$/g, "").replace(/^'|'$/g, "").slice(0, 60).trim();
}

type UnresolvedRunStatus = "needs_input" | "failed" | "interrupted" | "partial";

type UnresolvedRunShape = {
  status: UnresolvedRunStatus;
  runId?: string | null;
  updatedAt?: string | null;
  workTitle?: string | null;
  summaryText?: string | null;
  userRequest?: string | null;
  lastCompletedTitle?: string | null;
  canvasUrl?: string | null;
};

function normalizeUnresolvedRun(raw: unknown): UnresolvedRunShape | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const statusRaw = typeof (raw as any).status === "string" ? String((raw as any).status).trim().toLowerCase() : "";
  const status =
    statusRaw === "needs_input" || statusRaw === "failed" || statusRaw === "interrupted" || statusRaw === "partial"
      ? (statusRaw as UnresolvedRunStatus)
      : null;
  if (!status) return null;

  return {
    status,
    runId: typeof (raw as any).runId === "string" && (raw as any).runId.trim() ? String((raw as any).runId).trim().slice(0, 120) : null,
    updatedAt: typeof (raw as any).updatedAt === "string" && (raw as any).updatedAt.trim() ? String((raw as any).updatedAt).trim().slice(0, 80) : null,
    workTitle: typeof (raw as any).workTitle === "string" && (raw as any).workTitle.trim() ? String((raw as any).workTitle).trim().slice(0, 200) : null,
    summaryText: typeof (raw as any).summaryText === "string" && (raw as any).summaryText.trim() ? String((raw as any).summaryText).trim().slice(0, 1200) : null,
    userRequest: typeof (raw as any).userRequest === "string" && (raw as any).userRequest.trim() ? String((raw as any).userRequest).trim().slice(0, 2000) : null,
    lastCompletedTitle:
      typeof (raw as any).lastCompletedTitle === "string" && (raw as any).lastCompletedTitle.trim()
        ? String((raw as any).lastCompletedTitle).trim().slice(0, 200)
        : null,
    canvasUrl: typeof (raw as any).canvasUrl === "string" && (raw as any).canvasUrl.trim() ? String((raw as any).canvasUrl).trim().slice(0, 1200) : null,
  };
}

function withUnresolvedRun(threadContextValue: unknown, unresolvedRun: UnresolvedRunShape | null) {
  const prevCtx = threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue) ? (threadContextValue as any) : {};
  return {
    ...prevCtx,
    unresolvedRun: normalizeUnresolvedRun(unresolvedRun),
  };
}

function clearUnresolvedRun(threadContextValue: unknown) {
  return withUnresolvedRun(threadContextValue, null);
}

function clearPendingScheduleResume(threadContextValue: unknown) {
  const prev = threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue)
    ? (threadContextValue as Record<string, unknown>)
    : {};
  return { ...prev, pendingScheduleResume: null };
}

type NextStepContextShape = {
  updatedAt?: string | null;
  objective?: string | null;
  workTitle?: string | null;
  summaryText?: string | null;
  suggestedPrompt?: string | null;
  suggestions?: string[];
  canvasUrl?: string | null;
};

function normalizeNextStepSuggestions(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw
        .map((value) => (typeof value === "string" ? String(value).trim().slice(0, 180) : ""))
        .filter(Boolean)
        .slice(0, 3)
    : [];
}

function normalizeNextStepContext(raw: unknown): NextStepContextShape | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const suggestions = normalizeNextStepSuggestions((raw as any).suggestions);
  const suggestedPrompt =
    typeof (raw as any).suggestedPrompt === "string" && (raw as any).suggestedPrompt.trim()
      ? String((raw as any).suggestedPrompt).trim().slice(0, 180)
      : suggestions[0] || null;
  const objective = typeof (raw as any).objective === "string" && (raw as any).objective.trim() ? String((raw as any).objective).trim().slice(0, 2000) : null;
  const workTitle = typeof (raw as any).workTitle === "string" && (raw as any).workTitle.trim() ? String((raw as any).workTitle).trim().slice(0, 200) : null;
  const summaryText = typeof (raw as any).summaryText === "string" && (raw as any).summaryText.trim() ? String((raw as any).summaryText).trim().slice(0, 1200) : null;
  const updatedAt = typeof (raw as any).updatedAt === "string" && (raw as any).updatedAt.trim() ? String((raw as any).updatedAt).trim().slice(0, 80) : null;
  const canvasUrl = typeof (raw as any).canvasUrl === "string" && (raw as any).canvasUrl.trim() ? String((raw as any).canvasUrl).trim().slice(0, 1200) : null;
  if (!suggestedPrompt && !objective && !workTitle && !summaryText) return null;

  return {
    updatedAt,
    objective,
    workTitle,
    summaryText,
    suggestedPrompt,
    suggestions,
    canvasUrl,
  };
}

function withNextStepContext(threadContextValue: unknown, nextStepContext: NextStepContextShape | null) {
  const prevCtx = threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue) ? (threadContextValue as any) : {};
  return {
    ...prevCtx,
    nextStepContext: normalizeNextStepContext(nextStepContext),
  };
}

function clearNextStepContext(threadContextValue: unknown) {
  return withNextStepContext(threadContextValue, null);
}

function parseRelativePortalUrl(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    return new URL(value, "http://portal.local");
  } catch {
    return null;
  }
}

function describeDirectIntentSurface(opts: {
  url?: string | null;
  canvasUrl?: string | null;
  contextKeys?: string[];
}) {
  const candidates = [opts.canvasUrl, opts.url];
  for (const raw of candidates) {
    const url = parseRelativePortalUrl(raw);
    if (!url) continue;
    const pageEditorMatch = /^\/portal\/app\/services\/(booking|newsletter|reviews|blogs)\/page-editor(?:\/|$)/i.exec(url.pathname || "");
    if (pageEditorMatch?.[1]) {
      const service = String(pageEditorMatch[1]).toLowerCase();
      return `Current surface: ${service} hosted page editor. Treat vague design, rewrite, polish, clean-up, and premium-style requests as hosted page work for this service.`;
    }
  }

  const normalizedContextKeys = Array.isArray(opts.contextKeys)
    ? Array.from(new Set(opts.contextKeys.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))).slice(0, 4)
    : [];
  const hostedContextService = normalizedContextKeys.find((value) => ["booking", "newsletter", "reviews", "blogs"].includes(value));
  if (hostedContextService) {
    return `Current selected portal context: ${hostedContextService}. Treat vague design, rewrite, polish, clean-up, and premium-style requests as hosted page work for this service.`;
  }
  if (normalizedContextKeys.length) {
    return `Current selected portal context: ${normalizedContextKeys.join(", ")}. Prefer work in these areas when the request is vague.`;
  }

  return "";
}

function hasActivePortalWorkSurface(raw: string | null | undefined) {
  const url = parseRelativePortalUrl(raw);
  if (!url) return false;
  const path = String(url.pathname || "").trim().toLowerCase();
  if (!path) return false;
  if (path === "/portal/app/ai-chat" || path === "/portal/app/ai-chat/") return false;
  return path.startsWith("/portal/app/") || path.startsWith("/pura-preview/");
}

function hasRecentResolvableWorkTarget(threadContextValue: unknown) {
  if (!threadContextValue || typeof threadContextValue !== "object" || Array.isArray(threadContextValue)) return false;
  const ctx = threadContextValue as Record<string, unknown>;
  if (hasActivePortalWorkSurface(typeof ctx.lastCanvasUrl === "string" ? ctx.lastCanvasUrl : null)) return true;
  if (typeof ctx.lastWorkTitle === "string" && String(ctx.lastWorkTitle).trim()) return true;

  const entityKeys = ["lastNewsletter", "lastBlogPost", "lastFunnel", "lastFunnelPage", "lastHostedPageDocument", "lastMediaFolder", "lastNurtureCampaign"];
  return entityKeys.some((key) => {
    const value = ctx[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const id = typeof (value as Record<string, unknown>).id === "string" ? String((value as Record<string, unknown>).id).trim() : "";
    const service = typeof (value as Record<string, unknown>).service === "string" ? String((value as Record<string, unknown>).service).trim() : "";
    const pageKey = typeof (value as Record<string, unknown>).pageKey === "string" ? String((value as Record<string, unknown>).pageKey).trim() : "";
    return Boolean(id || service || pageKey);
  });
}

function looksLikeContextlessPolishPrompt(promptRaw: string) {
  const prompt = String(promptRaw || "").trim().toLowerCase();
  if (!prompt) return false;
  if (prompt.length > 220) return false;

  const hasEditVerb = /\b(clean(?:\s+this\s+up|\s+it\s+up|\s+up)?|polish|tighten|improve|refine|refresh|rewrite|revise|fix|upgrade|update|redo|make)\b/.test(prompt);
  if (!hasEditVerb) return false;

  const hasDeicticTarget = /\b(this|that|it|current|same)\b/.test(prompt);
  if (!hasDeicticTarget) return false;

  const explicitCrossSurfaceIntent = /\b(inbox|thread|threads|conversation|conversations|contact|contacts|task|tasks|review reply|receptionist|lead scraping|lead scrape|lead run|booking slots|availability this week)\b/.test(prompt);
  if (explicitCrossSurfaceIntent) return false;

  return /\b(make\s+(?:this|that|it)|clean\s+(?:this|that|it)?\s*up|polish\s+(?:this|that|it)|tighten\s+(?:this|that|it)|improve\s+(?:this|that|it)|refine\s+(?:this|that|it)|refresh\s+(?:this|that|it)|rewrite\s+(?:this|that|it)|revise\s+(?:this|that|it)|fix\s+(?:this|that|it)|update\s+(?:this|that|it))\b/.test(prompt);
}

function looksLikeDiscussAdvisoryCopyPrompt(promptRaw: string) {
  const prompt = String(promptRaw || "").trim().toLowerCase();
  if (!prompt) return false;

  const asksForHelp = /\b(help me|can you help|brainstorm|suggest|give me|thoughts on|feedback on|ideas for)\b/.test(prompt);
  const copyTarget = /\b(headline|subheadline|copy|messaging|cta|call to action)\b/.test(prompt);
  const pageContext = /\b(funnel builder|landing page|sales page|page copy|hero section)\b/.test(prompt);
  const explicitBuildAction = /\b(create|build|make|publish|go live|generate html|ship)\b/.test(prompt);

  return asksForHelp && copyTarget && pageContext && !explicitBuildAction;
}

function buildDiscussAdvisoryCopyResponse(promptRaw: string) {
  const prompt = String(promptRaw || "").trim().toLowerCase();
  const wantsHeadline = /\bheadline|subheadline\b/.test(prompt);
  const wantsLandingCopy = /\blanding page|page copy|copy|messaging\b/.test(prompt);

  const lines = [
    "Absolutely — keeping this in discuss mode, here’s the copy direction without making any portal changes.",
  ];

  if (wantsHeadline) {
    lines.push(
      "",
      "Three headline directions:",
      "1. Turn More Visitors Into Booked Calls With a Funnel That Makes the Next Step Obvious",
      "2. A Clearer Funnel Builder Message That Helps Qualified Leads Say Yes Faster",
      "3. Stop Losing Warm Traffic With a Landing Page That Clarifies the Offer Immediately",
    );
  }

  if (wantsLandingCopy) {
    lines.push(
      "",
      "Landing-page copy structure:",
      "- Lead with the core outcome in one sentence, not the feature set.",
      "- Follow with 3 short benefit bullets that explain speed, clarity, and the next result the visitor gets.",
      "- Keep the CTA concrete and specific to the offer instead of generic language like ‘Learn more.’",
      "- Add a short objection-handling section under the CTA so the page answers hesitation before the user leaves.",
    );
  }

  lines.push(
    "",
    "If you want, I can next give you 3 tighter headline options, a subheadline, and a full hero section for this exact landing page.",
  );

  return lines.join("\n");
}

function extractFunnelBuilderEditorContextFromUrl(raw: string | null | undefined) {
  const url = parseRelativePortalUrl(raw);
  if (!url) return null;
  const match = /\/portal\/app\/services\/funnel-builder\/funnels\/([^/?#]+)\/edit(?:\/|$)/.exec(url.pathname || "");
  const funnelId = match?.[1] ? decodeURIComponent(String(match[1]).trim()).slice(0, 120) : "";
  const pageId = String(url.searchParams.get("pageId") || "").trim().slice(0, 120);
  if (!funnelId || !pageId) return null;
  return {
    funnelId,
    pageId,
    canvasUrl: `${url.pathname}${url.search}`.slice(0, 1200),
  };
}

function looksLikeFunnelBuilderContextAnchorPrompt(promptRaw: string) {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) return false;
  if (!/\bfunnel builder\b/i.test(prompt)) return false;
  if (!/(?:\bi am already on\b|\bwork on this exact page\b|\bexact funnel builder editor\b)/i.test(prompt)) return false;
  if (/\b(replace|update|change|rewrite|revise|add|embed|use\s+the\s+existing|create|generate|design|build|delete|publish|set)\b/i.test(prompt)) {
    return false;
  }
  return true;
}

function isBookingSettingsContextUrl(raw: string | null | undefined) {
  const url = parseRelativePortalUrl(raw);
  return Boolean(url?.pathname?.includes("/portal/app/services/booking/settings"));
}

function extractRequestedBookingDurationMinutes(promptRaw: string): number | null {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) return null;
  const digitsMatch = prompt.match(/\b(\d{2,3})\s*(?:min|mins|minutes)\b/i) || prompt.match(/\bduration\s+(?:is\s+|to\s+)?(\d{2,3})\b/i);
  const raw = digitsMatch?.[1] ? Number(digitsMatch[1]) : NaN;
  if (!Number.isFinite(raw)) return null;
  return Math.max(10, Math.min(180, Math.floor(raw)));
}

function looksLikeConditionalBookingDurationPrompt(promptRaw: string) {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) return false;
  if (!/\bduration\b/i.test(prompt)) return false;
  if (!/\b(keep everything else the same|change just the duration|if the duration is still not)\b/i.test(prompt)) return false;
  return /\b(update|change|set|keep)\b/i.test(prompt);
}

function extractBookingSettingsSurfaceUpdate(promptRaw: string): { title?: string; description?: string; durationMinutes?: number } | null {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) return null;
  const titleMatch = prompt.match(/\bupdate\s+the\s+booking\s+title\s+to\s+(.+?)(?:,\s*update\s+the\s+description\s+to|,\s*set\s+the\s+duration|\.\s|$)/i);
  const descriptionMatch = prompt.match(/\bupdate\s+the\s+description\s+to\s+(.+?)(?:,\s*set\s+the\s+duration|,\s*and\s+then\s+give\s+me|\.\s|$)/i);
  const durationMinutes = extractRequestedBookingDurationMinutes(prompt);
  const title = typeof titleMatch?.[1] === "string" ? String(titleMatch[1]).trim().replace(/[.]+$/g, "") : "";
  const description = typeof descriptionMatch?.[1] === "string" ? String(descriptionMatch[1]).trim().replace(/[.]+$/g, "") : "";
  if (!title && !description && !durationMinutes) return null;
  return {
    ...(title ? { title: title.slice(0, 80) } : {}),
    ...(description ? { description: description.slice(0, 400) } : {}),
    ...(durationMinutes ? { durationMinutes } : {}),
  };
}

type NewsletterDraftSurfaceRewriteRequest = {
  titleHint: string;
  excerpt: string;
  audienceHint: string | null;
  rewriteGoal: string | null;
};

function extractNewsletterDraftSurfaceRewrite(promptRaw: string): NewsletterDraftSurfaceRewriteRequest | null {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) return null;
  if (!/\bnewsletter\b/i.test(prompt)) return null;
  if (!/\bcurrent draft titled\b/i.test(prompt)) return null;
  if (!/\bkeep the existing title unchanged\b/i.test(prompt)) return null;
  if (!/\bkeep the newsletter in draft status\b/i.test(prompt)) return null;
  if (!/\bdo not create a new newsletter\b/i.test(prompt)) return null;

  const titleMatch = prompt.match(/\bcurrent draft titled\s+(.+?)(?:\.\s+Keep the existing title unchanged\b|$)/i);
  const excerptMatch = prompt.match(/\bMake the excerpt exactly these two sentences:\s*([\s\S]+?)\s+Rewrite only the opening section\b/i);
  const audienceMatch = prompt.match(/\bUpdate that same draft for\s+(.+?)(?:\.\s+Make the excerpt exactly|\.\s+Rewrite only|$)/i);
  const goalMatch = prompt.match(/\bRewrite only the opening section so it\s+(.+?)(?:,\s*keep the newsletter in draft status|\.\s+keep the newsletter in draft status|$)/i);

  const titleHint = typeof titleMatch?.[1] === "string" ? String(titleMatch[1]).trim().replace(/[.]+$/g, "") : "";
  const excerpt = typeof excerptMatch?.[1] === "string" ? String(excerptMatch[1]).trim().replace(/\s+/g, " ") : "";
  const audienceHint = typeof audienceMatch?.[1] === "string" ? String(audienceMatch[1]).trim().replace(/[.]+$/g, "") : "";
  const rewriteGoal = typeof goalMatch?.[1] === "string" ? String(goalMatch[1]).trim().replace(/[.]+$/g, "") : "";

  if (!titleHint || !excerpt) return null;
  return {
    titleHint: titleHint.slice(0, 180),
    excerpt: excerpt.slice(0, 600),
    audienceHint: audienceHint ? audienceHint.slice(0, 180) : null,
    rewriteGoal: rewriteGoal ? rewriteGoal.slice(0, 400) : null,
  };
}

function replaceNewsletterOpeningSection(contentRaw: string, newOpeningRaw: string) {
  const content = String(contentRaw || "").replace(/\r\n/g, "\n").trim();
  const newOpening = String(newOpeningRaw || "").replace(/\r\n/g, "\n").trim();
  if (!newOpening) return content;
  if (!content) return newOpening;

  const headingMatch = content.match(/^(#\s.+?\n+)([\s\S]*)$/);
  if (headingMatch) {
    const headingBlock = String(headingMatch[1] || "").trimEnd();
    const rest = String(headingMatch[2] || "").trimStart();
    const nextHeadingIndex = rest.search(/^#{2,6}\s/m);
    const tail = nextHeadingIndex >= 0 ? rest.slice(nextHeadingIndex).trimStart() : "";
    return tail ? `${headingBlock}\n\n${newOpening}\n\n${tail}`.trim() : `${headingBlock}\n\n${newOpening}`.trim();
  }

  const nextHeadingIndex = content.search(/^#{1,6}\s/m);
  if (nextHeadingIndex >= 0) {
    const tail = content.slice(nextHeadingIndex).trimStart();
    return `${newOpening}\n\n${tail}`.trim();
  }

  return newOpening;
}

function buildFallbackNewsletterOpening(opts: { audienceHint?: string | null; rewriteGoal?: string | null }) {
  const audience = String(opts.audienceHint || "business owners").trim() || "business owners";
  const goal = String(opts.rewriteGoal || "speaks directly to readers who want more revenue from existing demand").trim();
  return [
    `${audience} do not need more generic marketing ideas—they need a clearer way to turn the demand they already have into higher-value revenue opportunities. This newsletter opens with a direct promise about using educational follow-up to move existing interest toward stronger conversations and better outcomes.`,
    `The focus here is practical and revenue-minded: ${goal.charAt(0).toLowerCase()}${goal.slice(1)}. Instead of chasing only net-new demand, the message centers on helping owners get more value from the leads, tune-ups, and buying signals already in motion.`,
  ].join("\n\n");
}

async function rewriteNewsletterOpeningSection(opts: {
  title: string;
  currentExcerpt: string;
  currentContent: string;
  excerpt: string;
  audienceHint?: string | null;
  rewriteGoal?: string | null;
}) {
  const fallback = buildFallbackNewsletterOpening({ audienceHint: opts.audienceHint, rewriteGoal: opts.rewriteGoal });
  try {
    const generated = await generateText({
      system: [
        "You are rewriting only the opening section of an existing newsletter draft.",
        "Return only the replacement opening section in markdown body text.",
        "Do not return the title, headings, notes, bullets, or explanations.",
        "Write 2 short paragraphs max.",
        "Keep the tone practical, specific, and business-owner focused.",
        "Do not mention that this is a draft.",
      ].join("\n"),
      user: [
        `Newsletter title: ${opts.title}`,
        opts.audienceHint ? `Target audience: ${opts.audienceHint}` : null,
        opts.rewriteGoal ? `Rewrite goal: ${opts.rewriteGoal}` : null,
        `Exact excerpt to align with: ${opts.excerpt}`,
        `Current excerpt: ${opts.currentExcerpt || "(empty)"}`,
        `Current content excerpt:\n${String(opts.currentContent || "").slice(0, 6000) || "(empty)"}`,
      ].filter(Boolean).join("\n\n"),
    });
    const cleaned = String(generated || "").trim().replace(/\r\n/g, "\n");
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

function wantsBookingEditorAndLiveLink(promptRaw: string) {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) return false;
  return /\b(live booking link|booking settings editor view|editor view)\b/i.test(prompt);
}

function looksLikeContinuationRequest(textRaw: string): boolean {
  const text = String(textRaw || "").trim().toLowerCase();
  if (!text) return false;
  if (text.length <= 80 && /^(continue|keep going|go ahead|resume|retry|try again|finish it|finish that|do it|do that|keep working|pick up where you left off)[.!?\s]*$/.test(text)) {
    return true;
  }
  return /\b(continue|keep going|resume|pick up where you left off|finish the remaining work|retry the last|try again and keep going|keep working on this|what should pura do next|what next|next step)\b/.test(text);
}

function isSummaryLikeSuggestion(textRaw: string): boolean {
  const text = String(textRaw || "").trim().toLowerCase();
  if (!text) return false;
  return /^(summarize|summary|recap|explain|show me|tell me)/.test(text) || /\b(what changed|what still needs attention|action plan|summary)\b/.test(text);
}

function continuationRequestFlavor(textRaw: string): "summary" | "action" | "neutral" {
  const text = String(textRaw || "").trim().toLowerCase();
  if (!text) return "neutral";
  if (/\b(summarize|summary|recap|explain|what changed|review what changed|tell me what changed)\b/.test(text)) return "summary";
  if (looksLikeContinuationRequest(text) || /\b(what next|next step|do next|keep going|continue|resume|finish)\b/.test(text)) return "action";
  return "neutral";
}

function selectContinuationSuggestion(textRaw: string, nextStepContext: NextStepContextShape | null | undefined): string | null {
  const normalized = normalizeNextStepContext(nextStepContext);
  if (!normalized) return null;

  const candidates = [normalized.suggestedPrompt || null, ...normalizeNextStepSuggestions(normalized.suggestions)]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!candidates.length) return null;

  const flavor = continuationRequestFlavor(textRaw);
  const userWords = new Set(
    String(textRaw || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4 && !["keep", "going", "continue", "resume", "next", "step", "pura", "chat", "this", "that"].includes(part)),
  );

  let best: { value: string; score: number; index: number } | null = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const value = candidates[index]!;
    const lower = value.toLowerCase();
    let score = 0;

    if (index === 0) score += 3;
    if (flavor === "summary") score += isSummaryLikeSuggestion(value) ? 8 : 0;
    if (flavor === "action") score += isSummaryLikeSuggestion(value) ? 0 : 8;

    for (const word of userWords) {
      if (lower.includes(word)) score += 4;
    }

    if (!best || score > best.score || (score === best.score && index < best.index)) {
      best = { value, score, index };
    }
  }

  return best?.value || null;
}

function nextStepContextForContinuationPrompt(textRaw: string, nextStepContext: NextStepContextShape | null | undefined): NextStepContextShape | null {
  const normalized = normalizeNextStepContext(nextStepContext);
  if (!normalized) return null;
  const selected = selectContinuationSuggestion(textRaw, normalized);
  if (!selected) return normalized;
  const suggestions = [selected, ...normalizeNextStepSuggestions(normalized.suggestions).filter((value) => value !== selected)].slice(0, 3);
  return {
    ...normalized,
    suggestedPrompt: selected,
    suggestions,
  };
}

function heuristicThreadTitleFromUserText(textRaw: string): string {
  const t = String(textRaw || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ");
  if (!t) return "";

  const scheduleTitle = (() => {
    const tl = t.toLowerCase();
    const isWeekdays = /\b(monday\s+through\s+friday|mon\s*(?:-|\u2013|\u2014)\s*fri|weekdays)\b/i.test(tl);
    const isSms = /\b(text|sms)\b/i.test(tl);
    if (!isWeekdays || !isSms) return "";

    const contactMatch = /\b(contact|to)\s+(?:the\s+contact\s+)?([a-z][a-z0-9'._-]{1,40})\b/i.exec(t);
    const contact = contactMatch?.[2] ? String(contactMatch[2]).trim() : "";

    const timeMatch = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(t);
    const hour = timeMatch?.[1] ? Number(timeMatch[1]) : NaN;
    const minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0;
    const ampm = timeMatch?.[3] ? String(timeMatch[3]).toLowerCase() : "";
    const validTime = Number.isFinite(hour) && hour >= 1 && hour <= 12 && Number.isFinite(minute) && minute >= 0 && minute <= 59;
    const timeLabel = validTime ? `${hour}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${ampm.startsWith("p") && hour !== 12 ? "pm" : ampm.startsWith("a") && hour === 12 ? "am" : ampm.startsWith("p") ? "pm" : "am"}` : "9am";

    const who = contact ? `${contact.charAt(0).toUpperCase()}${contact.slice(1)}` : "";
    return cleanSuggestedTitle(`Mon-Fri ${timeLabel} SMS${who ? ` ${who}` : ""}`);
  })();
  if (scheduleTitle) return scheduleTitle;

  // Prefer the first sentence/clause.
  const first = t.split(/[.?!\n]/)[0] || t;
  const cleaned = first
    .trim()
    .replace(/^please\s+/i, "")
    .replace(/^can you\s+/i, "")
    .replace(/^could you\s+/i, "")
    .replace(/^help me\s+/i, "")
    .trim();

  if (!cleaned) return "";

  const words = cleaned.split(" ").filter(Boolean);
  const short = words.slice(0, 6).join(" ");
  const title = cleanSuggestedTitle(short || cleaned);
  if (title.length < 3) return "";
  if (title.toLowerCase() === "new chat") return "";
  return title;
}

function widgetSuggestionThreadTitle(widgetSuggestion: { title?: string | null; serviceSlug?: string | null }): string {
  const title = cleanSuggestedTitle(String(widgetSuggestion?.title || "").trim());
  if (title && title.toLowerCase() !== "new chat") return title;
  const serviceLabel = String(widgetSuggestion?.serviceSlug || "")
    .trim()
    .split("-")
    .filter(Boolean)
    .map((part) => (/^(ai|crm|sms)$/i.test(part) ? part.toUpperCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`))
    .join(" ");
  return cleanSuggestedTitle(serviceLabel ? `${serviceLabel} setup` : "Widget chat");
}

function stableJsonForRunFingerprint(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonForRunFingerprint(item)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonForRunFingerprint(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function extractRunErrorText(result: any): string {
  const nestedError =
    result?.result &&
    typeof result.result === "object" &&
    !Array.isArray(result.result) &&
    typeof result.result.error === "string"
      ? String(result.result.error)
      : "";
  const directError = typeof result?.error === "string" ? String(result.error) : "";
  return (nestedError || directError).trim().toLowerCase();
}

function collapseRedundantConflictSteps<
  TStep extends { key?: unknown; args?: unknown },
  TResult extends { action?: unknown; args?: unknown; status?: unknown; ok?: unknown; result?: unknown; error?: unknown },
>(steps: TStep[], results: TResult[]): { steps: TStep[]; results: TResult[] } {
  if (!Array.isArray(steps) || !Array.isArray(results) || !steps.length || !results.length) {
    return { steps, results };
  }

  const keepIndexes = new Set<number>();
  const successfulFingerprints = new Set<string>();

  for (let index = 0; index < Math.min(steps.length, results.length); index += 1) {
    const step = steps[index];
    const result = results[index];
    const action = String(result?.action || step?.key || "").trim();
    const args = result?.args ?? step?.args ?? null;
    const fingerprint = `${action}::${stableJsonForRunFingerprint(args)}`;
    const status = Number(result?.status) || 0;
    const ok = Boolean(result?.ok) && status >= 200 && status < 300;
    const errorText = extractRunErrorText(result);
    const isRedundantConflict = status === 409 && /already sent|already exists|already claimed/.test(errorText) && successfulFingerprints.has(fingerprint);

    if (!isRedundantConflict) {
      keepIndexes.add(index);
    }
    if (ok) {
      successfulFingerprints.add(fingerprint);
    }
  }

  const filteredSteps = steps.filter((_, index) => keepIndexes.has(index));
  const filteredResults = results.filter((_, index) => keepIndexes.has(index));
  return filteredSteps.length && filteredResults.length ? { steps: filteredSteps, results: filteredResults } : { steps, results };
}

// Legacy/experimental schema kept for future use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ActionProposalSchema = z
  .object({
    actions: z
      .array(
        z
          .object({
            key: PortalAgentActionKeySchema,
            title: z.string().trim().min(1).max(80),
            confirmLabel: z.string().trim().max(40).optional(),
            args: z.record(z.string(), z.unknown()).default({}),
          })
          .strict(),
      )
      .max(2)
      .default([]),
  })
  .strict();

// Legacy heuristic kept for possible future auto-exec gating.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldAutoExecuteFromUserText(text: string) {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  if (!t) return false;

  // Avoid auto-executing when the user is asking for an explanation/steps.
  // Note: many users phrase imperatives as questions ("can you send...").
  if (isHowToQuestionOnly(t)) return false;

  const verb = /\b(create|make|build|generate|run|start|trigger|send|text|sms|email|reply|respond|reset|optimize|add|remove|move|import|upload|activate|pause|enroll|apply|tag|untag|label|update|delete|publish|unpublish|connect|disconnect|enable|disable|set|change|schedule)\b/i.test(
    t,
  );
  if (!verb) return false;

  return /\b(task|funnel|newsletter|blog|automation|calendar|booking|appointment|contacts?|people|review|reviews|text|sms|email|message|media|media library|folder|dashboard|reporting|nurture|campaign|tag|tags|label|domain|custom domain|business profile|settings)\b/i.test(
    t,
  );
}

function isHowToQuestionOnly(textRaw: string): boolean {
  const t = String(textRaw || "").trim().toLowerCase();
  if (!t) return false;

  const startsAsQuestion =
    /^(how|why|what|when|where)\b/.test(t) ||
    /^(can|could|should|would|do|does|did)\s+(i|we|you)\b/.test(t) ||
    /^how\s+do\s+(i|we|you)\b/.test(t) ||
    /^how\s+can\s+(i|we|you)\b/.test(t);

  if (!startsAsQuestion && !t.includes("?")) return false;

  const explicitCommand =
    /\b(i need you to|please|go ahead and|send|text|sms|schedule|trigger|set up|do this)\b/.test(t) ||
    /\bfor\s+me\b/.test(t);

  return !explicitCommand;
}

function looksLikeWeekdaySmsSchedule(textRaw: string): boolean {
  const t = String(textRaw || "").toLowerCase();
  if (!t.trim()) return false;
  const isWeekdays =
    /\bweekdays\b/i.test(t) ||
    /\bm\s*(?:-|\u2013|\u2014)\s*f\b/i.test(t) ||
    /\bmonday\s+(?:to|thru|through)\s+friday\b/i.test(t) ||
    /\bmonday\s*(?:-|\u2013|\u2014)\s*friday\b/i.test(t) ||
    /\bmon(?:day)?\s+(?:to|thru|through)\s+fri(?:day)?\b/i.test(t) ||
    /\bmon\s*(?:-|\u2013|\u2014)\s*fri\b/i.test(t) ||
    /\bmon\s*(?:-|\u2013|\u2014)\s*friday\b/i.test(t);
  const isSms = /\b(text|sms)\b/i.test(t);
  const hasTime = /\b\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/i.test(t) || /\b\d{1,2}:\d{2}\b/.test(t);
  return Boolean(isWeekdays && isSms && hasTime);
}

function looksLikeScheduledTasksEditRequest(textRaw: string): boolean {
  const t = String(textRaw || "").trim().toLowerCase();
  if (!t) return false;

  const hasEditVerb = /\b(edit|update|change|move|shift|reschedule|adjust|modify)\b/i.test(t);
  const hasScheduleWords = /\b(schedule|scheduled|scheduling)\b/i.test(t) || /\b(scheduled\s+tasks?|scheduled\s+messages?)\b/i.test(t);

  // Typical edit phrasing includes a time change (often from X to Y).
  const timeRe = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b\d{1,2}:\d{2}\b/gi;
  const timeMatches = t.match(timeRe) || [];
  const hasAnyTime = timeMatches.length >= 1;
  const hasTwoTimes = timeMatches.length >= 2;

  const hasFromTo = /\bfrom\b[\s\S]{0,80}\bto\b/i.test(t);
  const hasInsteadOf = /\binstead\s+of\b/i.test(t);

  if (!hasEditVerb || !hasScheduleWords || !hasAnyTime) return false;
  return hasTwoTimes || hasFromTo || hasInsteadOf || /\bchange\b[\s\S]{0,40}\bto\b/i.test(t) || /\bset\b[\s\S]{0,40}\bto\b/i.test(t);
}

function userWantsTestSendNow(textRaw: string): boolean {
  const t = String(textRaw || "").toLowerCase();
  return /\b(trigger|send)\b[\s\S]{0,40}\b(now|immediately)\b/.test(t) || /\b(as a test|test message|test sms)\b/.test(t);
}

function extractQuotedMessage(textRaw: string): string {
  const t = String(textRaw || "");
  const m1 = /"([^"]{3,200})"/.exec(t);
  if (m1?.[1]) return String(m1[1]).trim();
  const m2 = /'([^']{3,200})'/.exec(t);
  if (m2?.[1]) return String(m2[1]).trim();
  return "";
}

function extractContactHint(textRaw: string): string {
  const t = String(textRaw || "");
  const stop = new Set([
    "send",
    "text",
    "sms",
    "email",
    "message",
    "call",
    "notify",
    "remind",
    "schedule",
    "trigger",
    "create",
    "make",
    "build",
    "set",
    "do",
  ]);

  const isBad = (raw: string) => {
    const s = String(raw || "").trim().toLowerCase();
    return !s || stop.has(s);
  };

  // Prefer explicit "contact <name>" mentions.
  let out = "";
  const re1 = /\bcontact\s+([a-z][a-z0-9'._-]{1,40})\b/gi;
  for (const m of t.matchAll(re1)) {
    const candidate = m?.[1] ? String(m[1]).trim() : "";
    if (candidate && !isBad(candidate)) out = candidate;
  }
  if (out) return out.slice(0, 60);

  // Next: "to (the contact) <name>" but avoid "to send" etc.
  const re2 = /\bto\s+(?:the\s+contact\s+)?([a-z][a-z0-9'._-]{1,40})\b/gi;
  for (const m of t.matchAll(re2)) {
    const candidate = m?.[1] ? String(m[1]).trim() : "";
    if (candidate && !isBad(candidate)) out = candidate;
  }
  return out ? out.slice(0, 60) : "";
}

function extractTimeLocalHHmm(textRaw: string): string {
  const t = String(textRaw || "");
  const m1 = /\b(\d{1,2}):(\d{2})\b/.exec(t);
  if (m1?.[1] && m1?.[2]) {
    const hh = Number(m1[1]);
    const mm = Number(m1[2]);
    if (Number.isFinite(hh) && Number.isFinite(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
  }

  const m2 = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(t);
  if (m2?.[1]) {
    const h12 = Number(m2[1]);
    const mm = m2?.[2] ? Number(m2[2]) : 0;
    const ampm = m2?.[3] ? String(m2[3]).toLowerCase() : "";
    if (!Number.isFinite(h12) || h12 < 1 || h12 > 12 || !Number.isFinite(mm) || mm < 0 || mm > 59) return "";
    let hh = h12 % 12;
    if (ampm.startsWith("p")) hh += 12;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  return "";
}

// Legacy deterministic plan builder kept for possible future use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildDeterministicWeekdaySmsPlan(opts: {
  text: string;
  ownerTimeZone?: string;
}):
  | { mode: "execute"; workTitle: string; steps: Array<{ key: any; title: string; args: Record<string, unknown> }> }
  | { mode: "clarify"; clarifyingQuestion: string }
  | null {
  const text = String(opts.text || "");
  if (!looksLikeWeekdaySmsSchedule(text)) return null;

  // If the user is asking to edit/reschedule existing scheduled tasks, do not create new schedules.
  if (looksLikeScheduledTasksEditRequest(text)) return null;

  const contactHint = extractContactHint(text);
  const timeLocal = extractTimeLocalHHmm(text);
  const tz = String(opts.ownerTimeZone || "").trim().slice(0, 80);

  if (!contactHint) {
    return {
      mode: "clarify",
      clarifyingQuestion: "Which contact should these weekday SMS messages go to?",
    };
  }

  if (!timeLocal) {
    return {
      mode: "clarify",
      clarifyingQuestion: "What time should the weekday SMS be scheduled for (e.g. 9:00am)?",
    };
  }

  const msg = extractQuotedMessage(text) || "Good morning, ready to get started?";
  const wantsNow = userWantsTestSendNow(text);

  const bodyPrompt = [
    `Write a short, friendly good-morning SMS to the contact '${contactHint}'.`,
    "The goal is to prompt them to get started today.",
    "Make it feel fresh/unique each day (avoid repeating the same phrasing).",
    `Style inspiration (optional): ${msg}`,
  ].join(" ");

  const steps: Array<{ key: any; title: string; args: Record<string, unknown> }> = [];

  if (wantsNow) {
    steps.push({
      key: "inbox.send_sms",
      title: `Send test SMS to ${contactHint}`,
      args: {
        contactId: { $ref: "contact", hint: contactHint },
        bodyPrompt,
      },
    });
  }

  const weekdays: Array<{ label: string; isoWeekday: number }> = [
    { label: "Monday", isoWeekday: 1 },
    { label: "Tuesday", isoWeekday: 2 },
    { label: "Wednesday", isoWeekday: 3 },
    { label: "Thursday", isoWeekday: 4 },
    { label: "Friday", isoWeekday: 5 },
  ];

  for (const d of weekdays) {
    if (steps.length >= 6) break;
    steps.push({
      key: "ai_chat.scheduled.create",
      title: `Schedule ${d.label} ${timeLocal} SMS to ${contactHint}`,
      args: {
        // Deterministic scheduled action envelope: when this scheduled message becomes due,
        // the scheduled processor will execute inbox.send_sms directly (no general planner).
        text: encodeScheduledActionEnvelope({
          workTitle: "Weekday SMS",
          steps: [
            {
              key: "inbox.send_sms",
              title: "Send scheduled SMS",
              args: { contactId: { $ref: "contact", hint: contactHint }, bodyPrompt },
            },
          ],
        }),
        sendAtLocal: {
          isoWeekday: d.isoWeekday,
          timeLocal,
          ...(tz ? { timeZone: tz } : {}),
        },
        repeatEveryMinutes: 10080,
      },
    });
  }

  if (!steps.length) return null;

  return {
    mode: "execute",
    workTitle: `Weekday ${timeLocal} SMS to ${contactHint}`,
    steps,
  };
}

function normalizePhoneLike(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9+]/g, "");
  if (!digits) return null;
  // Keep leading + if present, otherwise just digits.
  const cleaned = digits.startsWith("+") ? `+${digits.slice(1).replace(/\D+/g, "")}` : digits.replace(/\D+/g, "");
  if (cleaned.replace(/\D+/g, "").length < 8) return null;
  return cleaned.slice(0, 20);
}

function extractFirstEmailLike(textRaw: string): string | null {
  const t = String(textRaw || "");
  const m = /\b([A-Z0-9._%+-]{1,80}@[A-Z0-9.-]{1,120}\.[A-Z]{2,24})\b/i.exec(t);
  return m?.[1] ? String(m[1]).trim().slice(0, 140) : null;
}

async function maybeUpdateThreadSummary(opts: {
  ownerId: string;
  threadId: string;
  threadContext: unknown;
  recentMessages: Array<{ role: "user" | "assistant"; text: string }>;
  latestUserText: string;
}): Promise<unknown> {
  const latest = String(opts.latestUserText || "").trim();
  if (!latest) return opts.threadContext;

  const prevCtx = opts.threadContext && typeof opts.threadContext === "object" && !Array.isArray(opts.threadContext)
    ? (opts.threadContext as any)
    : {};

  const prevSummary = typeof prevCtx.threadSummary === "string" ? String(prevCtx.threadSummary).trim() : "";
  const prevUpdatedAtRaw = typeof prevCtx.threadSummaryUpdatedAt === "string" ? String(prevCtx.threadSummaryUpdatedAt).trim() : "";
  const prevUpdatedAtMs = prevUpdatedAtRaw ? Date.parse(prevUpdatedAtRaw) : 0;

  // Avoid multiple summary writes inside the same fast interaction.
  if (prevUpdatedAtMs && Number.isFinite(prevUpdatedAtMs)) {
    const ageMs = Date.now() - prevUpdatedAtMs;
    if (ageMs >= 0 && ageMs < 10_000) return prevCtx;
  }

  const transcript = [...(opts.recentMessages || []).slice(-20), { role: "user" as const, text: latest }]
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.text || "").replace(/[\r\n\t]+/g, " ").slice(0, 800)}`)
    .join("\n");

  const system = [
    "You write a compact running summary for a support/agent chat thread.",
    "Goal: preserve full conversation context for future tool execution.",
    "Constraints:",
    "- Output plain text only.",
    "- Keep it under 1,200 characters.",
    "- Include: user intent, latest decisions, current targets (e.g. funnel/page), and any created entities.",
    "- If the user refers to 'the same one we just made', capture which entity that is.",
    "- Do not include IDs unless they were explicitly provided.",
  ].join("\n");

  const user = [
    "Previous summary:",
    prevSummary || "(none)",
    "\nRecent conversation:",
    transcript || "(none)",
    "\nUpdated summary:",
  ].join("\n");

  try {
    const raw = await generateText({ system, user });
    const nextSummary = String(raw || "")
      .trim()
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 1200)
      .trim();

    if (!nextSummary) return prevCtx;

    const nextCtx = {
      ...prevCtx,
      threadSummary: nextSummary,
      threadSummaryUpdatedAt: new Date().toISOString(),
    };

    await (prisma as any).portalAiChatThread.update({ where: { id: opts.threadId }, data: { contextJson: nextCtx } });
    return nextCtx;
  } catch {
    return prevCtx;
  }
}

async function maybeUpdateThreadTitle(opts: {
  thread: any;
  threadId: string;
  now: Date;
  promptMessage: string;
  assistantText: string;
}): Promise<void> {
  try {
    const currentTitle = String(opts.thread?.title || "").trim();
    const isDefaultTitle = currentTitle === "New chat" || !currentTitle || currentTitle.toLowerCase() === "new chat";
    const createdAt = (opts.thread as any)?.createdAt ? new Date((opts.thread as any).createdAt) : null;
    const threadAgeMs = createdAt ? opts.now.getTime() - createdAt.getTime() : 0;
    const isRecent = Boolean(createdAt) && threadAgeMs < 5 * 60 * 1000;

    if (!isDefaultTitle && !isRecent) return;

    const heuristic = heuristicThreadTitleFromUserText(opts.promptMessage);
    const shouldPreferHeuristic = looksLikeWeekdaySmsSchedule(opts.promptMessage);

    let nextTitle = cleanSuggestedTitle(heuristic);

    if (!shouldPreferHeuristic && isPortalSupportChatConfigured()) {
      const titleSystem = [
        "You name chat threads in a business automation portal.",
        "Return a short, helpful title (2-6 words).",
        "No quotes. No trailing punctuation.",
        "Make it action-oriented and descriptive.",
      ].join("\n");

      const titleUser = [
        "Conversation:",
        `User: ${String(opts.promptMessage || "").slice(0, 800)}`,
        `Assistant: ${String(opts.assistantText || "").slice(0, 800)}`,
        "\nTitle:",
      ].join("\n");

      try {
        const aiProposed = cleanSuggestedTitle(await generateText({ system: titleSystem, user: titleUser }));
        if (aiProposed && aiProposed.length >= 3) nextTitle = aiProposed;
      } catch {
        // ignore and keep heuristic
      }
    }

    if (nextTitle && nextTitle.length >= 3 && nextTitle.toLowerCase() !== "new chat") {
      await (prisma as any).portalAiChatThread.update({ where: { id: opts.threadId }, data: { title: nextTitle } });
      return;
    }

    if (isDefaultTitle) {
      const firstMsg = await prisma.portalAiChatMessage.findFirst({ where: { threadId: opts.threadId }, orderBy: { createdAt: "asc" } });
      if (firstMsg && firstMsg.text && firstMsg.text.length > 3) {
        await prisma.portalAiChatThread.update({ where: { id: opts.threadId }, data: { title: firstMsg.text.slice(0, 60) } });
      }
    }
  } catch {
    // best-effort
  }
}

function cleanShortLabel(v: string, max = 80) {
  return String(v || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.?!,;:]+$/g, "")
    .slice(0, max)
    .trim();
}

function extractContactTagCommand(textRaw: string):
  | { mode: "add" | "remove"; tagName: string; contactHint: string }
  | null {
  const t = String(textRaw || "").trim();
  if (!t) return null;

  // add tag VIP to John Smith
  // remove tag VIP from john@x.com
  const m1 = /\b(add|apply)\s+tag\s+["']?([^"'\n]{1,80})["']?\s+\b(to|for)\b\s+(?:contact\s+)?["']?([^"'\n]{1,120})["']?\s*$/i.exec(
    t,
  );
  if (m1?.[1] && m1?.[2] && m1?.[4]) {
    return { mode: "add", tagName: cleanShortLabel(m1[2], 60), contactHint: cleanShortLabel(m1[4], 120) };
  }

  const m2 = /\b(remove|delete)\s+tag\s+["']?([^"'\n]{1,80})["']?\s+\b(from)\b\s+(?:contact\s+)?["']?([^"'\n]{1,120})["']?\s*$/i.exec(
    t,
  );
  if (m2?.[1] && m2?.[2] && m2?.[3]) {
    return { mode: "remove", tagName: cleanShortLabel(m2[2], 60), contactHint: cleanShortLabel(m2[3], 120) };
  }

  // tag John Smith as VIP
  const m3 = /\btag\s+(?:contact\s+)?["']?([^"'\n]{1,120})["']?\s+\b(as|with)\b\s+(?:tag\s+)?["']?([^"'\n]{1,80})["']?\s*$/i.exec(
    t,
  );
  // groups: 1=contact, 2=as|with, 3=tag name
  if (m3?.[1] && m3?.[3]) {
    return { mode: "add", tagName: cleanShortLabel(m3[3], 60), contactHint: cleanShortLabel(m3[1], 120) };
  }

  // untag John Smith (VIP)
  const m4 = /\b(untag|remove\s+tag)\s+(?:contact\s+)?["']?([^"'\n]{1,120})["']?\s*\(?\s*["']?([^"'\n]{1,80})["']?\s*\)?\s*$/i.exec(
    t,
  );
  if (m4?.[1] && m4?.[2] && m4?.[3]) {
    return { mode: "remove", tagName: cleanShortLabel(m4[3], 60), contactHint: cleanShortLabel(m4[2], 120) };
  }

  return null;
}

const AiTagCommandSchema = z
  .object({
    mode: z.enum(["add", "remove"]).optional(),
    tagName: z.string().trim().max(80).optional(),
    contactHint: z.string().trim().max(160).optional(),
  })
  .strict();

const AiTagPlanSchema = z
  .object({
    contactHint: z.string().trim().max(160).optional(),
    addTagNames: z.array(z.string().trim().max(80)).max(5).optional(),
    removeTagNames: z.array(z.string().trim().max(80)).max(5).optional(),
  })
  .strict();

function isBadTagName(raw: string): boolean {
  const t = cleanShortLabel(raw, 60).toLowerCase();
  if (!t) return true;
  if (t.length <= 1) return true;
  // Only block stopwords if the tag does NOT exist for the contact; allow if it exists.
  // This check will be handled in the tag lookup logic below, so do not block here.
  if (["tag", "tags", "untag", "add", "remove", "apply"].includes(t)) return true;
  return false;
}

async function extractContactTagCommandAi(textRaw: string): Promise<
  | { mode: "add" | "remove"; tagName: string; contactHint: string }
  | null
> {
  const text = String(textRaw || "").trim();
  if (!text) return null;
  if (!/\b(tag|tags|untag|label)\b/i.test(text)) return null;

  // Keep this lightweight: just structured extraction.
  const system = [
    "You extract structured commands for a CRM portal.",
    "If the user is asking to add/remove a tag on a contact, output JSON with:",
    "{ \"mode\": \"add\"|\"remove\", \"tagName\": string, \"contactHint\": string }",
    "tagName must be the actual tag (not words like 'as', 'with', 'to').",
    "contactHint should be whatever identifies the contact (name, email, or phone) from the user text.",
    "If the request is NOT about tagging a contact, output {}.",
    "Output JSON only.",
    "Examples:",
    "User: tag Chester as VIP -> {\"mode\":\"add\",\"tagName\":\"VIP\",\"contactHint\":\"Chester\"}",
    "User: add tag \"Hot lead\" to chester@example.com -> {\"mode\":\"add\",\"tagName\":\"Hot lead\",\"contactHint\":\"chester@example.com\"}",
    "User: remove tag VIP from +15551234567 -> {\"mode\":\"remove\",\"tagName\":\"VIP\",\"contactHint\":\"+15551234567\"}",
  ].join("\n");

  try {
    const raw = await generateText({ system, user: text });
    const obj = extractJsonObject(raw);
    const parsed = AiTagCommandSchema.safeParse(obj);
    if (!parsed.success) return null;
    const mode = parsed.data.mode;
    const tagName = typeof parsed.data.tagName === "string" ? cleanShortLabel(parsed.data.tagName, 60) : "";
    const contactHint = typeof parsed.data.contactHint === "string" ? cleanShortLabel(parsed.data.contactHint, 120) : "";
    if (!mode || !tagName || !contactHint) return null;
    if (isBadTagName(tagName)) return null;
    return { mode, tagName, contactHint };
  } catch {
    return null;
  }
}

function uniqTagNames(raw: Array<string>): Array<string> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of raw) {
    const cleaned = cleanShortLabel(n, 60);
    if (!cleaned || isBadTagName(cleaned)) continue;
    const k = cleaned.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cleaned);
  }
  return out.slice(0, 5);
}

function shouldAttemptTagPlanAi(opts: { text: string; recentMessages: Array<{ role: "user" | "assistant"; text: string }> }) {
  const t = String(opts.text || "").trim();
  if (!t) return false;

  if (/\b(tag|tags|untag|label)\b/i.test(t)) return true;
  if (/\b(remove|delete|use|swap|replace|then|make one|make it)\b/i.test(t)) {
    const recent = opts.recentMessages || [];
    const recentText = recent.map((m) => String(m.text || "")).join("\n");
    if (/\btag\b|\buntag\b|\bcontact tag\b|\bAdded tag\b|\bRemoved tag\b|\bNo tag named\b/i.test(recentText)) return true;
  }

  return false;
}

async function extractContactTagPlanAi(opts: {
  text: string;
  recentMessages: Array<{ role: "user" | "assistant"; text: string }>;
}): Promise<
  | { contactHint: string; addTagNames: string[]; removeTagNames: string[] }
  | null
> {
  const text = String(opts.text || "").trim();
  if (!text) return null;
  if (!shouldAttemptTagPlanAi({ text, recentMessages: opts.recentMessages })) return null;

  const convo = (opts.recentMessages || [])
    .slice(-10)
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.text || "").slice(0, 500)}`)
    .join("\n");

  const system = [
    "You extract structured tag operations for a CRM portal.",
    "Output JSON only.",
    "If the user is asking to add/remove/replace tags on a contact, output JSON with:",
    "{ \"contactHint\": string, \"addTagNames\": string[], \"removeTagNames\": string[] }",
    "contactHint should identify the contact (name/email/phone) using the conversation context.",
    "addTagNames/removeTagNames must be the actual tag names (not words like 'as', 'with', 'to').",
    "If the user is NOT asking about contact tags, output {}.",
    "Examples:",
    "User: tag Chester as VIP -> {\"contactHint\":\"Chester\",\"addTagNames\":[\"VIP\"],\"removeTagNames\":[]}",
    "User: remove tag as from Chester and add VIP -> {\"contactHint\":\"Chester\",\"addTagNames\":[\"VIP\"],\"removeTagNames\":[\"as\"]}",
    "User: then make one -> (infer what to do from context; if context is about adding VIP to Chester, output that)",
  ].join("\n");

  const user = [
    "Conversation (most recent last):",
    convo || "(no prior messages)",
    "\nLatest user message:",
    text,
    "\nJSON:",
  ].join("\n");

  try {
    const raw = await generateText({ system, user });
    const obj = extractJsonObject(raw);
    const parsed = AiTagPlanSchema.safeParse(obj);
    if (!parsed.success) return null;
    const contactHint = typeof parsed.data.contactHint === "string" ? cleanShortLabel(parsed.data.contactHint, 120) : "";
    const addTagNames = uniqTagNames(Array.isArray(parsed.data.addTagNames) ? parsed.data.addTagNames : []);
    const removeTagNames = uniqTagNames(Array.isArray(parsed.data.removeTagNames) ? parsed.data.removeTagNames : []);
    if (!contactHint) return null;
    if (!addTagNames.length && !removeTagNames.length) return null;
    return { contactHint, addTagNames, removeTagNames };
  } catch {
    return null;
  }
}

// Legacy direct execution path kept for possible future use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function tryExecuteContactTagCommand(opts: {
  ownerId: string;
  threadId: string;
  now: Date;
  text: string;
  recentMessages: Array<{ role: "user" | "assistant"; text: string }>;
}): Promise<
  | { ok: true; assistantMessage: any; autoActionMessage: any; canvasUrl: string | null }
  | {
      ok: false;
      assistantMessage: any;
      autoActionMessage?: any;
      canvasUrl: string | null;
      ambiguousContacts?: Array<{ name: string; email?: string | null; phone?: string | null }>;
    }
  | null
> {
  let plan: { contactHint: string; addTagNames: string[]; removeTagNames: string[] } | null = null;

  const cmd = extractContactTagCommand(opts.text);
  if (cmd?.tagName && cmd?.contactHint && !isBadTagName(cmd.tagName)) {
    plan = {
      contactHint: cmd.contactHint,
      addTagNames: cmd.mode === "add" ? [cmd.tagName] : [],
      removeTagNames: cmd.mode === "remove" ? [cmd.tagName] : [],
    };
  }

  // If regex parsing fails (or yields junk), ask the model to extract a structured tag plan.
  if (!plan) {
    const aiPlan = await extractContactTagPlanAi({ text: opts.text, recentMessages: opts.recentMessages });
    if (aiPlan) plan = aiPlan;
  }

  // Legacy single-command extraction (kept as a fallback; returns only one operation).
  if (!plan) {
    const aiCmd = await extractContactTagCommandAi(opts.text);
    if (aiCmd?.tagName && aiCmd?.contactHint && !isBadTagName(aiCmd.tagName)) {
      plan = {
        contactHint: aiCmd.contactHint,
        addTagNames: aiCmd.mode === "add" ? [aiCmd.tagName] : [],
        removeTagNames: aiCmd.mode === "remove" ? [aiCmd.tagName] : [],
      };
    }
  }

  if (!plan?.contactHint || (!plan.addTagNames.length && !plan.removeTagNames.length)) return null;

  const ownerId = String(opts.ownerId);
  const threadId = String(opts.threadId);

  const generateAssistantText = async (system: string, payload: unknown) => {
    try {
      return String(await generateText({ system, user: `Context (JSON):\n${JSON.stringify(payload, null, 2)}` })).trim();
    } catch {
      return "";
    }
  };

  const createAssistantMessage = async (text: string) => {
    const safeText = String(text || "").trim();
    if (!safeText) return null;
    const assistantMsg = await (prisma as any).portalAiChatMessage.create({
      data: {
        ownerId,
        threadId,
        role: "assistant",
        text: safeText.slice(0, 12000),
        attachmentsJson: null,
        createdByUserId: null,
        sendAt: null,
        sentAt: opts.now,
      },
      select: {
        id: true,
        role: true,
        text: true,
        attachmentsJson: true,
        createdAt: true,
        sendAt: true,
        sentAt: true,
      },
    });
    await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: opts.now } });
    return assistantMsg;
  };

  const emailLike = extractFirstEmailLike(plan.contactHint);
  const emailKey = emailLike ? normalizeEmailKey(emailLike) : null;
  const phoneLike = normalizePhoneLike(plan.contactHint);
  const phoneKey = phoneLike ? normalizePhoneKey(phoneLike).phoneKey : null;
  const nameLike = cleanShortLabel(plan.contactHint, 80);

  let contact: { id: string; name: string } | null = null;
  let ambiguous: Array<{ name: string; email?: string | null; phone?: string | null }> = [];

  try {
    if (emailKey) {
      const rows = await (prisma as any).portalContact.findMany({
        where: { ownerId, emailKey },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, phone: true },
      });
      if (rows?.length === 1) contact = { id: String(rows[0].id), name: String(rows[0].name || "").trim() || emailLike || "Contact" };
      else if (rows?.length > 1) {
        ambiguous = rows.map((r: any) => ({ name: String(r.name || "").trim() || "(No name)", email: r.email ? String(r.email) : null, phone: r.phone ? String(r.phone) : null }));
      }
    } else if (phoneKey) {
      const row = await (prisma as any).portalContact.findFirst({
        where: { ownerId, phoneKey },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, email: true, phone: true },
      });
      if (row) contact = { id: String(row.id), name: String(row.name || "").trim() || phoneLike || "Contact" };
    } else if (nameLike) {
      const nameKey = normalizeNameKey(nameLike);
      const rows = await (prisma as any).portalContact.findMany({
        where: { ownerId, nameKey },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, phone: true },
      });
      if (rows?.length === 1) contact = { id: String(rows[0].id), name: String(rows[0].name || "").trim() || nameLike };
      else if (rows?.length > 1) {
        ambiguous = rows.map((r: any) => ({ name: String(r.name || "").trim() || "(No name)", email: r.email ? String(r.email) : null, phone: r.phone ? String(r.phone) : null }));
      }
    }
  } catch {
    // ignore
  }

  if (!contact && ambiguous.length) {
    // Return a structured ambiguity payload for the frontend to render clickable choices
    const assistantText = await generateAssistantText(
      [
        "You are Pura, an AI assistant inside a SaaS portal.",
        "The user asked to update contact tags, but multiple contacts match.",
        "Ask the user to pick the correct contact.",
        "Rules:",
        "- 1-2 sentences.",
        "- Do not mention internal IDs.",
        "- No JSON.",
      ].join("\n"),
      {
        contactHint: plan.contactHint,
        matchesPreview: ambiguous.slice(0, 5),
      },
    );

    return {
      ok: false,
      assistantMessage: await createAssistantMessage(assistantText),
      ambiguousContacts: ambiguous.slice(0, 5),
      canvasUrl: null,
    };
  }

  if (!contact) {
    const assistantText = await generateAssistantText(
      [
        "You are Pura, an AI assistant inside a SaaS portal.",
        "The user asked to update contact tags, but no contact matched.",
        "Ask for one missing detail so you can find the right contact.",
        "Rules:",
        "- Ask for email or phone number.",
        "- 1-2 sentences.",
        "- No JSON.",
      ].join("\n"),
      { contactHint: plan.contactHint },
    );
    const msg = await createAssistantMessage(assistantText);
    return { ok: false, assistantMessage: msg, canvasUrl: null };
  }

  const results: Array<{ kind: "add" | "remove"; tagName: string; ok: boolean; note?: string | null }> = [];
  let anyOk = false;

  for (const rawName of plan.removeTagNames) {
    const name = cleanShortLabel(rawName, 60);
    if (!name || isBadTagName(name)) continue;
    const tagRow = await (prisma as any).portalContactTag
      .findFirst({ where: { ownerId, nameKey: normalizeNameKey(name) }, select: { id: true, name: true } })
      .catch(() => null);
    if (!tagRow?.id) {
      results.push({ kind: "remove", tagName: name, ok: false, note: "tag_not_found" });
      continue;
    }

    const ok = await removeContactTagAssignment({ ownerId, contactId: contact.id, tagId: String(tagRow.id) });
    if (ok) {
      anyOk = true;
      results.push({ kind: "remove", tagName: String(tagRow.name), ok: true, note: null });
    } else {
      results.push({ kind: "remove", tagName: String(tagRow.name), ok: false, note: "tag_not_assigned" });
    }
  }

  for (const rawName of plan.addTagNames) {
    const name = cleanShortLabel(rawName, 60);
    if (!name || isBadTagName(name)) continue;
    const existing = await (prisma as any).portalContactTag
      .findFirst({ where: { ownerId, nameKey: normalizeNameKey(name) }, select: { id: true } })
      .catch(() => null);

    const tag = await createOwnerContactTag({ ownerId, name }).catch(() => null);
    if (!tag?.id) {
      results.push({ kind: "add", tagName: name, ok: false, note: "tag_create_failed" });
      continue;
    }

    const ok = await addContactTagAssignment({ ownerId, contactId: contact.id, tagId: tag.id });
    if (ok) {
      anyOk = true;
      results.push({ kind: "add", tagName: String(tag.name), ok: true, note: existing?.id ? null : "tag_created" });
    } else {
      results.push({ kind: "add", tagName: String(tag.name), ok: false, note: "assignment_failed" });
    }
  }

  if (!results.length) return null;
  const assistantText = await generateAssistantText(
    [
      "You are Pura, an AI assistant inside a SaaS portal.",
      "You just updated a contact's tags.",
      "Write concise markdown summarizing what changed.",
      "Rules:",
      "- If some operations failed, mention that briefly.",
      "- Do not invent any tags not in the JSON.",
      "- If a canvasUrl is provided, include exactly one markdown link to open the contact.",
      "- No JSON.",
    ].join("\n"),
    {
      contact: { id: contact.id, name: contact.name },
      operations: results,
      canvasUrl: portalContactUiUrl(contact.id),
    },
  );
  const msg = await createAssistantMessage(assistantText);
  return { ok: anyOk, assistantMessage: msg, autoActionMessage: msg, canvasUrl: portalContactUiUrl(contact.id) };
}

function normalizeTaskTitleKey(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractTaskTitleHintFromText(text: string): { mode: "done" | "open" | "canceled"; titleHint: string } | null {
  const t = String(text || "").trim();
  if (!t) return null;

  const done = /\b(done|complete|completed|finish|finished|close|closed|mark\s+done|mark\s+complete)\b/i.test(t);
  const reopen = /\b(reopen|re-open|open|undo|uncomplete|un-complete|mark\s+open)\b/i.test(t);
  const cancel = /\b(cancel|canceled|cancelled)\b/i.test(t);
  const mode: "done" | "open" | "canceled" = cancel ? "canceled" : done ? "done" : reopen ? "open" : "done";

  if (!/\b(task|todo|to-do|to\s*do)\b/i.test(t) && !/\b(mark|complete|finish|close|reopen|cancel)\b/i.test(t)) return null;

  const quoted = /["“]([^"”\n]{1,200})["”]/.exec(t);
  if (quoted?.[1]) {
    const titleHint = cleanShortLabel(quoted[1], 160);
    if (titleHint) return { mode, titleHint };
  }

  const afterTask = /\b(?:task|todo|to-do|to\s*do)\b\s*(?:named|called|titled)?\s*[:\-]?\s*([^\n]{1,200})\s*$/i.exec(t);
  if (afterTask?.[1]) {
    const titleHint = cleanShortLabel(afterTask[1], 160);
    if (titleHint) return { mode, titleHint };
  }

  const markPattern = /\b(?:mark|complete|finish|close|reopen|cancel)\b[\s\S]{0,60}\b(?:task|todo|to-do|to\s*do)\b\s*[:\-]?\s*([^\n]{1,200})\s*$/i.exec(t);
  if (markPattern?.[1]) {
    const titleHint = cleanShortLabel(markPattern[1], 160);
    if (titleHint) return { mode, titleHint };
  }

  return null;
}

function extractTaskIdFromText(text: string) {
  const t = String(text || "");
  const m =
    /\btask\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
    /\btaskId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
  return m?.[1] ? String(m[1]).trim() : "";
}

function extractTaskCreateFromText(text: string): { forAll: boolean; title: string; description?: string } | null {
  const t = String(text || "").trim();
  if (!t) return null;
  if (!/\b(task|todo|to-do|to\s*do)\b/i.test(t)) return null;
  if (!/\b(create|add|make|new)\b/i.test(t)) return null;

  const forAll = /\b(for\s+(everyone|all|the\s+team|the\s+whole\s+team)|everyone|all\s+team\s+members)\b/i.test(t);

  const quoted = /\b(?:create|add|make)\b[\s\S]{0,20}\b(?:task|todo|to-do|to\s*do)\b[\s\S]{0,20}["“]([^"”\n]{1,200})["”]/i.exec(t);
  if (quoted?.[1]) {
    const title = cleanShortLabel(quoted[1], 160);
    if (title) return { forAll, title };
  }

  const after = /\b(?:create|add|make)\b[\s\S]{0,20}\b(?:a\s+)?(?:new\s+)?(?:task|todo|to-do|to\s*do)\b\s*(?:to\s+|:|\-|\u2014)?\s*([^\n]{1,200})\s*$/i.exec(t);
  if (after?.[1]) {
    let title = String(after[1] || "").trim();
    title = title.replace(/\b(for\s+(everyone|all|the\s+team|the\s+whole\s+team))\b/gi, "").trim();
    title = cleanShortLabel(title, 160);
    if (title) return { forAll, title };
  }

  return null;
}

function extractTaskListFromText(text: string): { status?: "OPEN" | "DONE" | "CANCELED" | "ALL"; assigned?: "me" | "all" } | null {
  const t = String(text || "").trim();
  if (!t) return null;
  if (!/\b(task|tasks|todo|to-do|to\s*do)\b/i.test(t)) return null;
  if (!/\b(list|show|view|see|what\s+are|what\s+is|any)\b/i.test(t)) return null;

  const assigned: "me" | "all" = /\b(my|mine|assigned\s+to\s+me)\b/i.test(t) ? "me" : "all";

  const wantsAll = /\b(all|everything)\b/i.test(t) && /\btask|tasks|todo|to-do|to\s*do\b/i.test(t);
  const wantsDone = /\b(done|completed|finished|closed)\b/i.test(t);
  const wantsCanceled = /\b(canceled|cancelled)\b/i.test(t);
  const wantsOpen = /\b(open|pending|active)\b/i.test(t);

  const status: "OPEN" | "DONE" | "CANCELED" | "ALL" | undefined = wantsAll ? "ALL" : wantsCanceled ? "CANCELED" : wantsDone ? "DONE" : wantsOpen ? "OPEN" : undefined;

  return { status, assigned };
}

// Legacy direct execution path kept for possible future use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function tryExecuteTaskCommand(opts: {
  ownerId: string;
  threadId: string;
  now: Date;
  text: string;
  actorUserId: string | null;
}): Promise<
  | { ok: true; assistantMessage: any; autoActionMessage: any; canvasUrl: string | null }
  | { ok: false; assistantMessage: any; autoActionMessage?: any; canvasUrl: string | null }
  | null
> {
  const ownerId = String(opts.ownerId);
  const threadId = String(opts.threadId);
  const text = String(opts.text || "").trim();
  if (!text) return null;

  // IMPORTANT: “scheduled tasks” belong to the AI chat scheduler, not the portal Tasks service.
  // If the user is asking about scheduled items, let the scheduler flows handle it.
  const lower = text.toLowerCase();
  const mentionsScheduled = /\b(scheduled|schedule)\b/i.test(lower);
  const mentionsTaskLike = /\b(tasks?|runs?|messages?|items?)\b/i.test(lower);
  if (mentionsScheduled && mentionsTaskLike) return null;

  const createAssistantMessage = async (msgText: string) => {
    const safeText = String(msgText || "").trim();
    if (!safeText) return null;
    const assistantMsg = await (prisma as any).portalAiChatMessage.create({
      data: {
        ownerId,
        threadId,
        role: "assistant",
        text: safeText.slice(0, 12000),
        attachmentsJson: null,
        createdByUserId: null,
        sendAt: null,
        sentAt: opts.now,
      },
      select: {
        id: true,
        role: true,
        text: true,
        attachmentsJson: true,
        createdAt: true,
        sendAt: true,
        sentAt: true,
      },
    });
    await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: opts.now } });
    return assistantMsg;
  };

  const generateAssistantText = async (system: string, payload: unknown) => {
    try {
      return String(await generateText({ system, user: `Context (JSON):\n${JSON.stringify(payload, null, 2)}` })).trim();
    } catch {
      return "";
    }
  };

  // 1) List tasks.
  const listCmd = extractTaskListFromText(text);
  if (listCmd) {
    const exec = await executePortalAgentActionForThread({
      ownerId,
      threadId,
      action: "tasks.list",
      args: { status: listCmd.status ?? null, assigned: listCmd.assigned ?? null, limit: 50 },
      actorUserId: opts.actorUserId || undefined,
    });

    const tasks = Array.isArray((exec as any)?.json?.tasks) ? ((exec as any).json.tasks as any[]) : [];
    if (!(exec as any)?.json?.ok) {
      const assistantText = await generateAssistantText(
        "You are an assistant in a SaaS portal. The user asked to list tasks, but the system returned an error. Write a short helpful message that mentions the failure and suggests trying again or opening the Tasks page. Do not invent tasks.",
        { error: String((exec as any)?.json?.error || "").trim() || null, status: listCmd.status ?? null, assigned: listCmd.assigned ?? null },
      );
      const assistantMsg = await createAssistantMessage(assistantText);
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    if (!tasks.length) {
      const assistantText = await generateAssistantText(
        "You are an assistant in a SaaS portal. The user asked to list tasks, and there are none. Write a short, friendly message confirming there are no matching tasks. Keep it to 1-2 sentences.",
        { status: listCmd.status ?? null, assigned: listCmd.assigned ?? null },
      );
      const assistantMsg = await createAssistantMessage(assistantText);
      return { ok: true, assistantMessage: assistantMsg, autoActionMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    const lines = tasks.slice(0, 15).map((t) => {
      const id = String(t?.id || "").slice(0, 32);
      const title = String(t?.title || "(Untitled)").slice(0, 160);
      const status = String(t?.status || "OPEN");
      const dueAt = t?.dueAtIso ? String(t.dueAtIso).slice(0, 25) : "";
      const due = dueAt ? ` (due ${dueAt})` : "";
      return `- ${title}${due} [${status}] (task id: ${id})`;
    });

    const assistantText = await generateAssistantText(
      "You are an assistant in a SaaS portal. Present the user's task list as concise markdown. Use a short intro line and then bullet points. Do not add tasks that are not in the list.",
      { status: listCmd.status ?? null, assigned: listCmd.assigned ?? null, previewLines: lines.slice(0, 15) },
    );
    const assistantMsg = await createAssistantMessage(assistantText);
    return { ok: true, assistantMessage: assistantMsg, autoActionMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
  }

  // 2) Create task.
  const createCmd = extractTaskCreateFromText(text);
  if (createCmd?.title) {
    const action: PortalAgentActionKey = createCmd.forAll ? "tasks.create_for_all" : "tasks.create";
    const args = createCmd.forAll
      ? { title: createCmd.title, description: createCmd.description || undefined, dueAtIso: null }
      : { title: createCmd.title, description: createCmd.description || undefined, assignedToUserId: null, dueAtIso: null };

    const exec = await executePortalAgentActionForThread({ ownerId, threadId, action, args, actorUserId: opts.actorUserId || undefined });
    if (!(exec as any)?.json?.ok) {
      const assistantText = await generateAssistantText(
        "You are an assistant in a SaaS portal. The user asked to create a task, but the system returned an error. Write a short helpful error message. Do not claim the task was created.",
        { title: createCmd.title, error: String((exec as any)?.json?.error || "").trim() || null },
      );
      const assistantMsg = await createAssistantMessage(assistantText);
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    const taskId = typeof (exec as any)?.json?.taskId === "string" ? String((exec as any).json.taskId).slice(0, 32) : "";
    const assistantText = await generateAssistantText(
      "You are an assistant in a SaaS portal. Confirm that a task was created. Keep it to one sentence. If a task id is present, include it in parentheses.",
      { title: createCmd.title, taskId: taskId || null },
    );
    const assistantMsg = await createAssistantMessage(assistantText);
    return { ok: true, assistantMessage: assistantMsg, autoActionMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
  }

  // 3) Update task status by explicit ID.
  const explicitTaskId = extractTaskIdFromText(text);
  if (explicitTaskId) {
    const wantsDone = /\b(done|complete|completed|finish|finished|close|closed)\b/i.test(text);
    const wantsOpen = /\b(reopen|re-open|open|undo|uncomplete|un-complete)\b/i.test(text);
    const wantsCanceled = /\b(cancel|canceled|cancelled)\b/i.test(text);
    const status: "OPEN" | "DONE" | "CANCELED" | null = wantsCanceled ? "CANCELED" : wantsOpen ? "OPEN" : wantsDone ? "DONE" : null;
    if (status) {
      const exec = await executePortalAgentActionForThread({
        ownerId,
        threadId,
        action: "tasks.update",
        args: { taskId: explicitTaskId, status },
        actorUserId: opts.actorUserId || undefined,
      });

      if (!(exec as any)?.json?.ok) {
        const assistantText = await generateAssistantText(
          "You are an assistant in a SaaS portal. The user asked to update a task status by id, but the system returned an error. Write a short helpful error message.",
          { taskId: explicitTaskId, desiredStatus: status, error: String((exec as any)?.json?.error || "").trim() || null },
        );
        const assistantMsg = await createAssistantMessage(assistantText);
        return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
      }

      const assistantText = await generateAssistantText(
        "You are an assistant in a SaaS portal. Confirm that the task status was updated. Keep it to one sentence.",
        { taskId: explicitTaskId, status },
      );
      const assistantMsg = await createAssistantMessage(assistantText);
      return { ok: true, assistantMessage: assistantMsg, autoActionMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }
  }

  // 4) Update task status by title hint (resolve to a single task first).
  const titleCmd = extractTaskTitleHintFromText(text);
  if (titleCmd?.titleHint) {
    const desiredStatus: "OPEN" | "DONE" | "CANCELED" = titleCmd.mode === "open" ? "OPEN" : titleCmd.mode === "canceled" ? "CANCELED" : "DONE";
    const hintKey = normalizeTaskTitleKey(titleCmd.titleHint);
    if (!hintKey) return null;

    const exec = await executePortalAgentActionForThread({
      ownerId,
      threadId,
      action: "tasks.list",
      args: { status: desiredStatus === "DONE" ? "OPEN" : "OPEN", assigned: "me", limit: 200 },
      actorUserId: opts.actorUserId || undefined,
    });

    const tasks = Array.isArray((exec as any)?.json?.tasks) ? ((exec as any).json.tasks as any[]) : [];
    if (!(exec as any)?.json?.ok) return null;

    const matches = tasks
      .map((t) => ({ id: String(t?.id || ""), title: String(t?.title || "") }))
      .filter((t) => t.id && t.title)
      .filter((t) => normalizeTaskTitleKey(t.title).includes(hintKey))
      .slice(0, 8);

    if (!matches.length) {
      const assistantText = await generateAssistantText(
        "You are an assistant in a SaaS portal. You couldn't find a task matching the user's title hint. Ask the user to paste the task id so you can update it. Keep it to 1-2 sentences.",
        { titleHint: titleCmd.titleHint, desiredStatus },
      );
      const assistantMsg = await createAssistantMessage(assistantText);
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    if (matches.length > 1) {
      const preview = matches
        .slice(0, 5)
        .map((m) => `- ${m.title} (task id: ${m.id.slice(0, 32)})`)
        .join("\n");
      const assistantText = await generateAssistantText(
        "You are an assistant in a SaaS portal. There are multiple tasks matching the user's hint. Ask the user to reply with the exact task id to update. Include the provided preview list as-is.",
        { titleHint: titleCmd.titleHint, preview },
      );
      const assistantMsg = await createAssistantMessage(assistantText);
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    const chosen = matches[0];
    const exec2 = await executePortalAgentActionForThread({
      ownerId,
      threadId,
      action: "tasks.update",
      args: { taskId: chosen.id, status: desiredStatus },
      actorUserId: opts.actorUserId || undefined,
    });

    if (!(exec2 as any)?.json?.ok) {
      const assistantText = await generateAssistantText(
        "You are an assistant in a SaaS portal. The user asked to update a task status, but the system returned an error. Write a short helpful error message.",
        { taskId: chosen.id, title: chosen.title, desiredStatus, error: String((exec2 as any)?.json?.error || "").trim() || null },
      );
      const assistantMsg = await createAssistantMessage(assistantText);
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    const assistantText = await generateAssistantText(
      "You are an assistant in a SaaS portal. Confirm that the task status was updated. Keep it to one sentence.",
      { taskId: chosen.id, title: chosen.title, desiredStatus },
    );
    const assistantMsg = await createAssistantMessage(assistantText);
    return { ok: true, assistantMessage: assistantMsg, autoActionMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
  }

  return null;
}

// Legacy deterministic action detection (kept for possible future use).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectDeterministicActionsFromText(opts: {
  text: string;
  attachments: Array<{ id?: string | null; fileName?: string; url?: string }>;
}): Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown> }> {
  const t = String(opts.text || "").trim();
  const lower = t.toLowerCase();
  const attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
  if (!t && !attachments.length) return [];

  const parseTimeLocalFromText = (): string => {
    // 24h: 09:00
    const m24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(t);
    if (m24?.[1] && m24?.[2]) {
      const hh = String(m24[1]).padStart(2, "0");
      const mm = String(m24[2]).padStart(2, "0");
      return `${hh}:${mm}`;
    }

    // 12h: 9am, 9:30 pm, 9 a.m.
    const m12 = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(t);
    if (!m12?.[1] || !m12?.[3]) return "";
    const hhIn = Number(m12[1]);
    const mmIn = m12[2] ? Number(m12[2]) : 0;
    if (!Number.isFinite(hhIn) || hhIn < 1 || hhIn > 12) return "";
    if (!Number.isFinite(mmIn) || mmIn < 0 || mmIn > 59) return "";
    const isPm = /p/i.test(m12[3]);
    const hh24 = (hhIn % 12) + (isPm ? 12 : 0);
    return `${String(hh24).padStart(2, "0")}:${String(mmIn).padStart(2, "0")}`;
  };

  const scheduledMessageIdFromText = () => {
    const m =
      /\b(?:scheduled\s*)?(?:message|schedule|scheduled)\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
      /\bmessageId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  // AI Chat Scheduler: stop/edit scheduled items (never create a new schedule).
  if (/\b(schedule|scheduled)\b/i.test(t)) {
    const wantsStop = /\b(stop|cancel|delete|remove|disable|turn\s*off)\b/i.test(t);
    const wantsEdit = /\b(edit|change|update|modify|reschedule)\b/i.test(t);
    if (wantsStop) {
      const messageId = scheduledMessageIdFromText();
      if (messageId) return [{ key: "ai_chat.scheduled.delete", title: "Stop scheduled task", args: { messageId } }];
      return [{ key: "ai_chat.scheduled.list", title: "Manage scheduled tasks", args: {} }];
    }
    if (wantsEdit) {
      const timeLocal = parseTimeLocalFromText();
      const mentionsSms = /\bsms\b/i.test(t) || /\btext\b/i.test(t);
      const mentionsEmail = /\bemail\b/i.test(t);

      // If the user gave a concrete time and a channel, do a real bulk shift.
      if (timeLocal && (mentionsSms || mentionsEmail)) {
        const channel = mentionsSms ? "sms" : "email";
        const title = `Reschedule scheduled ${channel.toUpperCase()} tasks`;
        return [{ key: "ai_chat.scheduled.reschedule", title, args: { channel, timeLocal } }];
      }

      return [{ key: "ai_chat.scheduled.list", title: "Manage scheduled tasks", args: {} }];
    }
  }

  // AI Chat Scheduler: list scheduled items.
  // This is intentionally separate from the portal Tasks service.
  if (
    /\b(list|show|view|see|what\s+(?:is|are|'s)|any)\b/i.test(t) &&
    /\b(scheduled|schedule)\b/i.test(t) &&
    /\b(tasks?|messages?|runs?|items?)\b/i.test(t)
  ) {
    return [{ key: "ai_chat.scheduled.list", title: "List scheduled tasks", args: {} }];
  }

  // AI Chat: manage the current thread (rename/pin/unpin/duplicate/delete).
  // Note: We intentionally omit threadId here; the caller can inject the active threadId.
  const isThisChatThread =
    /\b(this|the)\s+(chat|thread|conversation)\b/i.test(t) ||
    /\b(chat\s*thread|ai\s*chat\s*thread)\b/i.test(t);
  if (isThisChatThread) {
    const renameMatch =
      /\b(?:rename|title|name)\b[\s\S]{0,40}\b(?:this|the)\s+(?:chat|thread|conversation)\b[\s\S]{0,60}\b(?:to|as)\b\s*["“]?([^"”\n]{1,200})["”]?\s*$/i.exec(t) ||
      /\b(?:rename|title|name)\b[\s\S]{0,10}\b(?:to|as)\b\s*["“]?([^"”\n]{1,200})["”]?\s*$/i.exec(t);
    if (renameMatch?.[1]) {
      const title = String(renameMatch[1]).trim().slice(0, 120);
      if (title) return [{ key: "ai_chat.threads.update", title: "Rename chat thread", args: { title } }];
    }

    if (/\bunpin\b/i.test(t)) {
      return [{ key: "ai_chat.threads.actions.run", title: "Unpin chat thread", args: { action: "unpin" } }];
    }
    if (/\bpin\b/i.test(t)) {
      return [{ key: "ai_chat.threads.actions.run", title: "Pin chat thread", args: { action: "pin" } }];
    }

    if (/\b(duplicate|copy|clone)\b/i.test(t)) {
      return [{ key: "ai_chat.threads.duplicate", title: "Duplicate chat thread", args: {} }];
    }

    if (/\b(delete|remove)\b/i.test(t)) {
      return [{ key: "ai_chat.threads.delete", title: "Delete chat thread", args: {} }];
    }
  }

  // Funnel Builder: create a funnel by name.
  // Note: This consumes credits; confirmation gating will prevent accidental auto-execution.
  if (/\b(create|make|add|new)\b/i.test(t) && /\b(funnel)\b/i.test(t)) {
    const m =
      /\b(?:create|make|add)\b[\s\S]{0,20}\b(?:a\s+)?(?:new\s+)?funnel\b[\s\S]{0,40}\b(?:named|called|titled)?\b\s*(?:to|as|:|-|\u2014)?\s*["“]?([^"”\n]{1,160})["”]?\s*$/i.exec(t) ||
      /\b(?:new)\s+funnel\b\s*(?:named|called|titled)?\b\s*(?:to|as|:|-|\u2014)?\s*["“]?([^"”\n]{1,160})["”]?\s*$/i.exec(t);

    const name = m?.[1] ? cleanShortLabel(m[1], 120) : "";
    if (name) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);

      if (slug) {
        return [{ key: "funnel.create", title: `Create funnel: ${name}`, args: { name, slug } }];
      }
    }
  }

  const bookingIdFromText = () => {
    const m = /\bbooking\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bbookingId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const campaignIdFromText = () => {
    const m =
      /\bcampaign\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
      /\bcampaignId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const stepIdFromText = () => {
    const m = /\bstep\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bstepId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const tagIdsFromText = () => {
    const m = /\btagIds\s*[:=]\s*([^\n]{1,600})/i.exec(t) || /\btags?\s*[:=]\s*([^\n]{1,600})/i.exec(t);
    const raw = m?.[1] ? String(m[1]).trim() : "";
    if (!raw) return [] as string[];
    const ids = raw
      .split(/[\s,;|]+/g)
      .map((x) => x.trim())
      .filter((x) => /^[a-zA-Z0-9_-]{6,120}$/.test(x))
      .slice(0, 100);
    return ids;
  };

  const manualCallIdFromText = () => {
    const m =
      /\bmanual\s*call\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
      /\bmanualCallId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const postIdFromText = () => {
    const m = /\bpost\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bpostId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const newsletterIdFromText = () => {
    const m =
      /\bnewsletter\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
      /\bnewsletterId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const threadIdFromText = () => {
    const m =
      /\bthread\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
      /\bthreadId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const reportIdFromText = () => {
    const m =
      /\breport\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
      /\breportId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const letterIdFromText = () => {
    const m =
      /\bletter\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
      /\bletterId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const recordingSidFromText = () => {
    const byKey =
      /\brecording\s*sid\s*[:#]?\s*([a-zA-Z0-9]{6,64})\b/i.exec(t) ||
      /\brecordingSid\s*[:=]\s*([a-zA-Z0-9]{6,64})\b/i.exec(t);
    if (byKey?.[1]) return String(byKey[1]).trim();

    const raw = /\b(RE[a-zA-Z0-9]{10,64})\b/.exec(t)?.[1];
    return raw ? String(raw).trim() : "";
  };

  const demoIdFromText = () => {
    const m =
      /\bdemo\s*(?:audio|recording)?\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{1,40})\b/i.exec(t) ||
      /\bid\s*[:=]\s*([a-zA-Z0-9_-]{1,40})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim().slice(0, 40) : "";
  };

  const takeFromText = () => {
    const m = /\btake\s*[:=]?\s*(\d{1,4})\b/i.exec(t);
    const n = m?.[1] ? Number(m[1]) : NaN;
    if (!Number.isFinite(n)) return undefined;
    return Math.max(10, Math.min(500, Math.floor(n)));
  };

  const queryFromText = () => {
    const m = /\bq\s*[:=]\s*([^\n]{2,120})/i.exec(t) || /\bquery\s*[:=]\s*([^\n]{2,120})/i.exec(t);
    const raw = m?.[1] ? String(m[1]).trim() : "";
    return raw.slice(0, 80);
  };

  const startAtIsoFromText = () => {
    const m = /\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)\b/.exec(t) || /\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)\b/.exec(t);
    const raw = m?.[1] ? String(m[1]).trim() : "";
    if (!raw) return "";
    return raw.includes(" ") ? raw.replace(" ", "T") : raw;
  };

  // Booking: list bookings.
  if (/\b(list|show)\b[\s\S]{0,30}\b(bookings?|appointments?)\b/i.test(t)) {
    return [{ key: "booking.bookings.list", title: "List bookings", args: { take: 25 } }];
  }

  // Booking: get calendars config.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(calendars?)\b/i.test(t) && /\bbooking\b/i.test(t)) {
    return [{ key: "booking.calendars.get", title: "Get booking calendars", args: {} }];
  }

  // Booking: get booking settings.
  if (/\b(show|get)\b[\s\S]{0,30}\b(booking)\b[\s\S]{0,30}\b(settings?)\b/i.test(t)) {
    return [{ key: "booking.settings.get", title: "Get booking settings", args: {} }];
  }

  // Booking: get booking form.
  if (/\b(show|get)\b[\s\S]{0,30}\b(booking)\b[\s\S]{0,30}\b(form)\b/i.test(t)) {
    return [{ key: "booking.form.get", title: "Get booking form", args: {} }];
  }

  // Booking: get hosted site settings.
  if (/\b(show|get)\b[\s\S]{0,40}\b(booking)\b[\s\S]{0,40}\b(site|domain|hosted|public)\b/i.test(t)) {
    return [{ key: "booking.site.get", title: "Get booking public site", args: {} }];
  }

  // Booking: get reminder settings.
  if (/\b(show|get)\b[\s\S]{0,40}\b(reminders?|reminder)\b[\s\S]{0,40}\b(settings?)\b/i.test(t) && /\bbooking\b/i.test(t)) {
    return [{ key: "booking.reminders.settings.get", title: "Get booking reminder settings", args: {} }];
  }

  // Booking: suggest available slots.
  if (/\b(available|suggest|find|show)\b[\s\S]{0,40}\b(slots?|availability)\b/i.test(t) && /\b(booking|appointment)\b/i.test(t)) {
    const startAtIso = startAtIsoFromText();
    const durMatch = /\b(\d{2,3})\s*(?:min|mins|minutes)\b/i.exec(t);
    const durationMinutes = durMatch?.[1] ? Math.max(10, Math.min(180, Number(durMatch[1]))) : undefined;
    const daysMatch = /\b(\d{1,2})\s*days\b/i.exec(t);
    const days = daysMatch?.[1] ? Math.max(1, Math.min(30, Number(daysMatch[1]))) : undefined;
    return [{
      key: "booking.suggestions.slots",
      title: "Suggest available booking slots",
      args: {
        ...(startAtIso ? { startAtIso } : {}),
        ...(typeof durationMinutes === "number" && Number.isFinite(durationMinutes) ? { durationMinutes } : {}),
        ...(typeof days === "number" && Number.isFinite(days) ? { days } : {}),
        limit: 25,
      },
    }];
  }

  // People: list team members/invites.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(team|members?|users?|invites?)\b/i.test(t) && /\b(people|team|members?|users?)\b/i.test(t)) {
    return [{ key: "people.users.list", title: "List team members", args: {} }];
  }

  // People: list duplicate contacts.
  if (/\b(duplicates?|dedup|merge)\b/i.test(t) && /\bcontacts?\b/i.test(t)) {
    const summaryOnly = /\bsummary\b/i.test(t);
    return [{ key: "people.contacts.duplicates.get", title: "List duplicate contacts", args: { limitGroups: 100, summaryOnly } }];
  }

  // People: list contact custom variable keys.
  if (/\bcustom\s+variable\s+keys?\b/i.test(t) && /\bcontacts?\b/i.test(t)) {
    return [{ key: "people.contacts.custom_variable_keys.get", title: "List contact custom variable keys", args: {} }];
  }

  const isFunnelBuilderContext = /\b(funnel\s*builder|funnel-builder)\b/i.test(t) || (/\bfunnel\b/i.test(t) && /\b(builder|landing\s*page|landing\s*pages)\b/i.test(t));

  const isAiOutboundCallsContext =
    /\b(ai[\s-]*outbound|outbound\s*calls?|ai\s*outbound\s*calls?)\b/i.test(t) ||
    /\b(ai-outbound-calls)\b/i.test(lower);

  const isBlogsContext = /\bblogs?\b/i.test(t) || (/\bposts?\b/i.test(t) && /\bblog\b/i.test(t));

  const isNewsletterContext = /\bnewsletters?\b/i.test(t) || (/\b(audience|automation)\b/i.test(t) && /\bnewsletter\b/i.test(t));

  const isBillingContext =
    /\bbilling\b/i.test(t) ||
    (/\bstripe\b/i.test(t) && /\b(billing|invoice|invoices|payment|payments|subscription|subscriptions|plan|plans)\b/i.test(t)) ||
    (/\bsubscriptions?\b/i.test(t) && /\b(billing|payment|stripe|invoice|invoices|plan|plans)\b/i.test(t));

  const isCreditContext =
    /\bcredit\s+reports?\b/i.test(t) ||
    (/\bcredit\b/i.test(t) && /\b(report|reports|dispute|disputes|letter|letters|bureau|tradelines?)\b/i.test(t));

  const isInboxContext =
    /\binbox\b/i.test(t) ||
    (/\b(conversation|conversations|thread|threads|messages)\b/i.test(t) && /\b(email|emails|sms|text|texts)\b/i.test(t));

  const isAiReceptionistContext = /\b(ai[\s-]*receptionist|receptionist)\b/i.test(t) || /\b(ai-receptionist)\b/i.test(lower);

  // AI Receptionist: highlights / status summary.
  if (
    isAiReceptionistContext &&
    /\b(anything\s+important|important\s+things?|highlights?|(status|health)\s*(check|summary)?|summary|what'?s\s+new|any\s+(issues?|problems?|errors?)|issues?|problems?|errors?|failing|failed|failure|broken|not\s+working|how'?s[\s\S]{0,20}(doing|performing))\b/i.test(t)
  ) {
    return [{ key: "ai_receptionist.highlights.get", title: "AI receptionist highlights", args: { lookbackHours: 24 * 7, limit: 80 } }];
  }

  // AI Receptionist: get recording playback link.
  if (isAiReceptionistContext && recordingSidFromText() && /\b(recording|audio|listen|play|playback)\b/i.test(t)) {
    return [{ key: "ai_receptionist.recordings.get", title: "Get call recording link", args: { recordingSid: recordingSidFromText() } }];
  }

  // AI Receptionist: get demo audio link.
  if (isAiReceptionistContext && /\bdemo\b/i.test(t) && /\b(audio|tone|wav)\b/i.test(t)) {
    const id = demoIdFromText() || "1";
    return [{ key: "ai_receptionist.demo_audio.get", title: "Get demo audio link", args: { id } }];
  }

  // AI Receptionist: get demo recording link.
  if (isAiReceptionistContext && /\bdemo\b/i.test(t) && /\b(recording|recordings)\b/i.test(t)) {
    const id = demoIdFromText() || "1";
    return [{ key: "ai_receptionist.recordings.demo.get", title: "Get demo recording link", args: { id } }];
  }

  // Inbox: get settings.
  if (isInboxContext && /\b(show|get)\b[\s\S]{0,40}\b(inbox)\b[\s\S]{0,40}\b(settings?|webhooks?|mailbox)\b/i.test(t)) {
    return [{ key: "inbox.settings.get", title: "Get inbox settings", args: {} }];
  }

  // Inbox: list threads.
  if (
    isInboxContext &&
    (/\b(show|get|list)\b[\s\S]{0,40}\b(inbox)\b/i.test(t) || /\b(show|get|list)\b[\s\S]{0,40}\b(threads?|conversations?)\b/i.test(t))
  ) {
    const channel = /\b(sms|text|texts)\b/i.test(t) ? "SMS" : "EMAIL";
    return [{ key: "inbox.threads.list", title: "List inbox threads", args: { channel, take: 50 } }];
  }

  // Inbox: load thread messages.
  if (isInboxContext && threadIdFromText() && /\b(messages?|conversation|thread)\b/i.test(t)) {
    const take = takeFromText();
    return [{ key: "inbox.thread.messages.list", title: "Load conversation messages", args: { threadId: threadIdFromText(), ...(take ? { take } : {}) } }];
  }

  // Funnel Builder: get settings.
  if (isFunnelBuilderContext && /\b(show|get)\b[\s\S]{0,30}\b(settings?)\b/i.test(t)) {
    return [{ key: "funnel_builder.settings.get", title: "Get Funnel Builder settings", args: {} }];
  }

  // Funnel Builder: list domains.
  if (isFunnelBuilderContext && /\b(list|show|get)\b[\s\S]{0,30}\b(domains?)\b/i.test(t)) {
    return [{ key: "funnel_builder.domains.list", title: "List Funnel Builder domains", args: {} }];
  }

  // Funnel Builder: list funnels.
  if (isFunnelBuilderContext && /\b(list|show|get)\b[\s\S]{0,30}\b(funnels?)\b/i.test(t)) {
    return [{ key: "funnel_builder.funnels.list", title: "List funnels", args: {} }];
  }

  // Funnel Builder: list forms.
  if (isFunnelBuilderContext && /\b(list|show|get)\b[\s\S]{0,30}\b(forms?)\b/i.test(t)) {
    return [{ key: "funnel_builder.forms.list", title: "List forms", args: {} }];
  }

  // Funnel Builder: list Stripe products (sales).
  if (isFunnelBuilderContext && /\b(list|show|get)\b[\s\S]{0,30}\b(products?)\b/i.test(t) && /\b(stripe|sales|checkout|price|pricing)\b/i.test(t)) {
    return [{ key: "funnel_builder.sales.products.list", title: "List Stripe products", args: {} }];
  }

  // AI Outbound Calls: list campaigns.
  if (isAiOutboundCallsContext && /\b(list|show|get)\b[\s\S]{0,30}\b(campaigns?)\b/i.test(t)) {
    const lite = /\blite\b/i.test(lower);
    return [{ key: "ai_outbound_calls.campaigns.list", title: "List AI outbound call campaigns", args: { ...(lite ? { lite: true } : {}) } }];
  }

  // AI Outbound Calls: campaign call activity.
  if (isAiOutboundCallsContext && /\b(activity|call\s+activity)\b/i.test(t) && /\bcampaign\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    if (campaignId) {
      return [{ key: "ai_outbound_calls.campaigns.activity.get", title: "Get campaign call activity", args: { campaignId } }];
    }
  }

  // AI Outbound Calls: campaign message activity.
  if (isAiOutboundCallsContext && /\b(messages?|message)\b/i.test(t) && /\bactivity\b/i.test(t) && /\bcampaign\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    if (campaignId) {
      return [{ key: "ai_outbound_calls.campaigns.messages_activity.get", title: "Get campaign message activity", args: { campaignId } }];
    }
  }

  // AI Outbound Calls: manual calls list.
  if (isAiOutboundCallsContext && /\b(list|show|get)\b[\s\S]{0,30}\b(manual\s*calls?)\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    return [{ key: "ai_outbound_calls.manual_calls.list", title: "List manual calls", args: { ...(campaignId ? { campaignId } : {}), reconcileTwilio: false } }];
  }

  // AI Outbound Calls: manual call get.
  if (isAiOutboundCallsContext && /\b(show|get)\b[\s\S]{0,30}\b(manual\s*call)\b/i.test(t)) {
    const id = manualCallIdFromText();
    if (id) {
      return [{ key: "ai_outbound_calls.manual_calls.get", title: "Get manual call", args: { id, reconcileTwilio: false } }];
    }
  }

  // AI Outbound Calls: contact search.
  if (isAiOutboundCallsContext && /\b(search|find|lookup)\b[\s\S]{0,30}\b(contacts?|people)\b/i.test(t)) {
    const q = queryFromText();
    if (q && q.length >= 2) {
      return [{ key: "ai_outbound_calls.contacts.search", title: "Search contacts", args: { q, take: 20 } }];
    }
  }

  // Blogs: get appearance/theme.
  if (isBlogsContext && /\b(show|get)\b[\s\S]{0,30}\b(appearance|theme|branding|style)\b/i.test(t)) {
    return [{ key: "blogs.appearance.get", title: "Get blog appearance", args: {} }];
  }

  // Blogs: get site/workspace.
  if (isBlogsContext && /\b(show|get)\b[\s\S]{0,40}\b(site|workspace|domain|link|slug)\b/i.test(t)) {
    return [{ key: "blogs.site.get", title: "Get blog site", args: {} }];
  }

  // Blogs: get usage.
  if (isBlogsContext && /\b(show|get)\b[\s\S]{0,40}\b(usage|credits|spend)\b/i.test(t)) {
    const range = /\b(all|7d|30d|90d)\b/i.exec(lower)?.[1];
    return [{ key: "blogs.usage.get", title: "Get blog usage", args: { ...(range ? { range } : {}) } }];
  }

  // Blogs: get automation settings.
  if (isBlogsContext && /\b(show|get)\b[\s\S]{0,40}\b(automation|schedule|scheduler)\b/i.test(t) && /\b(settings?)\b/i.test(t)) {
    return [{ key: "blogs.automation.settings.get", title: "Get blog automation settings", args: {} }];
  }

  // Blogs: list posts.
  if (isBlogsContext && /\b(list|show|get)\b[\s\S]{0,30}\b(posts?)\b/i.test(t)) {
    const includeArchived = /\barchived\b/i.test(lower);
    return [{ key: "blogs.posts.list", title: "List blog posts", args: { take: 25, includeArchived } }];
  }

  // Blogs: get a specific post.
  if (isBlogsContext && /\b(show|get)\b[\s\S]{0,30}\b(post)\b/i.test(t)) {
    const postId = postIdFromText();
    if (postId) {
      return [{ key: "blogs.posts.get", title: "Get blog post", args: { postId } }];
    }
  }

  // Blogs: export a post as markdown.
  if (isBlogsContext && /\b(export|download)\b/i.test(t) && /\b(markdown|md)\b/i.test(t)) {
    const postId = postIdFromText();
    if (postId) {
      return [{ key: "blogs.posts.export_markdown", title: "Export blog post markdown", args: { postId } }];
    }
  }

  // Newsletter: get site/workspace.
  if (isNewsletterContext && /\b(show|get)\b[\s\S]{0,40}\b(site|workspace|domain|link|slug)\b/i.test(t)) {
    return [{ key: "newsletter.site.get", title: "Get newsletter site", args: {} }];
  }

  // Newsletter: get usage.
  if (isNewsletterContext && /\b(show|get)\b[\s\S]{0,40}\b(usage|credits|spend)\b/i.test(t)) {
    const range = /\b(all|7d|30d|90d)\b/i.exec(lower)?.[1];
    return [{ key: "newsletter.usage.get", title: "Get newsletter usage", args: { ...(range ? { range } : {}) } }];
  }

  // Newsletter: get automation settings.
  if (isNewsletterContext && /\b(show|get)\b[\s\S]{0,40}\b(automation|schedule|scheduler)\b/i.test(t) && /\b(settings?)\b/i.test(t)) {
    const kind = /\b(internal|external)\b/i.exec(lower)?.[1];
    return [{ key: "newsletter.automation.settings.get", title: "Get newsletter automation settings", args: { ...(kind ? { kind } : {}) } }];
  }

  // Newsletter: list newsletters.
  if (isNewsletterContext && /\b(list|show|get)\b[\s\S]{0,30}\b(newsletters?)\b/i.test(t)) {
    const kind = /\b(internal|external)\b/i.exec(lower)?.[1];
    return [{ key: "newsletter.newsletters.list", title: "List newsletters", args: { ...(kind ? { kind } : {}), take: 25 } }];
  }

  // Newsletter: get a specific newsletter.
  if (isNewsletterContext && /\b(show|get)\b[\s\S]{0,30}\b(newsletter)\b/i.test(t)) {
    const newsletterId = newsletterIdFromText();
    if (newsletterId) {
      return [{ key: "newsletter.newsletters.get", title: "Get newsletter", args: { newsletterId } }];
    }
  }

  // Newsletter: audience contact search.
  if (isNewsletterContext && /\b(search|find|lookup)\b[\s\S]{0,30}\b(contacts?|people)\b/i.test(t)) {
    const q = queryFromText();
    if (q && q.length >= 2) {
      return [{ key: "newsletter.audience.contacts.search", title: "Search newsletter audience contacts", args: { q, take: 20 } }];
    }
  }

  // Billing: get summary/spend.
  if (isBillingContext && /\b(show|get)\b[\s\S]{0,40}\b(summary|billing\s+summary|spend|spent|charges?|this\s+month|monthly|invoices?)\b/i.test(t)) {
    return [{ key: "billing.summary.get", title: "Get billing summary", args: {} }];
  }

  // Billing: list subscriptions/plans.
  if (isBillingContext && /\b(list|show|get)\b[\s\S]{0,40}\b(subscriptions?|plans?)\b/i.test(t)) {
    return [{ key: "billing.subscriptions.list", title: "List billing subscriptions", args: {} }];
  }

  // Billing: get billing info / default payment method.
  if (isBillingContext && /\b(show|get)\b[\s\S]{0,40}\b(billing\s*info|payment\s*method|default\s+payment\s*method|credit\s*card|card\s+on\s+file)\b/i.test(t)) {
    return [{ key: "billing.info.get", title: "Get billing info", args: {} }];
  }

  // Credit: get a specific report.
  if (isCreditContext && reportIdFromText() && /\b(show|get)\b[\s\S]{0,40}\b(report|credit\s+report)\b/i.test(t)) {
    return [{ key: "credit.reports.get", title: "Get credit report", args: { reportId: reportIdFromText() } }];
  }

  // Credit: list reports.
  if (isCreditContext && /\b(list|show|get)\b[\s\S]{0,40}\b(reports?|credit\s+reports?)\b/i.test(t)) {
    return [{ key: "credit.reports.list", title: "List credit reports", args: {} }];
  }

  // Credit: get a specific dispute letter.
  if (isCreditContext && letterIdFromText() && /\b(show|get)\b[\s\S]{0,40}\b(letter|dispute\s+letter|dispute)\b/i.test(t)) {
    return [{ key: "credit.disputes.letter.get", title: "Get dispute letter", args: { letterId: letterIdFromText() } }];
  }

  // Credit: list dispute letters.
  if (isCreditContext && /\b(list|show|get)\b[\s\S]{0,40}\b(disputes?|dispute\s+letters?|letters?)\b/i.test(t)) {
    return [{ key: "credit.disputes.letters.list", title: "List dispute letters", args: {} }];
  }

  // Credit: list pulls.
  if (isCreditContext && /\b(list|show|get)\b[\s\S]{0,40}\b(pulls?|credit\s+pulls?)\b/i.test(t)) {
    return [{ key: "credit.pulls.list", title: "List credit pulls", args: {} }];
  }

  // Credit: list/search contacts.
  if (isCreditContext && /\b(list|show|get|search|find)\b[\s\S]{0,40}\b(contacts?)\b/i.test(t)) {
    const q = queryFromText();
    return [{ key: "credit.contacts.list", title: "List credit contacts", args: { ...(q ? { q } : {}) } }];
  }

  // Reviews: get review request settings.
  if (/\b(show|get)\b[\s\S]{0,30}\b(reviews?|review requests?)\b[\s\S]{0,30}\b(settings?)\b/i.test(t)) {
    return [{ key: "reviews.settings.get", title: "Get review request settings", args: {} }];
  }

  // Reviews: get hosted reviews site config.
  if (/\b(show|get)\b[\s\S]{0,40}\b(reviews?)\b[\s\S]{0,40}\b(site|domain|hosted|public)\b/i.test(t)) {
    return [{ key: "reviews.site.get", title: "Get hosted reviews site", args: {} }];
  }

  // Reviews: list collected reviews.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(reviews?)\b/i.test(t) && /\b(inbox|collected|received)\b/i.test(t)) {
    const includeArchived = /\barchived\b/i.test(t);
    return [{ key: "reviews.inbox.list", title: "List reviews", args: { includeArchived } }];
  }

  // Reviews: list review request events.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(reviews?)\b[\s\S]{0,30}\b(events?)\b/i.test(t)) {
    return [{ key: "reviews.events.list", title: "List review request events", args: { limit: 50 } }];
  }

  // Reviews: get public handle.
  if (/\b(show|get)\b[\s\S]{0,30}\b(reviews?)\b[\s\S]{0,30}\b(handle|link)\b/i.test(t)) {
    return [{ key: "reviews.handle.get", title: "Get reviews page handle", args: {} }];
  }

  // Reviews: list Q&A questions.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(reviews?)\b[\s\S]{0,30}\b(questions?|q&a)\b/i.test(t)) {
    return [{ key: "reviews.questions.list", title: "List review questions", args: {} }];
  }

  // Reviews: list bookings (for sending review requests).
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(reviews?)\b[\s\S]{0,30}\b(bookings?|appointments?)\b/i.test(t)) {
    return [{ key: "reviews.bookings.list", title: "List bookings for review requests", args: {} }];
  }

  // Nurture: list campaigns.
  if (/\b(list|show)\b[\s\S]{0,30}\b(nurture\s+campaigns?|campaigns?)\b/i.test(t) && /\bnurture\b/i.test(t)) {
    return [{ key: "nurture.campaigns.list", title: "List nurture campaigns", args: { take: 50 } }];
  }

  // Nurture: create a campaign.
  if (/\b(create|add|new)\b/i.test(t) && /\b(nurture\s+campaign|campaign)\b/i.test(t) && /\bnurture\b/i.test(t)) {
    const quotedName = /\bcampaign\b\s+"([^"\n]{1,80})"/i.exec(t) || /\bcampaign\b\s+'([^'\n]{1,80})'/i.exec(t);
    const name = quotedName?.[1] ? String(quotedName[1]).trim().slice(0, 80) : "";
    return [{ key: "nurture.campaigns.create", title: "Create nurture campaign", args: name ? { name } : {} }];
  }

  // Nurture: activate/pause/archive campaign (requires campaignId).
  if (/\b(nurture)\b/i.test(t) && /\bcampaign\b/i.test(t) && /\b(activate|pause|archive)\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    if (campaignId) {
      const status = /\bactivate\b/i.test(t) ? "ACTIVE" : /\bpause\b/i.test(t) ? "PAUSED" : "ARCHIVED";
      return [{
        key: "nurture.campaigns.update",
        title: `${status === "ACTIVE" ? "Activate" : status === "PAUSED" ? "Pause" : "Archive"} nurture campaign`,
        args: { campaignId, status },
      }];
    }
  }

  // Nurture: enroll contacts (requires campaignId + tagIds).
  if (/\b(enroll)\b/i.test(t) && /\b(nurture)\b/i.test(t) && /\bcampaign\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    const tagIds = tagIdsFromText();
    if (campaignId && tagIds.length) {
      const dryRun = /\bdry\s*run\b/i.test(t) || /\bpreview\b/i.test(t);
      return [{ key: "nurture.campaigns.enroll", title: "Enroll campaign audience", args: { campaignId, tagIds, ...(dryRun ? { dryRun: true } : {}) } }];
    }
  }

  // Nurture: add a step.
  if (/\b(add|create|new)\b/i.test(t) && /\b(step)\b/i.test(t) && /\b(nurture)\b/i.test(t) && /\bcampaign\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    if (campaignId) {
      const kind = /\bemail\b/i.test(t) ? "EMAIL" : /\btag\b/i.test(t) ? "TAG" : "SMS";
      return [{ key: "nurture.campaigns.steps.add", title: "Add nurture step", args: { campaignId, kind } }];
    }
  }

  // Nurture: update a step (requires stepId and quoted body).
  if (/\b(update|edit)\b/i.test(t) && /\b(step)\b/i.test(t) && /\b(nurture)\b/i.test(t)) {
    const stepId = stepIdFromText();
    if (stepId) {
      const quoted = /"([\s\S]{1,8000})"/.exec(t);
      const body = String((quoted?.[1] || "").trim()).slice(0, 8000);
      const delayMatch = /\bdelay(?:Minutes)?\s*[:=]\s*(\d{1,6})\b/i.exec(t);
      const delayMinutes = delayMatch?.[1] ? Math.max(0, Math.min(525600, Number(delayMatch[1]))) : null;
      if (body) {
        return [{
          key: "nurture.steps.update",
          title: "Update nurture step",
          args: { stepId, body, ...(delayMinutes !== null && Number.isFinite(delayMinutes) ? { delayMinutes } : {}) },
        }];
      }
    }
  }

  // Nurture: delete a step.
  if (/\b(delete|remove)\b/i.test(t) && /\b(step)\b/i.test(t) && /\b(nurture)\b/i.test(t)) {
    const stepId = stepIdFromText();
    if (stepId) return [{ key: "nurture.steps.delete", title: "Delete nurture step", args: { stepId } }];
  }

  // Booking: cancel.
  if (/\b(cancel)\b/i.test(t) && /\b(booking|appointment)\b/i.test(t)) {
    const bookingId = bookingIdFromText();
    if (bookingId) return [{ key: "booking.cancel", title: "Cancel booking", args: { bookingId } }];
  }

  // Booking: reschedule.
  if (/\b(reschedule)\b/i.test(t) && /\b(booking|appointment)\b/i.test(t)) {
    const bookingId = bookingIdFromText();
    const startAtIso = startAtIsoFromText();
    if (bookingId && startAtIso) {
      const forceAvailability = /\b(force)\b[\s\S]{0,20}\bavailability\b/i.test(t);
      return [{
        key: "booking.reschedule",
        title: "Reschedule booking",
        args: { bookingId, startAtIso, ...(forceAvailability ? { forceAvailability: true } : {}) },
      }];
    }
  }

  // Booking: contact.
  if (/\b(contact|message|follow[- ]?up)\b/i.test(t) && /\b(booking|appointment)\b/i.test(t)) {
    const bookingId = bookingIdFromText();
    if (bookingId) {
      const sendEmail = /\b(email)\b/i.test(t);
      const sendSms = /\b(text|sms)\b/i.test(t);
      const quoted = /"([\s\S]{1,2000})"/.exec(t);
      const msg = String((quoted?.[1] || "").trim()).slice(0, 2000);
      if ((sendEmail || sendSms) && msg) {
        return [{
          key: "booking.contact",
          title: "Contact booking",
          args: {
            bookingId,
            message: msg,
            ...(sendEmail ? { sendEmail: true } : {}),
            ...(sendSms ? { sendSms: true } : {}),
          },
        }];
      }
    }
  }

  // People: create a contact when the user provides at least a name.
  if (/\b(create|add|new)\b/i.test(t) && /\bcontact\b/i.test(t)) {
    const emailMatch = /\b([A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{2,80}\.[A-Z]{2,})\b/i.exec(t);
    const email = emailMatch?.[1] ? String(emailMatch[1]).trim().slice(0, 120) : null;

    const phoneMatch = /(\+?\d[\d\s().-]{7,}\d)/.exec(t);
    const phone = phoneMatch ? normalizePhoneLike(phoneMatch[1]) : null;

    const tagsMatch = /\btags?\s*[:=]\s*([^\n]{1,600})/i.exec(t);
    const tags = tagsMatch?.[1] ? String(tagsMatch[1]).trim().slice(0, 600) : null;

    let name = "";
    const explicitName =
      /\bgive\s+(?:it|the\s+contact)\s+the\s+name\s+"?([^"\n]{2,80})"?/i.exec(t) ||
      /\bname(?:d)?\s*[:=]\s*"?([^"\n]{2,80})"?/i.exec(t) ||
      /\bnamed\s+"?([^"\n]{2,80})"?/i.exec(t);
    const quotedName = /\bcontact\b\s+"([^"\n]{2,80})"/i.exec(t) || /\bcontact\b\s+'([^'\n]{2,80})'/i.exec(t);
    if (explicitName?.[1]) {
      name = String(explicitName[1]).trim().slice(0, 80);
    } else if (quotedName?.[1]) {
      name = String(quotedName[1]).trim().slice(0, 80);
    } else {
      const after = /\bcontact\b\s*(?:named|called)?\s*([^\n]{2,120})/i.exec(t);
      if (after?.[1]) {
        const candidate = String(after[1])
          .replace(/\band\s+give\s+it\s+the\s+name\b[\s\S]*$/i, "")
          .replace(/\bname(?:d)?\b[\s\S]*$/i, "")
          .replace(/\b(tags?|email|phone)\b[\s\S]*$/i, "")
          .replace(/\b([A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{2,80}\.[A-Z]{2,})\b/i, "")
          .replace(/(\+?\d[\d\s().-]{7,}\d)/, "")
          .trim();
        name = candidate.slice(0, 80);
      }
    }

    if (name) {
      return [{
        key: "contacts.create",
        title: "Create contact",
        args: {
          name,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(tags ? { tags } : {}),
        },
      }];
    }
  }

  // People: update a contact using a fuzzy contact hint plus partial fields.
  if (/\b(update|edit|change|rename|set)\b/i.test(t) && /\bcontact\b/i.test(t)) {
    const emailMatch = /\b([A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{2,80}\.[A-Z]{2,})\b/i.exec(t);
    const email = emailMatch?.[1] ? String(emailMatch[1]).trim().slice(0, 120) : undefined;
    const phoneMatch = /(\+?\d[\d\s().-]{7,}\d)/.exec(t);
    const phone = phoneMatch ? normalizePhoneLike(phoneMatch[1]) || undefined : undefined;
    const renameMatch = /\brename\b[\s\S]{0,24}\bto\b\s+"?([^"\n]{2,80})"?/i.exec(t) || /\bname\s+(?:to|=|:)\s*"?([^"\n]{2,80})"?/i.exec(t);
    const nextName = renameMatch?.[1] ? String(renameMatch[1]).trim().slice(0, 120) : undefined;
    const targetMatch =
      /\bcontact\s+(?:named|called)\s+"?([^"\n]{2,80})"?/i.exec(t) ||
      /\bcontact\s+([^\n]{2,80})/i.exec(t);
    const targetHint = targetMatch?.[1]
      ? String(targetMatch[1])
          .replace(/\b(update|edit|change|rename|set|name|email|phone|number)\b[\s\S]*$/i, "")
          .trim()
          .slice(0, 120)
      : "";

    if (targetHint && (nextName !== undefined || email !== undefined || phone !== undefined)) {
      return [{
        key: "contacts.update",
        title: "Update contact",
        args: {
          contactId: targetHint,
          ...(nextName !== undefined ? { name: nextName } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(phone !== undefined ? { phone } : {}),
        },
      }];
    }
  }

  // Media Library: move the *current message attachments* into a folder.
  if (attachments.length && /\b(folder|media library|media)\b/i.test(t) && /\b(put|move|add|save|organize|file|files)\b/i.test(t)) {
    const folderMatch = /\b(?:into|to|in)\s+"?([^"\n]{1,120})"?\s+folder\b/i.exec(t) || /\bfolder\s+(?:named|called)?\s*"?([^"\n]{1,120})"?/i.exec(t);
    const folderName = (folderMatch?.[1] || "").trim().slice(0, 120);
    const itemIds = attachments
      .map((a) => (typeof a.id === "string" ? a.id.trim() : ""))
      .filter(Boolean)
      .slice(0, 20);
    if (folderName && itemIds.length) {
      return [{ key: "media.items.move", title: "Move attachments to folder", args: { itemIds, folderName } }];
    }
  }

  // Media Library: import a remote image URL.
  if (/\b(media library|media)\b/i.test(t) && /\b(import|add|save|upload)\b/i.test(t)) {
    const urlMatch = /(https?:\/\/[^\s)\]]{4,500})/i.exec(t);
    const url = urlMatch?.[1] ? String(urlMatch[1]).trim() : "";
    if (url) {
      const folderMatch = /\b(?:into|to|in)\s+"?([^"\n]{1,120})"?\s+folder\b/i.exec(t);
      const folderName = (folderMatch?.[1] || "").trim().slice(0, 120) || null;
      return [{ key: "media.import_remote_image", title: "Import image to Media Library", args: { url, ...(folderName ? { folderName } : {}) } }];
    }
  }

  // Dashboard: reset / optimize.
  if (/\b(dashboard|reporting)\b/i.test(t) && /\b(reset)\b/i.test(t)) {
    return [{ key: "dashboard.reset", title: "Reset dashboard", args: {} }];
  }
  if (/\b(dashboard|reporting)\b/i.test(t) && /\b(optimize|clean|simplify|improve)\b/i.test(t)) {
    const nicheMatch = /\bfor\s+([^\n]{2,120})/i.exec(t);
    const niche = (nicheMatch?.[1] || "").trim().slice(0, 120);
    return [{ key: "dashboard.optimize", title: "Optimize dashboard", args: niche ? { niche } : {} }];
  }

  // List contacts.
  if (/\b(list|show)\b[\s\S]{0,20}\bcontacts\b/i.test(t)) {
    return [{ key: "contacts.list", title: "List contacts", args: { limit: 20 } }];
  }

  // Reviews: send a review request (bookingId/contactId required).
  if (/\b(send|request)\b/i.test(t) && /\breview\b/i.test(t)) {
    const bookingIdMatch = /\bbooking\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bbookingId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    const contactIdMatch = /\bcontact\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bcontactId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    const bookingId = bookingIdMatch?.[1] ? String(bookingIdMatch[1]).trim() : "";
    const contactId = contactIdMatch?.[1] ? String(contactIdMatch[1]).trim() : "";

    if (bookingId) {
      return [{ key: "reviews.send_request_for_booking", title: "Send review request", args: { bookingId } }];
    }
    if (contactId) {
      return [{ key: "reviews.send_request_for_contact", title: "Send review request", args: { contactId } }];
    }
  }

  // Reviews: reply (or clear reply) on a review.
  if (/\breview\b/i.test(t) && /\b(reply|respond)\b/i.test(t)) {
    const reviewIdMatch = /\breview\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\breviewId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    const reviewId = reviewIdMatch?.[1] ? String(reviewIdMatch[1]).trim() : "";
    if (reviewId) {
      const clear = /\b(clear|remove|delete)\b[\s\S]{0,20}\breply\b/i.test(t);
      if (clear) {
        return [{ key: "reviews.reply", title: "Clear review reply", args: { reviewId, reply: null } }];
      }

      const quoted = /"([\s\S]{1,2000})"/.exec(t);
      const replyMatch = /\breply\s*[:\-]\s*([\s\S]{1,2000})$/i.exec(t);
      const reply = String((quoted?.[1] || replyMatch?.[1] || "").trim()).slice(0, 2000);
      if (reply) {
        return [{ key: "reviews.reply", title: "Reply to review", args: { reviewId, reply } }];
      }
    }
  }

  // Build/create a funnel.
  if (/\b(build|create|make)\b[\s\S]{0,30}\bfunnel\b/i.test(t)) {
    const nameMatch = /\b(named|called)\s+"?([^"\n]{2,80})"?/i.exec(t);
    const name = (nameMatch?.[2] || "New funnel").trim().slice(0, 120);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "new-funnel";
    return [{ key: "funnel.create", title: "Create a funnel", args: { name, slug } }];
  }

  // Create a new automation.
  if (/\b(build|create|make)\b[\s\S]{0,30}\bautomation\b/i.test(t)) {
    const nameMatch = /\b(named|called)\s+"?([^"\n]{2,80})"?/i.exec(t);
    const name = (nameMatch?.[2] || "New automation").trim().slice(0, 80);

    const wantsAppointment = /\bappointment\b/i.test(t);
    const wantsNurture = /\b(nurture|campaign)\b/i.test(t);
    const template = wantsAppointment && wantsNurture ? "post_appointment_nurture_enrollment" : undefined;

    return [
      {
        key: "automations.create",
        title: "Create an automation",
        args: {
          name,
          ...(template ? { template } : {}),
          prompt: t,
        },
      },
    ];
  }

  // Create tasks for every employee.
  if (/\b(task|tasks)\b/i.test(t) && /\b(every|all)\b/i.test(lower) && /\b(employee|team|member|everyone)\b/i.test(lower)) {
    const titleMatch = /\b(task|tasks)\b\s*(?:for|about)?\s*:?\s*"?([^"\n]{3,160})"?/i.exec(t);
    const title = (titleMatch?.[1] || "Team task").trim().slice(0, 160);
    return [{ key: "tasks.create_for_all", title: "Create tasks for the whole team", args: { title } }];
  }

  // Send a text/SMS when a phone number is provided.
  if (/\b(send|text)\b/i.test(lower) && /\b(text|sms)\b/i.test(lower)) {
    const phoneMatch = /(\+?\d[\d\s().-]{7,}\d)/.exec(t);
    const to = phoneMatch ? normalizePhoneLike(phoneMatch[1]) : null;
    const quoted = /"([\s\S]{1,900})"/.exec(t);
    const body = (quoted?.[1] || "").trim();

    if (to && body) {
      return [{ key: "inbox.send_sms", title: "Send a text", args: { to, body } }];
    }
  }

  return [];
}

export async function GET(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const { threadId } = await ctx.params;
  const view = (() => {
    try {
      return new URL(req.url).searchParams.get("view") || "";
    } catch {
      return "";
    }
  })();

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, ownerId: true, createdByUserId: true, contextJson: true },
  });
  if (!thread || !canAccessPortalAiChatThread({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const messages = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true,
      role: true,
      text: true,
      attachmentsJson: true,
      createdAt: true,
      sendAt: true,
      sentAt: true,
      createdByUserId: true,
    },
  });

  const ctxJson = thread.contextJson && typeof thread.contextJson === "object" && !Array.isArray(thread.contextJson)
    ? (thread.contextJson as any)
    : {};
  const followUpSuggestionsByAssistantId =
    ctxJson.followUpSuggestionsByAssistantId && typeof ctxJson.followUpSuggestionsByAssistantId === "object" && !Array.isArray(ctxJson.followUpSuggestionsByAssistantId)
      ? (ctxJson.followUpSuggestionsByAssistantId as Record<string, unknown>)
      : {};
  const normalizeFollowUpSuggestions = (raw: unknown) =>
    Array.isArray(raw)
      ? raw
          .map((value) => (typeof value === "string" ? String(value).trim().slice(0, 180) : ""))
          .filter(Boolean)
          .slice(0, 3)
      : [];
  const lastCanvasUrl = typeof ctxJson.lastCanvasUrl === "string" && ctxJson.lastCanvasUrl.trim() ? String(ctxJson.lastCanvasUrl).trim().slice(0, 1200) : null;
  const lastWorkTitle = typeof ctxJson.lastWorkTitle === "string" && ctxJson.lastWorkTitle.trim() ? String(ctxJson.lastWorkTitle).trim().slice(0, 200) : null;
  const liveStatus =
    ctxJson.liveStatus && typeof ctxJson.liveStatus === "object" && !Array.isArray(ctxJson.liveStatus)
      ? {
          phase: typeof ctxJson.liveStatus.phase === "string" ? String(ctxJson.liveStatus.phase).trim().slice(0, 80) : null,
          label: typeof ctxJson.liveStatus.label === "string" ? String(ctxJson.liveStatus.label).trim().slice(0, 200) : null,
          actionKey: typeof ctxJson.liveStatus.actionKey === "string" ? String(ctxJson.liveStatus.actionKey).trim().slice(0, 120) : null,
          title: typeof ctxJson.liveStatus.title === "string" ? String(ctxJson.liveStatus.title).trim().slice(0, 200) : null,
          updatedAt: typeof ctxJson.liveStatus.updatedAt === "string" ? String(ctxJson.liveStatus.updatedAt).trim().slice(0, 80) : null,
          runId: typeof ctxJson.liveStatus.runId === "string" ? String(ctxJson.liveStatus.runId).trim().slice(0, 120) : null,
          canInterrupt: Boolean(ctxJson.liveStatus.canInterrupt),
          round: Number.isFinite(Number(ctxJson.liveStatus.round)) ? Math.max(1, Math.min(99, Math.floor(Number(ctxJson.liveStatus.round)))) : null,
          completedSteps: Number.isFinite(Number(ctxJson.liveStatus.completedSteps)) ? Math.max(0, Math.min(99, Math.floor(Number(ctxJson.liveStatus.completedSteps)))) : null,
          lastCompletedTitle:
            typeof ctxJson.liveStatus.lastCompletedTitle === "string" ? String(ctxJson.liveStatus.lastCompletedTitle).trim().slice(0, 200) : null,
        }
      : null;
  const runs = Array.isArray(ctxJson.runs)
    ? (ctxJson.runs as any[])
        .slice(-20)
        .map((run) => ({
          at: typeof run?.at === "string" ? String(run.at).trim().slice(0, 80) : null,
          workTitle: typeof run?.workTitle === "string" ? String(run.workTitle).trim().slice(0, 200) : null,
          assistantMessageId: typeof run?.assistantMessageId === "string" ? String(run.assistantMessageId).trim().slice(0, 200) : null,
          canvasUrl: typeof run?.canvasUrl === "string" ? String(run.canvasUrl).trim().slice(0, 1200) : null,
          steps: Array.isArray(run?.steps)
            ? run.steps.slice(0, 12).map((step: any) => ({
                key: typeof step?.key === "string" ? String(step.key).trim().slice(0, 120) : "",
                title: typeof step?.title === "string" ? String(step.title).trim().slice(0, 200) : "",
                ok: Boolean(step?.ok),
                linkUrl: typeof step?.linkUrl === "string" ? String(step.linkUrl).trim().slice(0, 1200) : null,
              }))
            : [],
        }))
    : [];

  const unresolvedRun = normalizeUnresolvedRun(ctxJson.unresolvedRun);
  const nextStepContext = normalizeNextStepContext(ctxJson.nextStepContext);
  const threadSummary = typeof ctxJson.threadSummary === "string" && ctxJson.threadSummary.trim() ? String(ctxJson.threadSummary).trim().slice(0, 1200) : null;
  const threadSummaryUpdatedAt =
    typeof ctxJson.threadSummaryUpdatedAt === "string" && ctxJson.threadSummaryUpdatedAt.trim()
      ? String(ctxJson.threadSummaryUpdatedAt).trim().slice(0, 80)
      : null;
  const chatMode = normalizeThreadChatMode(ctxJson.chatMode);
  const responseProfile = normalizePuraAiProfile(ctxJson.responseProfile);

  const threadContext = { lastCanvasUrl, lastWorkTitle, liveStatus, runs, unresolvedRun, nextStepContext, threadSummary, threadSummaryUpdatedAt, chatMode, responseProfile };

  if (view === "status") {
    return NextResponse.json({ ok: true, threadContext });
  }

  return NextResponse.json({
    ok: true,
    messages: messages.map((message: any) => ({
      ...message,
      followUpSuggestions: normalizeFollowUpSuggestions(followUpSuggestionsByAssistantId[String(message?.id || "")]),
    })),
    threadContext,
  });
}

async function handlePostMessage(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const createdByUserId = auth.session.user.memberId || ownerId;
  const memberId = createdByUserId;
  const { threadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = SendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, title: true, contextJson: true, ownerId: true, createdByUserId: true },
  });
  if (!thread || !canAccessPortalAiChatThread({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  let persistedThreadContext = (thread as any).contextJson ?? null;

  const ownerTimeZone =
    (await prisma.user.findUnique({ where: { id: ownerId }, select: { timeZone: true } }).catch(() => null))?.timeZone ||
    null;

  const memberTimeZone =
    (await prisma.user.findUnique({ where: { id: createdByUserId }, select: { timeZone: true } }).catch(() => null))?.timeZone ||
    null;

  const headerClientTimeZone = String(req.headers.get("x-client-timezone") || "").trim().slice(0, 80);
  const bodyClientTimeZone =
    typeof (parsed.data as any)?.clientTimeZone === "string" ? String((parsed.data as any).clientTimeZone).trim().slice(0, 80) : "";
  const clientTimeZone = (bodyClientTimeZone || headerClientTimeZone || "").trim().slice(0, 80);
  const requestedChatModeRaw = typeof (parsed.data as any)?.chatMode === "string" ? String((parsed.data as any).chatMode).trim() : "";
  const requestedChatMode = requestedChatModeRaw ? normalizeThreadChatMode(requestedChatModeRaw) : null;
  const requestedResponseProfileRaw = typeof (parsed.data as any)?.responseProfile === "string" ? String((parsed.data as any).responseProfile).trim() : "";
  const requestedResponseProfile = requestedResponseProfileRaw ? normalizePuraAiProfile(requestedResponseProfileRaw) : null;

  const getTimeZoneHint = (threadContext?: any): string | null => {
    const ctxTz =
      threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) && typeof threadContext.ownerTimeZone === "string"
        ? String(threadContext.ownerTimeZone).trim().slice(0, 80)
        : "";
    const tz = (
      clientTimeZone ||
      String(memberTimeZone || "").trim().slice(0, 80) ||
      String(ownerTimeZone || "").trim().slice(0, 80) ||
      ctxTz ||
      ""
    )
      .trim()
      .slice(0, 80);
    return tz || null;
  };

  type LiveStatusPhase = "bootstrap" | "planning" | "resolving" | "executing" | "clarifying" | "confirming" | "summarizing";
  type LiveStatusShape = {
    phase: LiveStatusPhase;
    label?: string | null;
    actionKey?: string | null;
    title?: string | null;
    updatedAt?: string | null;
    runId?: string | null;
    canInterrupt?: boolean | null;
    round?: number | null;
    completedSteps?: number | null;
    lastCompletedTitle?: string | null;
  };

  const normalizeLiveStatus = (
    status: LiveStatusShape | null | undefined,
  ) => {
    if (!status) return null;
    return {
      phase: String(status.phase || "planning").trim().slice(0, 80),
      label: typeof status.label === "string" && status.label.trim() ? String(status.label).trim().slice(0, 200) : null,
      actionKey: typeof status.actionKey === "string" && status.actionKey.trim() ? String(status.actionKey).trim().slice(0, 120) : null,
      title: typeof status.title === "string" && status.title.trim() ? String(status.title).trim().slice(0, 200) : null,
      updatedAt:
        typeof status.updatedAt === "string" && status.updatedAt.trim()
          ? String(status.updatedAt).trim().slice(0, 80)
          : now.toISOString(),
      runId: typeof status.runId === "string" && status.runId.trim() ? String(status.runId).trim().slice(0, 120) : null,
      canInterrupt: Boolean(status.canInterrupt),
      round: Number.isFinite(Number(status.round)) ? Math.max(1, Math.min(99, Math.floor(Number(status.round)))) : null,
      completedSteps: Number.isFinite(Number(status.completedSteps)) ? Math.max(0, Math.min(99, Math.floor(Number(status.completedSteps)))) : null,
      lastCompletedTitle:
        typeof status.lastCompletedTitle === "string" && status.lastCompletedTitle.trim()
          ? String(status.lastCompletedTitle).trim().slice(0, 200)
          : null,
    };
  };

  const withLiveStatus = (
    threadContextValue: unknown,
    status: LiveStatusShape | null,
  ) => {
    const prevCtx = threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue) ? (threadContextValue as any) : {};
    return {
      ...prevCtx,
      liveStatus: normalizeLiveStatus(status),
    };
  };

  const persistThreadContext = async (threadContextValue: unknown, opts?: { touchLastMessageAt?: boolean }) => {
    const nextCtx = threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue) ? (threadContextValue as any) : {};
    await (prisma as any).portalAiChatThread.update({
      where: { id: threadId },
      data: opts?.touchLastMessageAt ? { lastMessageAt: now, contextJson: nextCtx } : { contextJson: nextCtx },
    });
    persistedThreadContext = nextCtx;
    return nextCtx;
  };

  const initialThreadContext = persistedThreadContext && typeof persistedThreadContext === "object" && !Array.isArray(persistedThreadContext)
    ? (persistedThreadContext as any)
    : {};
  const storedChatMode = normalizeThreadChatMode(initialThreadContext.chatMode);
  const threadChatMode = requestedChatMode || storedChatMode;
  const storedResponseProfile = normalizePuraAiProfile(initialThreadContext.responseProfile);
  const threadResponseProfile = requestedResponseProfile || storedResponseProfile;
  const aiConfigErrorMessage = !isPuraAiConfigured(threadResponseProfile)
    ? threadResponseProfile === "fast"
      ? "Pura AI is not configured for fast responses in this environment."
      : `Pura AI is not configured for ${threadResponseProfile} responses in this environment.`
    : !isPortalSupportChatConfigured()
      ? "Pura AI support chat is not configured in this environment."
      : null;
  if (storedChatMode !== threadChatMode || storedResponseProfile !== threadResponseProfile) {
    persistedThreadContext = await persistThreadContext({ ...initialThreadContext, chatMode: threadChatMode, responseProfile: threadResponseProfile });
  }

  const persistLiveStatus = async (
    status: LiveStatusShape | null,
    threadContextValue?: unknown,
  ) => {
    return await persistThreadContext(withLiveStatus(threadContextValue ?? persistedThreadContext, status ? withCurrentRunStatus(status) : null));
  };

  let activeRunId: string | null = null;
  let activeRunStartedAt: string | null = null;

  const persistActiveChatRun = async (opts: {
    status: PortalAiChatRunStatus;
    runId?: string | null;
    startedAt?: string | null;
    runTrace?: PortalAiChatRunTraceInput | null;
    summaryText?: string | null;
    followUpSuggestions?: unknown;
    completedAt?: Date | null;
    interruptedAt?: Date | null;
  }) => {
    const runId = typeof opts.runId === "string" && opts.runId.trim() ? String(opts.runId).trim().slice(0, 120) : activeRunId;
    const startedAt = typeof opts.startedAt === "string" && opts.startedAt.trim() ? String(opts.startedAt).trim() : activeRunStartedAt;
    if (!runId) return;
    const runTrace = opts.runTrace && typeof opts.runTrace === "object" && !Array.isArray(opts.runTrace) ? opts.runTrace : {};
    await persistPortalAiChatRun({
      ownerId,
      threadId,
      runTrace: {
        ...runTrace,
        at: typeof runTrace.at === "string" && runTrace.at.trim() ? String(runTrace.at).trim() : startedAt,
      },
      triggerKind: "chat",
      status: opts.status,
      runId,
      upsertByRunId: true,
      summaryText: opts.summaryText ?? null,
      followUpSuggestions: opts.followUpSuggestions,
      completedAt: opts.completedAt ?? null,
      interruptedAt: opts.interruptedAt ?? null,
    });
    await ensurePortalAiChatRunAiSummary({
      ownerId,
      threadId,
      runId,
      assistantMessageId:
        typeof runTrace.assistantMessageId === "string" && runTrace.assistantMessageId.trim()
          ? String(runTrace.assistantMessageId).trim().slice(0, 200)
          : null,
      triggerKind: "chat",
    });
  };

  const loadRecentRunContinuity = async () => {
    const rows = await (prisma as any).portalAiChatRun.findMany({
      where: { ownerId, threadId },
      orderBy: [{ createdAt: "desc" }],
      take: 6,
      select: {
        runId: true,
        status: true,
        workTitle: true,
        summaryText: true,
        stepsJson: true,
        followUpSuggestionsJson: true,
        createdAt: true,
        completedAt: true,
        interruptedAt: true,
      },
    }).catch(() => []);

    const items = Array.isArray(rows)
      ? rows
          .map((row) => {
            const status = typeof (row as any)?.status === "string" ? String((row as any).status).trim().slice(0, 40) : "";
            if (!status || status === "running") return null;
            const workTitle = typeof (row as any)?.workTitle === "string" ? String((row as any).workTitle).trim().slice(0, 200) : null;
            const summaryText = typeof (row as any)?.summaryText === "string" ? String((row as any).summaryText).trim().slice(0, 280) : null;
            const steps = Array.isArray((row as any)?.stepsJson)
              ? ((row as any).stepsJson as unknown[])
                  .map((step) => {
                    if (!step || typeof step !== "object" || Array.isArray(step)) return null;
                    const key = typeof (step as any).key === "string" ? String((step as any).key).trim().slice(0, 120) : "";
                    const title = typeof (step as any).title === "string" ? String((step as any).title).trim().slice(0, 160) : "";
                    if (!key && !title) return null;
                    return { key: key || title, title: title || key, ok: Boolean((step as any).ok) };
                  })
                  .filter(Boolean)
                  .slice(0, 4)
              : [];
            const followUpSuggestions = Array.isArray((row as any)?.followUpSuggestionsJson)
              ? ((row as any).followUpSuggestionsJson as unknown[])
                  .map((value) => (typeof value === "string" ? String(value).trim().slice(0, 180) : ""))
                  .filter(Boolean)
                  .slice(0, 3)
              : [];
            const happenedAt = (row as any)?.interruptedAt || (row as any)?.completedAt || (row as any)?.createdAt || null;
            return {
              runId: typeof (row as any)?.runId === "string" ? String((row as any).runId).trim().slice(0, 120) : null,
              status,
              workTitle,
              summaryText,
              steps,
              followUpSuggestions,
              happenedAt: happenedAt ? new Date(happenedAt).toISOString() : null,
            };
          })
          .filter(Boolean)
          .slice(0, 4)
      : [];

    return items.length ? items : null;
  };

  const beginInterruptibleRun = async (threadContextValue?: unknown) => {
    activeRunId = randomUUID();
    activeRunStartedAt = new Date().toISOString();
    const prevCtx = threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue) ? (threadContextValue as any) : {};
    const nextCtx = await persistThreadContext({
      ...prevCtx,
      currentRunId: activeRunId,
      interruptRequestedRunId: null,
      liveStatus: null,
    });
    await persistActiveChatRun({
      status: "running",
      runId: activeRunId,
      startedAt: activeRunStartedAt,
      runTrace: { at: activeRunStartedAt },
    });
    return nextCtx;
  };

  const completeInterruptibleRun = (threadContextValue: unknown) => {
    const prevCtx = threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue) ? (threadContextValue as any) : {};
    activeRunId = null;
    activeRunStartedAt = null;
    return {
      ...prevCtx,
      currentRunId: null,
      interruptRequestedRunId: null,
      liveStatus: null,
    };
  };

  const checkInterruptRequested = async (): Promise<boolean> => {
    if (!activeRunId) return false;
    const fresh = await (prisma as any).portalAiChatThread.findFirst({
      where: { id: threadId, ownerId },
      select: { contextJson: true },
    }).catch(() => null);
    const freshCtx = fresh?.contextJson && typeof fresh.contextJson === "object" && !Array.isArray(fresh.contextJson) ? (fresh.contextJson as any) : {};
    const interruptRunId = typeof freshCtx.interruptRequestedRunId === "string" ? String(freshCtx.interruptRequestedRunId).trim() : "";
    return Boolean(interruptRunId && interruptRunId === activeRunId);
  };

  const buildStoppedAssistantMessage = async (userMessage: any | null) => {
    const assistantText = "Stopped that run. I paused before taking the next step, so nothing else will be changed until you tell me what to do next.";
    const interruptedAt = new Date();
    const interruptedRunId = activeRunId;
    const interruptedRunStartedAt = activeRunStartedAt;
    const prevCtx = persistedThreadContext && typeof persistedThreadContext === "object" && !Array.isArray(persistedThreadContext) ? (persistedThreadContext as any) : {};
    const liveStatus = prevCtx.liveStatus && typeof prevCtx.liveStatus === "object" && !Array.isArray(prevCtx.liveStatus) ? (prevCtx.liveStatus as any) : null;
    const assistantMsg = await (prisma as any).portalAiChatMessage.create({
      data: { ownerId, threadId, role: "assistant", text: assistantText, attachmentsJson: null, createdByUserId: null, sendAt: null, sentAt: new Date() },
      select: { id: true, role: true, text: true, attachmentsJson: true, createdAt: true, sendAt: true, sentAt: true },
    });
    const clearedCtx = completeInterruptibleRun(
      withUnresolvedRun(clearNextStepContext(prevCtx), {
        status: "interrupted",
        runId: interruptedRunId,
        updatedAt: interruptedAt.toISOString(),
        workTitle:
          typeof liveStatus?.title === "string" && liveStatus.title.trim()
            ? String(liveStatus.title).trim().slice(0, 200)
            : typeof liveStatus?.label === "string" && liveStatus.label.trim()
              ? String(liveStatus.label).trim().slice(0, 200)
              : null,
        summaryText: assistantText,
        lastCompletedTitle:
          typeof liveStatus?.lastCompletedTitle === "string" && liveStatus.lastCompletedTitle.trim()
            ? String(liveStatus.lastCompletedTitle).trim().slice(0, 200)
            : null,
        canvasUrl: typeof prevCtx.lastCanvasUrl === "string" && prevCtx.lastCanvasUrl.trim() ? String(prevCtx.lastCanvasUrl).trim().slice(0, 1200) : null,
      }),
    );
    await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date(), contextJson: clearedCtx } });
    await persistActiveChatRun({
      status: "interrupted",
      runId: interruptedRunId,
      startedAt: interruptedRunStartedAt,
      runTrace: {
        at: typeof liveStatus?.updatedAt === "string" && liveStatus.updatedAt.trim() ? String(liveStatus.updatedAt).trim() : interruptedAt.toISOString(),
        workTitle:
          typeof liveStatus?.title === "string" && liveStatus.title.trim()
            ? String(liveStatus.title).trim().slice(0, 200)
            : typeof liveStatus?.label === "string" && liveStatus.label.trim()
              ? String(liveStatus.label).trim().slice(0, 200)
              : null,
        assistantMessageId: assistantMsg?.id ?? null,
        canvasUrl: typeof prevCtx.lastCanvasUrl === "string" && prevCtx.lastCanvasUrl.trim() ? String(prevCtx.lastCanvasUrl).trim().slice(0, 1200) : null,
      },
      summaryText: assistantText,
      interruptedAt,
    });
    persistedThreadContext = clearedCtx;
    return NextResponse.json({ ok: true, userMessage, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null, assistantChoices: null, clientUiActions: [], interrupted: true });
  };

  const buildProactiveFollowUpSuggestions = (opts: { actionKeys?: string[]; canvasUrl?: string | null; promptText?: string | null; completedCount?: number; failedCount?: number; pendingCount?: number }) => {
    const completedCount = Number(opts.completedCount || 0);
    const failedCount = Number(opts.failedCount || 0);
    const pendingCount = Number(opts.pendingCount || 0);
    if (completedCount <= 0 || failedCount > 0 || pendingCount > 0) return [] as string[];
    const actionKeys = Array.isArray(opts.actionKeys) ? opts.actionKeys : [];
    const primaryAction = typeof actionKeys[0] === "string" ? String(actionKeys[0]).trim().toLowerCase() : "";

    const haystack = [
      ...actionKeys,
      String(opts.canvasUrl || ""),
      String(opts.promptText || ""),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();

    const suggestions: string[] = [];
    const push = (value: string) => {
      const trimmed = String(value || "").trim().slice(0, 180);
      if (!trimmed) return;
      if (suggestions.includes(trimmed)) return;
      suggestions.push(trimmed);
    };

    if (/hosted_pages\.documents|hosted page|page-editor|\/page-editor/.test(haystack)) {
      if (primaryAction === "hosted_pages.documents.list") {
        push("Inspect the hosted page you want to edit next and I’ll break down its runtime tokens and live data.");
        push("Pick one hosted page and I’ll generate a higher-converting draft without publishing it.");
        push("Tell me which hosted page you want to update next and what you want changed.");
      } else if (primaryAction === "hosted_pages.documents.preview_data") {
        push("Generate a stronger hosted-page draft for this page without publishing it.");
        push("Update this hosted page’s title, slug, or editor mode next.");
        push("Compare this hosted page against the seeded default and tell me what should change.");
      } else if (primaryAction === "hosted_pages.documents.update" || primaryAction === "hosted_pages.documents.generate_html") {
        push("Publish this hosted page if the current draft looks right.");
        push("Reset this hosted page back to its seeded default if you want to undo these changes.");
        push("Inspect this hosted page again and verify its runtime tokens and live data.");
      } else if (primaryAction === "hosted_pages.documents.publish") {
        push("Inspect this hosted page again and verify the published version’s live data.");
        push("Generate another hosted-page variant if you want to improve the published draft.");
        push("Reset this hosted page to its seeded default if you want to roll back.");
      } else if (primaryAction === "hosted_pages.documents.reset_to_default") {
        push("Generate a fresh hosted-page draft from the default seed.");
        push("Inspect this hosted page again and I’ll walk through the editable areas.");
        push("Update this hosted page’s title, slug, or layout direction next.");
      }
    } else if (/booking|calendar|appointment|availability|meeting/.test(haystack)) {
      push("Audit the booking flow for the next bottleneck.");
      push("Summarize what changed in booking and what still needs attention.");
    } else if (/funnel|landing|checkout|upsell|downsell|page builder|website/.test(haystack)) {
      push("Review this funnel for the next highest-impact improvement.");
      push("Summarize what changed on the page and what you would optimize next.");
    } else if (/contact|lead|client|customer|prospect/.test(haystack)) {
      push("Find the next best contact follow-up after this change.");
      push("Summarize what changed for this contact and suggest the next move.");
    } else if (/inbox|email|sms|conversation|thread/.test(haystack)) {
      push("Draft the next follow-up message you would send here.");
      push("Show me the next inbox action worth taking after this.");
    } else if (/task|todo|checklist|follow-up/.test(haystack)) {
      push("Turn the remaining open work into the next 3 priorities.");
      push("Find the next task that blocks progress after this.");
    } else if (/reporting|sales|revenue|stripe|dashboard|analytics/.test(haystack)) {
      push("Explain the next highest-impact fix suggested by the reporting data.");
      push("Turn this result into a concrete action plan for this week.");
    } else if (/media|asset|image|video|folder|library/.test(haystack)) {
      push("Find the next best way to reuse or organize this media.");
      push("Suggest the next cleanup or publishing step for this media work.");
    }

    if (!suggestions.length) {
      push("Summarize what changed and tell me the next best step.");
      push("What should Pura do next here?");
    }
    return suggestions.slice(0, 3);
  };

  const withPersistedFollowUpSuggestions = (threadContextValue: unknown, assistantMessageId: string | null | undefined, suggestionsRaw: unknown) => {
    const suggestions = Array.isArray(suggestionsRaw)
      ? suggestionsRaw
          .map((value) => (typeof value === "string" ? String(value).trim().slice(0, 180) : ""))
          .filter(Boolean)
          .slice(0, 3)
      : [];
    if (!assistantMessageId || !suggestions.length) return threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue) ? (threadContextValue as any) : {};
    const prevCtx = threadContextValue && typeof threadContextValue === "object" && !Array.isArray(threadContextValue) ? (threadContextValue as any) : {};
    const prevMap =
      prevCtx.followUpSuggestionsByAssistantId && typeof prevCtx.followUpSuggestionsByAssistantId === "object" && !Array.isArray(prevCtx.followUpSuggestionsByAssistantId)
        ? (prevCtx.followUpSuggestionsByAssistantId as Record<string, unknown>)
        : {};
    return {
      ...prevCtx,
      followUpSuggestionsByAssistantId: {
        ...prevMap,
        [String(assistantMessageId).trim().slice(0, 200)]: suggestions,
      },
    };
  };

  const withCurrentRunStatus = (status: LiveStatusShape): LiveStatusShape => ({
    ...status,
    runId: activeRunId,
    canInterrupt: Boolean(activeRunId),
  });

  const patchArgsForScheduledCreate = (args: Record<string, unknown>, threadContext?: any): Record<string, unknown> => {
    const tzHint = getTimeZoneHint(threadContext);
    if (!tzHint) return args;

    const next: Record<string, unknown> = { ...args };
    if (!String((next as any).clientTimeZone || "").trim()) (next as any).clientTimeZone = tzHint;

    const sendAtLocal = (next as any).sendAtLocal;
    if (sendAtLocal && typeof sendAtLocal === "object" && !Array.isArray(sendAtLocal)) {
      const tzExisting = typeof (sendAtLocal as any).timeZone === "string" ? String((sendAtLocal as any).timeZone).trim() : "";
      if (!tzExisting) (next as any).sendAtLocal = { ...(sendAtLocal as any), timeZone: tzHint };
    }
    return next;
  };

  const patchArgsForScheduledReschedule = (args: Record<string, unknown>, threadContext?: any): Record<string, unknown> => {
    const tzHint = getTimeZoneHint(threadContext);
    if (!tzHint) return args;

    const next: Record<string, unknown> = { ...args };
    if (!String((next as any).clientTimeZone || "").trim()) (next as any).clientTimeZone = tzHint;
    return next;
  };

  const editMessageIdRaw = typeof (parsed.data as any).editMessageId === "string" ? String((parsed.data as any).editMessageId).trim().slice(0, 200) : "";
  const editMessageId = editMessageIdRaw || "";
  const isEdit = Boolean(editMessageId);

  const redoLastAssistant = Boolean((parsed.data as any).redoLastAssistant);
  const redoMessageIdRaw = typeof (parsed.data as any).redoMessageId === "string" ? String((parsed.data as any).redoMessageId).trim().slice(0, 200) : "";
  const redoMessageId = redoMessageIdRaw || "";
  const isRedo = redoLastAssistant || Boolean(redoMessageId);
  let redoLatestUserText: string | null = null;
  let redoLatestUserMessageId: string | null = null;
  let priorAssistantTextToAvoid: string | null = null;
  let skipUserInsert = false;

  if (isEdit && isRedo) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  if (isRedo) {
    const recent = await (prisma as any).portalAiChatMessage.findMany({
      where: { ownerId, threadId },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: { id: true, role: true, text: true, createdAt: true },
    });

    const ordered = Array.isArray(recent) ? [...recent].reverse() : [];
    const findLatestUser = (): any => {
      for (let i = ordered.length - 1; i >= 0; i--) {
        if (String(ordered[i]?.role) !== "user") continue;
        const t = String(ordered[i]?.text || "").trim();
        if (!t) continue;
        return ordered[i];
      }
      return null;
    };

    if (!ordered.length) {
      return NextResponse.json({ ok: false, error: "No messages found to redo." }, { status: 400 });
    }

    if (!redoMessageId) {
      // Legacy behavior: redo the most recent assistant response after the latest user message.
      const lastUser = findLatestUser();
      const lastUserText = String(lastUser?.text || "").trim();
      if (!lastUserText) {
        return NextResponse.json({ ok: false, error: "No user message found to redo." }, { status: 400 });
      }

      const lastUserCreatedAt = lastUser?.createdAt ? new Date(lastUser.createdAt) : null;
      if (!lastUserCreatedAt || !Number.isFinite(lastUserCreatedAt.getTime())) {
        return NextResponse.json({ ok: false, error: "No user message found to redo." }, { status: 400 });
      }

      const assistantAfterLastUser = ordered.filter(
        (m) => String(m?.role) === "assistant" && m?.createdAt && new Date(m.createdAt) > lastUserCreatedAt,
      );
      if (!assistantAfterLastUser.length) {
        return NextResponse.json({ ok: false, error: "No assistant message to redo." }, { status: 400 });
      }

      const lastAssistantToAvoid = assistantAfterLastUser
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-1)[0];
      priorAssistantTextToAvoid = String(lastAssistantToAvoid?.text || "").trim().slice(0, 4000) || null;

      const assistantIdsToDelete = assistantAfterLastUser.map((m) => String(m.id)).filter(Boolean);
      if (assistantIdsToDelete.length) {
        await (prisma as any).portalAiChatMessage.deleteMany({ where: { ownerId, threadId, id: { in: assistantIdsToDelete } } });
      }

      // Re-run using the latest user prompt, but do not insert a duplicate user message.
      redoLatestUserText = lastUserText.slice(0, 4000);
      redoLatestUserMessageId = String(lastUser?.id || "").trim() || null;
      skipUserInsert = true;
    } else {
      // New behavior: redo a specific assistant message in the thread.
      const idx = ordered.findIndex((m) => String(m?.id) === String(redoMessageId));
      if (idx < 0) {
        return NextResponse.json({ ok: false, error: "Message not found to redo." }, { status: 404 });
      }

      const target = ordered[idx];
      if (String(target?.role) !== "assistant") {
        return NextResponse.json({ ok: false, error: "Can only redo assistant messages." }, { status: 400 });
      }

      // Find the user message that this assistant response was replying to.
      let userBefore: any = null;
      for (let i = idx - 1; i >= 0; i--) {
        if (String(ordered[i]?.role) !== "user") continue;
        const t = String(ordered[i]?.text || "").trim();
        if (!t) continue;
        userBefore = ordered[i];
        break;
      }

      const userBeforeText = String(userBefore?.text || "").trim();
      if (!userBeforeText) {
        return NextResponse.json({ ok: false, error: "No user message found before that assistant message." }, { status: 400 });
      }

      priorAssistantTextToAvoid = String(target?.text || "").trim().slice(0, 4000) || null;

      // Truncate history from the target assistant onward (so the re-generated response becomes the new fork).
      const idsToDelete = ordered.slice(idx).map((m) => String(m?.id)).filter(Boolean);
      if (idsToDelete.length) {
        await (prisma as any).portalAiChatMessage.deleteMany({ where: { ownerId, threadId, id: { in: idsToDelete } } });
      }

      redoLatestUserText = userBeforeText.slice(0, 4000);
      redoLatestUserMessageId = String(userBefore?.id || "").trim() || null;
      skipUserInsert = true;
    }

    // Force a true re-evaluation: clear any stale pending state (and summary) that could cause
    // replaying a previously proposed plan or using a summary that includes truncated messages.
    try {
      const prevCtx =
        persistedThreadContext && typeof persistedThreadContext === "object" && !Array.isArray(persistedThreadContext)
          ? (persistedThreadContext as any)
          : {};
      const nextCtx = {
        ...prevCtx,
        pendingConfirm: null,
        pendingPlan: null,
        pendingPlanClarify: null,
        pendingAction: null,
        pendingActionClarify: null,
        pendingScheduleResume: null,
        threadSummary: null,
        liveStatus: null,
      };
      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
      persistedThreadContext = nextCtx;
    } catch {
      // best-effort only
    }
  }

  const confirmToken = typeof (parsed.data as any).confirmToken === "string" ? String((parsed.data as any).confirmToken).trim().slice(0, 200) : "";
  const choice = (parsed.data as any).choice ?? null;
  const widgetSuggestion = (parsed.data as any).widgetSuggestion
    ? {
        key: String((parsed.data as any).widgetSuggestion.key || "").trim().slice(0, 500),
        serviceSlug: String((parsed.data as any).widgetSuggestion.serviceSlug || "").trim().slice(0, 120),
        title: String((parsed.data as any).widgetSuggestion.title || "").trim().slice(0, 240),
        actionIds: Array.isArray((parsed.data as any).widgetSuggestion.actionIds)
          ? ((parsed.data as any).widgetSuggestion.actionIds as string[])
              .map((id) => String(id || "").trim().slice(0, 200))
              .filter(Boolean)
              .slice(0, 50)
          : [],
        detailLines: Array.isArray((parsed.data as any).widgetSuggestion.detailLines)
          ? ((parsed.data as any).widgetSuggestion.detailLines as string[])
              .map((line) => String(line || "").trim().slice(0, 500))
              .filter(Boolean)
              .slice(0, 20)
          : [],
      }
    : null;
  const cleanText = (redoLatestUserText ?? parsed.data.text ?? "").trim();
  const choiceLabel =
    choice && typeof choice === "object" && typeof (choice as any).label === "string" && String((choice as any).label || "").trim()
      ? String((choice as any).label).trim().slice(0, 160)
      : choice && typeof choice === "object" && String((choice as any).type || "") === "booking_calendar" && String((choice as any).calendarId || "").trim()
        ? `Use calendar ${String((choice as any).calendarId).trim().slice(0, 24)}`
        : choice && typeof choice === "object" && String((choice as any).type || "") === "entity" && String((choice as any).kind || "").trim()
          ? `Use selected ${String((choice as any).kind).trim().slice(0, 32)}`
        : "";
  const effectiveText = cleanText || choiceLabel;
  const attachments = Array.isArray(parsed.data.attachments) ? parsed.data.attachments : [];
  const isConfirmOnly = Boolean(confirmToken) && !cleanText && !choice && !attachments.length;
  const isSuggestionOnly = Boolean(widgetSuggestion) && !confirmToken && !cleanText && !choice && !attachments.length;

  if (isEdit) {
    if (!cleanText) {
      return NextResponse.json({ ok: false, error: "Text required" }, { status: 400 });
    }
    if (confirmToken || isRedo || choice || widgetSuggestion || attachments.length) {
      return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    }
  }

  if (widgetSuggestion?.key && widgetSuggestion.title && widgetSuggestion.actionIds.length) {
    const prevCtx =
      persistedThreadContext && typeof persistedThreadContext === "object" && !Array.isArray(persistedThreadContext)
        ? (persistedThreadContext as any)
        : {};
    const existingWidgetSuggestion =
      prevCtx.widgetSuggestion && typeof prevCtx.widgetSuggestion === "object" && !Array.isArray(prevCtx.widgetSuggestion)
        ? (prevCtx.widgetSuggestion as any)
        : null;
    const suggestionChanged = String(existingWidgetSuggestion?.key || "") !== widgetSuggestion.key;
    const nextCtx = {
      ...prevCtx,
      widgetSuggestion: {
        key: widgetSuggestion.key,
        serviceSlug: widgetSuggestion.serviceSlug,
        title: widgetSuggestion.title,
        actionIds: widgetSuggestion.actionIds,
        detailLines: widgetSuggestion.detailLines,
        lastSeenAt: now.toISOString(),
      },
    };

    if (suggestionChanged) {
      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
    }
    persistedThreadContext = nextCtx;

    if (isSuggestionOnly) {
      const currentTitle = String((thread as any)?.title || "").trim().toLowerCase();
      const isDefaultTitle = !currentTitle || currentTitle === "new chat";
      if (isDefaultTitle) {
        await (prisma as any).portalAiChatThread.update({
          where: { id: threadId },
          data: { title: widgetSuggestionThreadTitle(widgetSuggestion as any) },
        });
      }

      if (!suggestionChanged) {
        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now } });
        return NextResponse.json({ ok: true, userMessage: null, assistantMessage: null, assistantActions: [], autoActionMessage: null, canvasUrl: null });
      }

      let assistantText = "";
      try {
        assistantText = await generateWidgetSuggestionAssistantText(widgetSuggestion as any);
      } catch {
        assistantText = "";
      }

      const assistantMsg = assistantText.trim()
        ? await (prisma as any).portalAiChatMessage.create({
            data: {
              ownerId,
              threadId,
              role: "assistant",
              text: assistantText.trim(),
              attachmentsJson: null,
              createdByUserId: null,
              sendAt: null,
              sentAt: now,
            },
            select: {
              id: true,
              role: true,
              text: true,
              attachmentsJson: true,
              createdAt: true,
              sendAt: true,
              sentAt: true,
            },
          })
        : null;

      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: persistedThreadContext } });
      return NextResponse.json({ ok: true, userMessage: null, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null });
    }
  }

  if (isConfirmOnly) {
    let threadContext = persistedThreadContext;
    const pendingConfirm =
      threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
        ? (threadContext as any).pendingConfirm
        : null;

    if (!pendingConfirm || String(pendingConfirm.token || "") !== confirmToken) {
      return NextResponse.json({ ok: false, error: "Confirmation expired" }, { status: 400 });
    }

    const confirmedSteps: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }> =
      Array.isArray(pendingConfirm.steps) ? (pendingConfirm.steps as any) : [];
    if (!confirmedSteps.length) {
      return NextResponse.json({ ok: false, error: "Nothing to confirm" }, { status: 400 });
    }

    threadContext = await beginInterruptibleRun(threadContext);

    const results: Array<{
      ok: boolean;
      status: number;
      action: PortalAgentActionKey;
      args: Record<string, unknown>;
      result: any;
      assistantText?: string | null;
      linkUrl?: string | null;
      clientUiAction?: any | null;
    }> = [];
    const clientUiActions: any[] = [];
    for (const step of confirmedSteps) {
      if (await checkInterruptRequested()) {
        return await buildStoppedAssistantMessage(null);
      }
      threadContext = await persistLiveStatus(
        {
          phase: "executing",
          label: `Running ${step.title || step.key}`,
          actionKey: step.key,
          title: step.title,
          completedSteps: results.length,
          lastCompletedTitle: results.length ? confirmedSteps[Math.max(0, results.length - 1)]?.title || null : null,
        },
        threadContext,
      );
      const exec = await executePortalAgentAction({
        ownerId,
        actorUserId: createdByUserId,
        action: step.key,
        args: step.args,
      });
      const cua = (exec as any).clientUiAction ?? null;
      results.push({
        ok: Boolean(exec.ok),
        status: Number((exec as any).status) || 0,
        action: step.key,
        args: step.args,
        result: (exec as any).result,
        assistantText: typeof (exec as any).assistantText === "string" ? String((exec as any).assistantText) : null,
        linkUrl: (exec as any).linkUrl ?? null,
        clientUiAction: cua,
      });
      if (cua) clientUiActions.push(cua);
    }

    const mappedCanvasUrl =
      (confirmedSteps
        .map((s) => portalCanvasUrlForAction(s.key, s.args))
        .filter(Boolean)
        .slice(-1)[0] as string | undefined) ||
      null;

    const canvasUrl =
      (results.map((r) => r.linkUrl).filter(Boolean).slice(-1)[0] as string | undefined) ||
      confirmedSteps.map((s) => s.openUrl).filter(Boolean).slice(-1)[0] ||
      mappedCanvasUrl ||
      null;

    let assistantText = "";
    try {
      if (await checkInterruptRequested()) {
        return await buildStoppedAssistantMessage(null);
      }
      threadContext = await persistLiveStatus(
        {
          phase: "summarizing",
          label: "Summarizing what I just did",
          completedSteps: confirmedSteps.length,
          lastCompletedTitle: confirmedSteps[confirmedSteps.length - 1]?.title || null,
        },
        threadContext,
      );
      const resultsForSummary = Array.isArray(results)
        ? results.map((r: any) => {
            const cleaned = stripAssistantVisibleAccountingFields((r as any)?.result);
            const extractedError =
              cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && typeof (cleaned as any).error === "string"
                ? String((cleaned as any).error).trim().slice(0, 500)
                : null;
            return {
              ok: Boolean((r as any).ok),
              status: Number((r as any).status) || 0,
              action: (r as any).action,
              args: (r as any).args,
              linkUrl: (r as any).linkUrl ?? null,
              error: extractedError,
              result: cleaned,
            };
          })
        : results;
      assistantText = stripEmptyAssistantBullets(
        String(
          await generateText({
            system: [
              "You are Pura, a ChatGPT-style assistant inside a SaaS portal.",
              "The user just confirmed and you executed one or more portal actions.",
              "Write a normal chat reply (not a report).",
              "Hard constraint: NEVER claim an action succeeded unless ALL steps have ok=true and a 2xx status.",
              "If ANY step has ok=false or a non-2xx status, you must clearly say it failed (do not say 'successfully updated').",
              "Formatting rules:",
              "- 1-3 short paragraphs.",
              "- NO headings, NO bullet lists, NO tables.",
              "- Do NOT print raw JSON or field dumps.",
              "- Do NOT use labels like 'Action:', 'Status:', 'Result:'.",
              "- Never invent URLs, domains, or links. Only mention a link when linkUrl or canvasUrl is explicitly provided, and use that exact path/value.",
              "Content rules:",
              "- Say what you did and the outcome in plain language.",
              "- If something failed, say what failed and the next step.",
              "- If a failure includes an error message, mention it briefly.",
              "- If you need the user to choose something, ask ONE specific question.",
            ].join("\n"),
            user: `Confirmation execution results (JSON):\n${JSON.stringify(
              {
                workTitle: pendingConfirm.workTitle ?? null,
                steps: confirmedSteps,
                results: resultsForSummary,
                summary: {
                  total: confirmedSteps.length,
                  okCount: resultsForSummary.filter((r: any) => r && r.ok && Number(r.status) >= 200 && Number(r.status) < 300).length,
                  failedCount: resultsForSummary.filter((r: any) => !r || !r.ok || Number(r.status) < 200 || Number(r.status) >= 300).length,
                },
                canvasUrl,
              },
              null,
              2,
            )}`,
          }),
        ),
      );
    } catch {
      assistantText = "";
    }

    const normalizedConfirmed = collapseRedundantConflictSteps(confirmedSteps, results);
    const effectiveConfirmedSteps = normalizedConfirmed.steps;
    const effectiveResults = normalizedConfirmed.results;

    const assistantMsg = assistantText.trim()
      ? await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: assistantText.slice(0, 12000),
            attachmentsJson: null,
            createdByUserId: null,
            sendAt: null,
            sentAt: now,
          },
          select: {
            id: true,
            role: true,
            text: true,
            attachmentsJson: true,
            createdAt: true,
            sendAt: true,
            sentAt: true,
          },
        })
      : null;

    const prevCtx = threadContext;
    const prevRuns =
      prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx) && Array.isArray((prevCtx as any).runs)
        ? ((prevCtx as any).runs as unknown[])
        : [];
    const runTrace = {
      at: now.toISOString(),
      workTitle: pendingConfirm.workTitle ?? null,
      assistantMessageId: assistantMsg?.id ?? null,
      steps: effectiveConfirmedSteps.map((s, idx) => ({
        key: s.key,
        title: s.title,
        ok: Boolean(effectiveResults[idx]?.ok),
        linkUrl: effectiveResults[idx]?.linkUrl ?? null,
      })),
      canvasUrl,
    };
    const runs = [...prevRuns.slice(-19), runTrace];
    const okCount = effectiveResults.filter((r) => Boolean(r.ok) && Number(r.status) >= 200 && Number(r.status) < 300).length;
    const failedCount = effectiveResults.filter((r) => !Boolean(r.ok) || Number(r.status) < 200 || Number(r.status) >= 300).length;
    const runStatus: PortalAiChatRunStatus = failedCount > 0 ? (okCount > 0 ? "partial" : "failed") : "completed";

    const nextCtxBase = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
      ? { ...(prevCtx as any), pendingConfirm: null, pendingPlan: null, pendingScheduleResume: null, lastWorkTitle: pendingConfirm.workTitle ?? null, lastCanvasUrl: canvasUrl, runs }
      : { pendingConfirm: null, pendingPlan: null, pendingScheduleResume: null, lastWorkTitle: pendingConfirm.workTitle ?? null, lastCanvasUrl: canvasUrl, runs };
    const completedRunId = activeRunId;
    const completedRunStartedAt = activeRunStartedAt;
    const nextCtx = completeInterruptibleRun(
      runStatus === "completed"
        ? clearNextStepContext(clearUnresolvedRun(nextCtxBase))
        : withUnresolvedRun(clearNextStepContext(nextCtxBase), {
            status: runStatus === "partial" ? "partial" : "failed",
            runId: completedRunId,
            updatedAt: now.toISOString(),
            workTitle: pendingConfirm.workTitle ?? null,
            summaryText: assistantMsg?.text ?? null,
            userRequest: pendingConfirm.workTitle ?? null,
            canvasUrl,
          }),
    );

    await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });

    const openScheduledTasks = effectiveConfirmedSteps.some((s) => String(s.key || "").startsWith("ai_chat.scheduled."));
    const followUpSuggestions = buildProactiveFollowUpSuggestions({
      actionKeys: effectiveConfirmedSteps.map((s) => String(s.key || "")).filter(Boolean),
      canvasUrl,
      completedCount: okCount,
      failedCount,
      pendingCount: 0,
    });
    const finalizedCtx =
      runStatus === "completed"
        ? withNextStepContext(nextCtx, {
            updatedAt: now.toISOString(),
            objective: pendingConfirm.workTitle ?? null,
            workTitle: pendingConfirm.workTitle ?? null,
            summaryText: assistantMsg?.text ?? null,
            suggestedPrompt: followUpSuggestions[0] ?? null,
            suggestions: followUpSuggestions,
            canvasUrl,
          })
        : nextCtx;
    const persistedCtx = withPersistedFollowUpSuggestions(finalizedCtx, assistantMsg?.id, followUpSuggestions);
    await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: persistedCtx } });
    await persistActiveChatRun({
      status: runStatus,
      runId: completedRunId,
      startedAt: completedRunStartedAt,
      runTrace,
      summaryText: assistantMsg?.text ?? null,
      followUpSuggestions,
      completedAt: now,
    });
    persistedThreadContext = persistedCtx;
    return NextResponse.json({ ok: true, userMessage: null, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl, clientUiActions, openScheduledTasks, runTrace, followUpSuggestions });
  }

  const attachmentLines = attachments
    .map((a) => {
      const name = String(a.fileName || "Attachment").slice(0, 200);
      const url = String(a.url || "").slice(0, 500);
      return url ? `- ${name}: ${url}` : `- ${name}`;
    })
    .join("\n");

  const promptMessage = [
    effectiveText || "Please review the attachments.",
    attachmentLines ? "\nAttachments:\n" + attachmentLines : null,
  ]
    .filter(Boolean)
    .join("\n");

  let editedUserMsg: any = null;
  if (isEdit && editMessageId) {
    const target = await (prisma as any).portalAiChatMessage.findFirst({
      where: { id: editMessageId, ownerId, threadId, role: "user" },
      select: { id: true, role: true, text: true, attachmentsJson: true, createdAt: true, sendAt: true, sentAt: true },
    });

    if (!target) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const allRows = await (prisma as any).portalAiChatMessage.findMany({
      where: { ownerId, threadId },
      orderBy: { createdAt: "asc" },
      take: 1000,
      select: { id: true, role: true, text: true, createdAt: true },
    });

    const idx = Array.isArray(allRows) ? allRows.findIndex((m: any) => String(m?.id) === String(editMessageId)) : -1;
    if (idx < 0) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const after = allRows.slice(idx + 1);
    const assistantToAvoid = after.filter((m: any) => String(m?.role) === "assistant" && String(m?.text || "").trim());
    priorAssistantTextToAvoid = priorAssistantTextToAvoid || (assistantToAvoid.map((m: any) => String(m.text || "").trim()).join("\n\n").slice(0, 4000) || null);

    const idsToDelete = after.map((m: any) => String(m?.id)).filter(Boolean);
    if (idsToDelete.length) {
      await (prisma as any).portalAiChatMessage.deleteMany({ where: { ownerId, threadId, id: { in: idsToDelete } } });
    }

    editedUserMsg = await (prisma as any).portalAiChatMessage.update({
      where: { id: editMessageId },
      data: { text: effectiveText },
      select: {
        id: true,
        role: true,
        text: true,
        attachmentsJson: true,
        createdAt: true,
        sendAt: true,
        sentAt: true,
      },
    });

    // Editing behaves like a retry/regenerate: no new user message should be inserted.
    skipUserInsert = true;

    // Clear stale plan/confirm state because we just rewrote history.
    const prevCtx =
      persistedThreadContext && typeof persistedThreadContext === "object" && !Array.isArray(persistedThreadContext)
        ? (persistedThreadContext as any)
        : {};
    const nextCtx = { ...prevCtx, pendingConfirm: null, pendingPlan: null, pendingPlanClarify: null, pendingAction: null, pendingActionClarify: null, pendingScheduleResume: null, liveStatus: null };
    await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
    persistedThreadContext = nextCtx;
  }

  const userMsg = isConfirmOnly || skipUserInsert
    ? null
    : await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "user",
          text: effectiveText,
          attachmentsJson: attachments.length ? attachments : null,
          createdByUserId,
          sendAt: null,
          sentAt: now,
        },
        select: {
          id: true,
          role: true,
          text: true,
          attachmentsJson: true,
          createdAt: true,
          sendAt: true,
          sentAt: true,
        },
      });

  if (userMsg) {
    const nextCtx = clearPendingScheduleResume(persistedThreadContext);
    persistedThreadContext = nextCtx;
    await (prisma as any).portalAiChatThread.update({
      where: { id: threadId },
      data: { lastMessageAt: now, contextJson: nextCtx },
    });

    // Auto-title threads in the agentic flow as soon as we have a real user message.
    // Skip chip-click submissions (they include `choice` plus a synthetic label).
    const currentTitle = String((thread as any).title || "").trim().toLowerCase();
    const isDefaultTitle = !currentTitle || currentTitle === "new chat";
    if (!choice && cleanText && isDefaultTitle) {
      const suggested = heuristicThreadTitleFromUserText(cleanText);
      if (suggested) {
        await (prisma as any).portalAiChatThread.update({
          where: { id: threadId },
          data: { title: suggested },
        });
      }
    }
  }

  const responseUserMessage = (editedUserMsg as any) || (userMsg as any) || null;

  const latestUserMessageIdForContext = responseUserMessage?.role === "user" && responseUserMessage?.id
    ? String(responseUserMessage.id)
    : redoLatestUserMessageId
      ? String(redoLatestUserMessageId)
      : null;

  // 0) Load recent thread messages for planning/context.
  const modelRows = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "asc" },
    take: 400,
    select: { id: true, role: true, text: true },
  });

  const modelMessages: Array<{ role: "user" | "assistant"; text: string }> = modelRows
    .filter((m: any) => (latestUserMessageIdForContext ? String(m.id) !== String(latestUserMessageIdForContext) : true))
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: String(m.text || "").slice(0, 2000),
    }))
    .filter((m: { role: "user" | "assistant"; text: string }) => Boolean(String(m.text || "").trim()));

  // Use a URL that actually represents what the user is working on.
  // The chat page URL is often not enough context to resolve funnel/page entities.
  const canvasUrlRaw = String(parsed.data.canvasUrl || "").trim();
  const contextUrl = String(canvasUrlRaw || parsed.data.url || "").trim() || undefined;

  // 0.5) Agentic planning + deterministic resolution (multi-step, no IDs required).
  // This runs before the legacy action-proposal flow, and it executes immediately for imperative requests.
  let fallbackThreadContext = isConfirmOnly || threadChatMode !== "work" ? persistedThreadContext : await beginInterruptibleRun(persistedThreadContext);
  if (isPortalSupportChatConfigured()) {
    try {
      let threadContext = fallbackThreadContext;

      // Persist the latest canvas URL so entity resolution can infer the current funnel/page.
      // Only do this when the client actually provided a canvas URL (not just the chat page URL).
      if (canvasUrlRaw) {
        const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
        const prevCanvasUrl = typeof prevCtx.lastCanvasUrl === "string" ? String(prevCtx.lastCanvasUrl).trim() : "";
        if (!prevCanvasUrl || prevCanvasUrl !== canvasUrlRaw) {
          const nextCtx = { ...prevCtx, lastCanvasUrl: canvasUrlRaw, liveStatus: null };
          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
          threadContext = nextCtx;
          fallbackThreadContext = nextCtx;
        }
      }

      // Maintain a rolling summary in contextJson so the model effectively has “full thread context” every turn.
      threadContext = await maybeUpdateThreadSummary({
        ownerId,
        threadId,
        threadContext,
        recentMessages: modelMessages,
        latestUserText: effectiveText,
      });
      fallbackThreadContext = threadContext;

      // Provide a stable time zone hint for scheduling requests.
      const tzHintForContext = getTimeZoneHint(threadContext);
      if (tzHintForContext) {
        const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
        if (String(prevCtx.ownerTimeZone || "") !== String(tzHintForContext)) {
          threadContext = { ...prevCtx, ownerTimeZone: String(tzHintForContext).slice(0, 80) };
          fallbackThreadContext = threadContext;
        }
      }

      // Apply structured choice selections to thread context for the next resolution pass.
      if (choice && typeof choice === "object") {
        try {
          const t = String((choice as any).type || "").trim();
          const kind =
            t === "booking_calendar"
              ? "booking_calendar"
              : t === "entity"
                ? String((choice as any).kind || "").trim()
                : "";
          const value =
            t === "booking_calendar"
              ? String((choice as any).calendarId || "").trim().slice(0, 80)
              : t === "entity"
                ? String((choice as any).value || "").trim().slice(0, 200)
                : "";

          if (kind && value) {
            // Persist via helper so validation is shared.
            const setRes = await (await import("@/lib/portalAiChatChoices")).setThreadChoiceOverride({ ownerId, threadId, kind, value });
            if (setRes && (setRes as any).ok) {
              const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
              const prevOverrides =
                prevCtx.choiceOverrides && typeof prevCtx.choiceOverrides === "object" && !Array.isArray(prevCtx.choiceOverrides)
                  ? (prevCtx.choiceOverrides as any)
                  : {};
              threadContext = { ...prevCtx, choiceOverrides: { ...prevOverrides, ...((setRes as any).choiceOverrides || {}) } };
            }
          }
        } catch {
          // ignore helper failures and continue gracefully
        }
      }

      const pendingConfirm =
        threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
          ? (threadContext as any).pendingConfirm
          : null;

      const pendingAction =
        threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
          ? (threadContext as any).pendingAction
          : null;

      // Any new user message clears stale confirmations.
      if (pendingConfirm && !isConfirmOnly) {
        const prevCtx = threadContext;
        const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
          ? completeInterruptibleRun({ ...(prevCtx as any), pendingConfirm: null })
          : completeInterruptibleRun({ pendingConfirm: null });
        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
        threadContext = nextCtx;
      }

      const hasNewUserText = Boolean(String(effectiveText || "").trim());
      const didClickChoice = Boolean(choice && typeof choice === "object");
      const effectivePlanningTextBase = effectiveText;

      const intentNote = (() => {
        const mode = isRedo ? "redo" : isEdit ? "edit" : "";
        if (!mode) return "";
        const prior = String(priorAssistantTextToAvoid || "").trim();
        const priorLower = prior.toLowerCase();
        const currentLower = String(effectivePlanningTextBase || "").toLowerCase();
        const currentLooksLikeFunnel =
          /\b(funnel|funnels|landing page|landing|thank you|thank-you|opt[-\s]?in|upsell|downsell|checkout|page builder|website|site)\b/.test(currentLower) ||
          String(contextUrl || "").toLowerCase().includes("/funnels") ||
          String(contextUrl || "").toLowerCase().includes("/funnel");
        const priorFocusedOnBooking = /\b(booking|calendar|appointment|availability)\b/.test(priorLower);
        const priorFocusedOnFunnel = /\b(funnel|landing|page builder|website|site)\b/.test(priorLower);

        const avoidNotes =
          mode === "redo" && currentLooksLikeFunnel && priorFocusedOnBooking && !priorFocusedOnFunnel
            ? "\n- The previous attempt focused on booking; this time focus on Funnel Builder/page actions."
            : "";
        const redoExtra =
          mode === "redo"
            ? "\n- Re-evaluate the task and tool selection from scratch.\n- If the previous attempt failed or asked unhelpful questions, choose a different approach (prefer safe GET/diagnostics first, then targeted updates).\n- Do NOT reuse the same plan/steps unless they are clearly the best option."
            : "";

        const priorBlock = prior
          ? `\n\nPrevious assistant response (user was not satisfied; use this to take a different angle and avoid repeating it):\n${prior.slice(0, 1400)}`
          : "";
        return (
          "\n\nSystem note: The user clicked Redo / edited their last message because they were not satisfied. Replace the previous assistant response." +
          redoExtra +
          avoidNotes +
          "\n- Do not repeat the previous answer; take a different angle and fix the underlying issue.\n- Keep it concise and action-oriented." +
          priorBlock
        );
      })();

      const effectivePlanningText = (intentNote ? `${effectivePlanningTextBase}${intentNote}` : effectivePlanningTextBase).slice(0, 8000);

      const attachmentTextContext = attachments.length
        ? await extractTextContextFromAttachments({ ownerId, attachments, maxTotalChars: 8000 }).catch(() => "")
        : "";

      const selectedContextKeys = Array.from(
        new Set(
          (Array.isArray(parsed.data.contextKeys) ? parsed.data.contextKeys : [])
            .map((value) => String(value || "").trim().slice(0, 120))
            .filter(Boolean)
            .slice(0, 8),
        ),
      );
      const selectedContextBlock = selectedContextKeys.length
        ? [
            "SELECTED_PORTAL_CONTEXT (prefer these areas first if relevant):",
            ...selectedContextKeys.map((value) => `- ${value}`),
          ].join("\n")
        : "";

      const planningTextWithAttachments = [effectivePlanningText, selectedContextBlock, attachmentTextContext]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 12_000);

      if (hasNewUserText && !isConfirmOnly && !didClickChoice) {
        const preflightPrompt = String(effectiveText || "").trim();
        const rawUserPrompt = typeof parsed.data.text === "string" ? String(parsed.data.text).trim() : preflightPrompt;
        const preflightCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
        const directIntentSurfaceHint = describeDirectIntentSurface({
          url: typeof parsed.data.url === "string" ? parsed.data.url : null,
          canvasUrl: typeof parsed.data.canvasUrl === "string" ? parsed.data.canvasUrl : null,
          contextKeys: selectedContextKeys,
        });
        const directIntentPrompt = [directIntentSurfaceHint, preflightPrompt].filter(Boolean).join("\n\n");
        const signals = detectPuraDirectIntentSignals(directIntentPrompt, preflightCtx);
        const preflightSmsThreadMatch = signals.smsThreadWithName;
        const preflightInboxSearchQuery = signals.inboxSearchQuery;
        const preflightInboxSearchChannel = signals.inboxSearchChannel;
        const shouldRunPreflightInboxSummary = signals.shouldRunPreflightInboxSummary;
        const shouldRunPreflightReceptionist = signals.shouldRunPreflightReceptionist;
        const shouldRunPreflightReceptionistPeople = signals.shouldRunPreflightReceptionistPeople;
        const shouldRunPreflightReviewSummary = signals.shouldRunPreflightReviewSummary;
        const shouldRunPreflightWorkSummary = signals.shouldRunPreflightWorkSummary;
        const shouldRunPreflightCrossSurfaceNextSteps = signals.shouldRunPreflightCrossSurfaceNextSteps;
        const preflightContactDetailName = signals.contactDetailName;
        const preflightTaskLookupQuery = signals.taskLookupQuery;
        const preflightReviewDetailName = signals.reviewDetailName;
        const draftInboxReplyIntent = signals.draftInboxReplyIntent;
        const shouldTightenLatestNewsletter = signals.shouldTightenLatestNewsletter;
        const shouldPolishLatestBlog = signals.shouldPolishLatestBlog;
        const reviewReplyIntent = signals.reviewReplyIntent;
        const shouldSetWeekdayAvailability = signals.shouldSetWeekdayAvailability;
        const shouldAssessCrossSurfaceReadiness = signals.shouldAssessCrossSurfaceReadiness;
        const hasExplicitActiveSurface = hasActivePortalWorkSurface(typeof parsed.data.canvasUrl === "string" ? parsed.data.canvasUrl : null)
          || hasActivePortalWorkSurface(typeof parsed.data.url === "string" ? parsed.data.url : null);
        const recentHostedPageDocument =
          preflightCtx && typeof preflightCtx.lastHostedPageDocument === "object" && !Array.isArray(preflightCtx.lastHostedPageDocument)
            ? (preflightCtx.lastHostedPageDocument as { service?: string | null; pageKey?: string | null; label?: string | null })
            : null;
        const shouldUseRecentHostedPageTarget =
          looksLikeContextlessPolishPrompt(preflightPrompt) &&
          !hasExplicitActiveSurface &&
          !selectedContextKeys.length &&
          Boolean(String(recentHostedPageDocument?.service || "").trim());
        const shouldClarifyContextlessPolishTarget =
          looksLikeContextlessPolishPrompt(preflightPrompt) &&
          !hasExplicitActiveSurface &&
          !selectedContextKeys.length &&
          !hasRecentResolvableWorkTarget(preflightCtx);

        const hasMutatingDirectPreflightIntent = Boolean(
          signals.hostedPageUpdateTarget ||
            signals.hostedPagePublishTarget ||
            signals.hostedPageResetTarget ||
            signals.hostedPageGenerateTarget ||
            signals.newsletterCreateTitle ||
            signals.shouldTightenLatestNewsletter ||
            signals.shouldSendLatestNewsletter ||
            signals.blogCreateTitle ||
            signals.shouldPolishLatestBlog ||
            signals.shouldPublishLatestBlog ||
            signals.funnelCreateTitle ||
            signals.shouldCreateLandingPage ||
            signals.shouldGenerateLandingLayout ||
            signals.shouldUpdateCurrentFunnelPage ||
            signals.mediaFolderCreateTitle ||
            signals.shouldImportToNamedMediaFolder ||
            signals.reviewReplyIntent ||
            signals.nurtureStepIntent ||
            signals.leadRunIntent ||
            signals.shouldUpdateBookingThankYou ||
            signals.shouldSetWeekdayAvailability
        );
        const shouldSkipMutatingDirectPreflight = threadChatMode !== "work" && hasMutatingDirectPreflightIntent;

        const runDirectActionPlan = async (plan: { action: PortalAgentActionKey; traceTitle: string; args: Record<string, unknown> } | null) => {
          if (!plan) return null;
          const exec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: plan.action,
            args: plan.args,
          });
          return finalizePreflightResponse({
            exec,
            traceKey: plan.action,
            traceTitle: plan.traceTitle,
            traceArgs: plan.args,
            promptText: preflightPrompt,
          });
        };

        const formatPreflightDateTime = (raw: unknown) => {
          if (typeof raw !== "string") return "";
          const timestamp = Date.parse(raw);
          if (!Number.isFinite(timestamp)) return "";
          return new Date(timestamp).toLocaleString();
        };

        const cleanPreflightText = (value: unknown, max = 180) =>
          String(value || "")
            .trim()
            .replace(/[\r\n\t]+/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, max)
            .trim();

        const summarizeReceptionistCaller = (event: any) => {
          const name = cleanPreflightText(event?.contactName, 80);
          const email = cleanPreflightText(event?.contactEmail, 120);
          const phone = cleanPreflightText(event?.contactPhone || event?.from, 40);
          return name || email || phone || "Unknown caller";
        };

        const formatTaskStatus = (task: any) => cleanPreflightText(task?.status || "OPEN", 40).toUpperCase() || "OPEN";

        const isTaskClosed = (task: any) => /^(DONE|COMPLETED|CLOSED|CANCELLED|CANCELED)$/.test(formatTaskStatus(task));

        const buildReceptionistRecentPeopleAssistantText = (events: any[], canvasUrl: string | null) => {
          const cta = formatAssistantMarkdownLink("Open AI Receptionist", canvasUrl);
          const recentEvents = (Array.isArray(events) ? events : []).filter((event) => {
            const timestamp = typeof event?.createdAtIso === "string" ? Date.parse(event.createdAtIso) : NaN;
            return Number.isFinite(timestamp) ? timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000 : true;
          });
          const deduped: any[] = [];
          const seen = new Set<string>();
          for (const event of recentEvents) {
            const label = summarizeReceptionistCaller(event);
            const key = label.toLowerCase();
            if (!label || seen.has(key)) continue;
            seen.add(key);
            deduped.push(event);
            if (deduped.length >= 4) break;
          }
          if (!deduped.length) {
            return `I don’t see any recent people coming through the AI receptionist yet.${cta ? `\n\n${cta}` : ""}`;
          }

          const lines = deduped.map((event) => {
            const who = summarizeReceptionistCaller(event);
            const contactPoint = cleanPreflightText(event?.contactEmail || event?.contactPhone || event?.from, 80);
            const status = cleanPreflightText(event?.status || "UNKNOWN", 20).toUpperCase();
            const when = formatPreflightDateTime(event?.createdAtIso);
            const detail = cleanPreflightText(event?.notes || event?.transcript, 120);
            return `- ${who}${contactPoint && contactPoint !== who ? ` - ${contactPoint}` : ""}${status ? ` - ${status}` : ""}${when ? ` - ${when}` : ""}${detail ? ` - ${detail}` : ""}`;
          });

          return `Here are the most recent people who came through the AI receptionist:\n\n${lines.join("\n")}${cta ? `\n\n${cta}` : ""}`;
        };

        const buildReceptionistSummaryAssistantText = (highlights: any, events: any[], canvasUrl: string | null) => {
          const stats = highlights && typeof highlights === "object" ? (highlights.stats as any) : null;
          const warnings = Array.isArray(highlights?.warnings)
            ? (highlights.warnings as unknown[]).map((value) => cleanPreflightText(value, 180)).filter(Boolean).slice(0, 3)
            : [];
          const issues = Array.isArray(highlights?.issues)
            ? (highlights.issues as any[])
                .map((issue) => cleanPreflightText(issue?.summary, 180))
                .filter(Boolean)
                .slice(0, 3)
            : [];
          const recentCalls = (Array.isArray(events) ? events : []).slice(0, 3).map((event) => {
            const who = summarizeReceptionistCaller(event);
            const status = cleanPreflightText(event?.status || "UNKNOWN", 20).toUpperCase();
            const when = formatPreflightDateTime(event?.createdAtIso);
            return `- ${who}${status ? ` - ${status}` : ""}${when ? ` - ${when}` : ""}`;
          });
          const cta = formatAssistantMarkdownLink("Open AI Receptionist", canvasUrl);
          const total = Number(stats?.total || 0);
          const completed = Number(stats?.completed || 0);
          const failed = Number(stats?.failed || 0);
          const inProgress = Number(stats?.inProgress || 0);
          const missingTranscript = Number(stats?.missingTranscript || 0);

          const sections = [
            "Here’s the current AI receptionist snapshot:",
            `- Volume: ${total} recent call${total === 1 ? "" : "s"}${completed ? `, ${completed} completed` : ""}${failed ? `, ${failed} failed` : ""}${inProgress ? `, ${inProgress} still in progress` : ""}${missingTranscript ? `, ${missingTranscript} missing transcripts` : ""}`,
            recentCalls.length ? `Recent callers:\n${recentCalls.join("\n")}` : null,
            warnings.length ? `Watchouts:\n${warnings.map((warning) => `- ${warning}`).join("\n")}` : null,
            !warnings.length && issues.length ? `Latest issues:\n${issues.map((issue) => `- ${issue}`).join("\n")}` : null,
            cta || null,
          ].filter(Boolean);

          return sections.join("\n\n");
        };

        const buildWorkSummaryAssistantText = (threads: any[], tasks: any[], inboxUrl: string | null, tasksUrl: string | null) => {
          const inboxCta = formatAssistantMarkdownLink("Open Inbox", inboxUrl);
          const tasksCta = formatAssistantMarkdownLink("Open Tasks", tasksUrl);
          const needsReplyThreads = threads.filter((thread) => thread?.needsReply === true);
          const openTasks = tasks.filter((task) => !isTaskClosed(task));
          const topThreads = needsReplyThreads.slice(0, 2).map((thread) => {
            const name = cleanPreflightText(thread?.contact?.name || thread?.peerAddress || thread?.subject || "Conversation", 80);
            const preview = cleanPreflightText(thread?.lastMessagePreview || thread?.subject, 120);
            const lastActivity = formatPreflightDateTime(thread?.lastMessageAtIso);
            return `- ${name}${preview ? ` - ${preview}` : ""}${lastActivity ? ` - last activity ${lastActivity}` : ""}`;
          });
          const topTasks = openTasks.slice(0, 2).map((task) => {
            const title = cleanPreflightText(task?.title || "Task", 100) || "Task";
            const due = formatPreflightDateTime(task?.dueAtIso);
            return `- [${formatTaskStatus(task)}] ${title}${due ? ` - due ${due}` : ""}`;
          });

          const recommendation = needsReplyThreads.length && openTasks.length
            ? "Start with the inbox replies, then knock out the highest-priority open task."
            : needsReplyThreads.length
              ? "Inbox replies are the main thing needing attention right now."
              : openTasks.length
                ? "Tasks are the main thing needing attention right now."
                : "You look caught up across both inbox and tasks right now.";

          return [
            "Here’s the quick work summary across tasks and inbox:",
            `- Inbox: ${needsReplyThreads.length} conversation${needsReplyThreads.length === 1 ? "" : "s"} currently need a reply.${inboxCta ? ` ${inboxCta}` : ""}`,
            topThreads.length ? `Top inbox items:\n${topThreads.join("\n")}` : null,
            `- Tasks: ${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} in the current sample.${tasksCta ? ` ${tasksCta}` : ""}`,
            topTasks.length ? `Top tasks:\n${topTasks.join("\n")}` : null,
            recommendation,
          ].filter(Boolean).join("\n\n");
        };

        const buildCrossSurfaceNextStepsAssistantText = (opts: any) => {
          const inboxCta = formatAssistantMarkdownLink("Open Inbox", opts.inboxUrl);
          const tasksCta = formatAssistantMarkdownLink("Open Tasks", opts.tasksUrl);
          const contactsCta = formatAssistantMarkdownLink("Open Contacts", opts.contactsUrl);
          const reviewsCta = formatAssistantMarkdownLink("Open Reviews", opts.reviewsUrl);
          const receptionistCta = formatAssistantMarkdownLink("Open AI Receptionist", opts.receptionistUrl);
          const needsReplyThreads = opts.threads.filter((thread: any) => thread?.needsReply === true);
          const openTasks = opts.tasks.filter((task: any) => !isTaskClosed(task));
          const overdueTask =
            openTasks.find((task: any) => {
              const due = typeof task?.dueAtIso === "string" ? Date.parse(task.dueAtIso) : NaN;
              return Number.isFinite(due) && due < Date.now();
            }) || openTasks[0] || null;
          const reviewsWithoutReply = opts.reviews.filter((review: any) => !cleanPreflightText(review?.businessReply, 40));
          const reviewWithoutReply = reviewsWithoutReply[0] || null;
          const receptionistWarnings = Array.isArray(opts.receptionistHighlights?.warnings)
            ? (opts.receptionistHighlights.warnings as unknown[]).map((value) => cleanPreflightText(value, 160)).filter(Boolean)
            : [];
          const receptionistIssues = Array.isArray(opts.receptionistHighlights?.issues)
            ? (opts.receptionistHighlights.issues as any[]).map((issue) => cleanPreflightText(issue?.summary, 160)).filter(Boolean)
            : [];
          const actions: string[] = [];

          if (needsReplyThreads[0]) {
            const thread = needsReplyThreads[0];
            const name = cleanPreflightText(thread?.contact?.name || thread?.peerAddress || thread?.subject || "that inbox conversation", 80);
            const preview = cleanPreflightText(thread?.lastMessagePreview || thread?.subject, 120);
            const message = preview ? `- Inbox first: reply to ${name} about "${preview}".` : `- Inbox first: reply to ${name}.`;
            actions.push(inboxCta ? `${message} ${inboxCta}` : message);
          }

          if (overdueTask) {
            const title = cleanPreflightText(overdueTask?.title || "the top open task", 100);
            const due = formatPreflightDateTime(overdueTask?.dueAtIso);
            const message = due ? `- Task next: clear ${title} (due ${due}).` : `- Task next: clear ${title}.`;
            actions.push(tasksCta ? `${message} ${tasksCta}` : message);
          }

          if (reviewWithoutReply) {
            const name = cleanPreflightText(reviewWithoutReply?.name || "the latest review", 80);
            const rating = Number(reviewWithoutReply?.rating || 0);
            const reviewLabel = rating ? `${name}'s ${rating}/5 review` : `${name}'s review`;
            const message = `- Reputation: post a business reply to ${reviewLabel}.`;
            actions.push(reviewsCta ? `${message} ${reviewsCta}` : message);
          }

          if (receptionistIssues[0] || receptionistWarnings[0]) {
            const warningText = cleanPreflightText(receptionistIssues[0] || receptionistWarnings[0], 160).replace(/[.]+$/g, "");
            const message = `- Receptionist: check ${warningText}.`;
            actions.push(receptionistCta ? `${message} ${receptionistCta}` : message);
          }

          if (actions.length < 4 && opts.contacts.length) {
            const message = `- Contacts: I checked ${opts.contacts.length} recent contact${opts.contacts.length === 1 ? "" : "s"}, but I do not see a higher-priority contact-only action than the items above.`;
            actions.push(contactsCta ? `${message} ${contactsCta}` : message);
          }

          if (!actions.length) {
            const message = "- You look caught up across inbox, tasks, reviews, and receptionist activity right now.";
            actions.push(contactsCta ? `${message} ${contactsCta}` : message);
          }

          const receptionistTotal = Number(opts.receptionistHighlights?.stats?.total || 0);
          const signalCheck =
            "- Signal check: " +
            `${needsReplyThreads.length} inbox thread${needsReplyThreads.length === 1 ? "" : "s"} need replies, ` +
            `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"}, ` +
            `${reviewsWithoutReply.length} review${reviewsWithoutReply.length === 1 ? "" : "s"} still need a reply, and ` +
            `${receptionistTotal} recent receptionist call${receptionistTotal === 1 ? "" : "s"} were sampled.`;

          return [
            "Based on inbox, tasks, contacts, reviews, and receptionist calls, here's what I'd do next:",
            signalCheck,
            actions.slice(0, 4).join("\n"),
          ].join("\n\n");
        };

        const buildContactDetailAssistantText = (contact: any, canvasUrl: string | null, preferredName?: string | null) => {
          if (!contact || typeof contact !== "object") return "";
          const rawName = String(contact?.name || "").trim();
          const email = typeof contact?.email === "string" && contact.email.trim() ? String(contact.email).trim() : "";
          const phone = typeof contact?.phone === "string" && contact.phone.trim() ? String(contact.phone).trim() : "";
          const preferredNameText = String(preferredName || "").trim();
          const nameLooksPlaceholder = Boolean(rawName) && (rawName === email || rawName === phone);
          const name = (nameLooksPlaceholder && preferredNameText ? preferredNameText : rawName) || preferredNameText || "Contact";
          const tags = Array.isArray(contact?.tags)
            ? (contact.tags as any[])
                .map((tag) => (typeof tag?.name === "string" ? String(tag.name).trim() : ""))
                .filter(Boolean)
                .slice(0, 6)
            : [];
          const latestThread = Array.isArray(contact?.inboxThreads) ? (contact.inboxThreads as any[])[0] : null;
          const nextBooking = Array.isArray(contact?.bookings)
            ? (contact.bookings as any[]).find((booking) => typeof booking?.startAtIso === "string") || (contact.bookings as any[])[0]
            : null;
          const latestLead = Array.isArray(contact?.leads) ? (contact.leads as any[])[0] : null;
          const latestReview = Array.isArray(contact?.reviews) ? (contact.reviews as any[])[0] : null;
          const lines = [
            `- Name: ${name}`,
            email ? `- Email: ${email}` : null,
            phone ? `- Phone: ${phone}` : null,
            tags.length ? `- Tags: ${tags.join(", ")}` : null,
            latestThread
              ? `- Latest inbox activity: ${String(latestThread?.channel || "").trim().toUpperCase() || "Conversation"}${latestThread?.lastMessagePreview ? ` - ${String(latestThread.lastMessagePreview).trim().replace(/\s+/g, " ").slice(0, 140)}` : ""}`
              : null,
            nextBooking
              ? `- Latest booking: ${String(nextBooking?.status || "BOOKED").trim()}${formatPreflightDateTime(nextBooking?.startAtIso) ? ` - ${formatPreflightDateTime(nextBooking?.startAtIso)}` : ""}`
              : null,
            latestLead
              ? `- Recent lead: ${String(latestLead?.businessName || latestLead?.website || latestLead?.niche || "Lead").trim()}`
              : null,
            latestReview && typeof latestReview?.rating === "number" ? `- Recent review rating: ${Number(latestReview.rating)}/5` : null,
          ].filter(Boolean);

          const cta = formatAssistantMarkdownLink("Open Contact", canvasUrl);
          return `Here are the important details I found for ${name}:\n\n${lines.join("\n")}${cta ? `\n\n${cta}` : ""}`;
        };

        const buildInboxBackedContactAssistantText = (nameHint: string, thread: any, canvasUrl: string | null) => {
          if (!thread || typeof thread !== "object") return "";
          const contactName = typeof thread?.contact?.name === "string" && thread.contact.name.trim()
            ? String(thread.contact.name).trim()
            : String(nameHint || "Contact").trim() || "Contact";
          const channel = String(thread?.channel || "").trim().toUpperCase() || "CONVERSATION";
          const address = typeof thread?.contact?.email === "string" && thread.contact.email.trim()
            ? String(thread.contact.email).trim()
            : typeof thread?.contact?.phone === "string" && thread.contact.phone.trim()
              ? String(thread.contact.phone).trim()
              : typeof thread?.peerAddress === "string" && thread.peerAddress.trim()
                ? String(thread.peerAddress).trim()
                : "";
          const preview = typeof thread?.lastMessagePreview === "string" ? String(thread.lastMessagePreview).trim().replace(/\s+/g, " ").slice(0, 160) : "";
          const lastMessageAt = formatPreflightDateTime(thread?.lastMessageAtIso);
          const lines = [
            `- Name: ${contactName}`,
            address ? `- Best contact point: ${address}` : null,
            `- Latest conversation channel: ${channel}`,
            preview ? `- Latest message: ${preview}` : null,
            lastMessageAt ? `- Last activity: ${lastMessageAt}` : null,
            thread?.needsReply === true ? "- Status: This conversation still needs a reply" : null,
          ].filter(Boolean);

          const cta = formatAssistantMarkdownLink("Open Inbox", canvasUrl);
          return `I couldn’t find a full CRM contact card for ${contactName}, but here’s what I found from recent inbox activity:\n\n${lines.join("\n")}${cta ? `\n\n${cta}` : ""}`;
        };

        const buildTaskLookupAssistantText = (query: string, tasks: any[], canvasUrl: string | null) => {
          const normalizedQuery = String(query || "").trim();
          const taskCta = formatAssistantMarkdownLink("Open Tasks", canvasUrl);
          if (!tasks.length) {
            return normalizedQuery
              ? `I couldn’t find a task matching “${normalizedQuery}”.${taskCta ? ` Review them here: ${taskCta}.` : ""}`
              : `I couldn’t find a matching task right now.${taskCta ? ` Review them here: ${taskCta}.` : ""}`;
          }

          const bestTask = tasks[0];
          const title = String(bestTask?.title || "Task").trim() || "Task";
          const description = typeof bestTask?.description === "string" ? String(bestTask.description).trim().replace(/\s+/g, " ").slice(0, 180) : "";
          const status = String(bestTask?.status || "OPEN").trim().toUpperCase();
          const due = formatPreflightDateTime(bestTask?.dueAtIso);
          const extraMatches = tasks.length > 1 ? tasks.slice(1, 3).map((task) => `- ${String(task?.title || "Task").trim() || "Task"}`).join("\n") : "";

          return [
            normalizedQuery ? `The best task match for “${normalizedQuery}” is:` : "Here’s the task I found:",
            `- [${status}] ${title}${due ? ` - due ${due}` : ""}`,
            description ? `- Details: ${description}` : null,
            extraMatches ? `Other close matches:\n${extraMatches}` : null,
            taskCta || null,
          ].filter(Boolean).join("\n\n");
        };

        const buildReviewDetailAssistantText = (review: any, canvasUrl: string | null) => {
          if (!review || typeof review !== "object") return "";
          const name = String(review?.name || "Review").trim() || "Review";
          const rating = Number(review?.rating || 0);
          const body = typeof review?.body === "string" ? String(review.body).trim().replace(/\s+/g, " ") : "";
          const reply = typeof review?.businessReply === "string" ? String(review.businessReply).trim().replace(/\s+/g, " ") : "";
          const cta = formatAssistantMarkdownLink("Open Reviews", canvasUrl);
          const lines = [
            `- Reviewer: ${name}`,
            rating ? `- Rating: ${rating}/5` : null,
            body ? `- Review: ${body}` : null,
            reply ? `- Business reply: ${reply}` : "- Business reply: Not added yet",
          ].filter(Boolean);
          return `Here’s the review from ${name}:\n\n${lines.join("\n")}${cta ? `\n\n${cta}` : ""}`;
        };

        const finalizePreflightResponse = async (opts: {
          exec: any;
          traceKey: string;
          traceTitle: string;
          traceArgs: Record<string, unknown>;
          promptText: string;
          contextActionKey?: PortalAgentActionKey | null;
          suggestionActionKeys?: PortalAgentActionKey[];
          contextPatch?: Record<string, unknown> | null;
        }) => {
          const canvasUrl = typeof opts.exec?.linkUrl === "string" ? String(opts.exec.linkUrl).trim().slice(0, 1200) : null;
          const preflightAssistantText = typeof opts.exec?.assistantText === "string" ? absolutizeAssistantTextLinks(String(opts.exec.assistantText).trim()) : "";
          if (!preflightAssistantText) return null;
          const assistantMsg = await (prisma as any).portalAiChatMessage.create({
            data: {
              ownerId,
              threadId,
              role: "assistant",
              text: preflightAssistantText,
              attachmentsJson: null,
              createdByUserId: null,
              sendAt: null,
              sentAt: now,
            },
            select: {
              id: true,
              role: true,
              text: true,
              attachmentsJson: true,
              createdAt: true,
              sendAt: true,
              sentAt: true,
            },
          });

          const runTrace = {
            at: now.toISOString(),
            workTitle: opts.traceTitle,
            assistantMessageId: assistantMsg.id,
            steps: [{ key: opts.traceKey, title: opts.traceTitle, ok: Boolean(opts.exec?.ok), linkUrl: canvasUrl }],
            canvasUrl,
          };
          const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
          const prevRuns = Array.isArray(prevCtx.runs) ? (prevCtx.runs as unknown[]) : [];
          const contextActionKey = opts.contextActionKey === undefined ? (opts.traceKey as PortalAgentActionKey) : opts.contextActionKey;
          const derivedPatch = contextActionKey ? deriveThreadContextPatchFromAction(contextActionKey, opts.traceArgs, opts.exec?.result) : null;
          const followUpSuggestions = buildProactiveFollowUpSuggestions({
            actionKeys: Array.isArray(opts.suggestionActionKeys)
              ? opts.suggestionActionKeys
              : contextActionKey
                ? [contextActionKey]
                : [],
            canvasUrl,
            promptText: opts.promptText,
            completedCount: Boolean(opts.exec?.ok) ? 1 : 0,
            failedCount: Boolean(opts.exec?.ok) ? 0 : 1,
            pendingCount: 0,
          });
          const nextCtx = withPersistedFollowUpSuggestions(
            {
              ...prevCtx,
              ...(opts.contextPatch && typeof opts.contextPatch === "object" && !Array.isArray(opts.contextPatch) ? opts.contextPatch : {}),
              ...(derivedPatch && typeof derivedPatch === "object" && !Array.isArray(derivedPatch) ? (derivedPatch as any) : {}),
              lastWorkTitle: opts.traceTitle,
              lastCanvasUrl: canvasUrl,
              runs: [...prevRuns.slice(-19), runTrace],
            },
            assistantMsg.id,
            followUpSuggestions,
          );

          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
          threadContext = nextCtx;
          await persistActiveChatRun({
            status: Boolean(opts.exec?.ok) ? "completed" : "failed",
            runId: activeRunId,
            startedAt: activeRunStartedAt,
            runTrace,
            summaryText: preflightAssistantText,
            followUpSuggestions,
            completedAt: now,
          });

          return NextResponse.json({
            ok: true,
            userMessage: responseUserMessage,
            assistantMessage: assistantMsg,
            assistantActions: [],
            autoActionMessage: null,
            canvasUrl,
            assistantChoices: null,
            clientUiActions: Array.isArray(opts.exec?.clientUiAction)
              ? opts.exec.clientUiAction
              : opts.exec?.clientUiAction
                ? [opts.exec.clientUiAction]
                : [],
            runTrace,
            followUpSuggestions,
          });
        };

        if (threadChatMode !== "work" && looksLikeDiscussAdvisoryCopyPrompt(rawUserPrompt)) {
          const advisoryResponse = await finalizePreflightResponse({
            exec: { ok: true, assistantText: buildDiscussAdvisoryCopyResponse(rawUserPrompt) },
            traceKey: "discuss.copy.advice",
            traceTitle: "Discuss Copy Direction",
            traceArgs: {},
            promptText: rawUserPrompt,
            contextActionKey: null,
            suggestionActionKeys: [],
          });
          if (advisoryResponse) return advisoryResponse;
        }

        const hasHostedPageDirectIntent = Boolean(
          signals.hostedPageUpdateTarget ||
          signals.hostedPagePublishTarget ||
          signals.hostedPageResetTarget ||
          signals.hostedPageGenerateTarget ||
          signals.hostedPagePreviewTarget ||
          signals.hostedPageGetTarget ||
          signals.hostedPageListService
        );

        const shouldBypassSimpleDirectPlan = !hasHostedPageDirectIntent && Boolean(
          signals.newsletterCreateTitle ||
          signals.blogCreateTitle ||
          shouldRunPreflightReviewSummary ||
          shouldRunPreflightReceptionistPeople ||
          shouldRunPreflightWorkSummary ||
          shouldRunPreflightCrossSurfaceNextSteps ||
          preflightReviewDetailName ||
          preflightContactDetailName ||
          preflightTaskLookupQuery ||
          shouldRunPreflightInboxSummary ||
          preflightInboxSearchQuery ||
          preflightSmsThreadMatch ||
          shouldRunPreflightReceptionist ||
          draftInboxReplyIntent ||
          shouldTightenLatestNewsletter ||
          shouldPolishLatestBlog ||
          reviewReplyIntent ||
          shouldSetWeekdayAvailability ||
          shouldAssessCrossSurfaceReadiness
        );

        const funnelEditorAnchor = looksLikeFunnelBuilderContextAnchorPrompt(preflightPrompt)
          ? extractFunnelBuilderEditorContextFromUrl(contextUrl)
          : null;
        if (funnelEditorAnchor) {
          const [funnelRecord, pageRecord] = await Promise.all([
            prisma.creditFunnel.findUnique({
              where: { id: funnelEditorAnchor.funnelId },
              select: { id: true, name: true, slug: true },
            }).catch(() => null),
            prisma.creditFunnelPage.findUnique({
              where: { id: funnelEditorAnchor.pageId },
              select: { id: true, title: true, slug: true, funnelId: true },
            }).catch(() => null),
          ]);
          const funnelLabel = String(funnelRecord?.name || funnelRecord?.slug || "this funnel").trim() || "this funnel";
          const pageLabel = String(pageRecord?.title || pageRecord?.slug || "this page").trim() || "this page";
          const anchorAssistantText = `Got it — I’ll stay on the Funnel Builder editor for “${funnelLabel}” and use the exact page “${pageLabel}” for the next changes.\n\n${formatAssistantMarkdownLink("Open Funnel Builder", funnelEditorAnchor.canvasUrl)}`;
          const anchorResponse = await finalizePreflightResponse({
            exec: {
              ok: true,
              assistantText: anchorAssistantText,
              linkUrl: funnelEditorAnchor.canvasUrl,
              result: { ok: true, funnel: funnelRecord, page: pageRecord },
            },
            traceKey: "direct.context.anchor",
            traceTitle: "Anchor Funnel Builder Context",
            traceArgs: { funnelId: funnelEditorAnchor.funnelId, pageId: funnelEditorAnchor.pageId },
            promptText: preflightPrompt,
            contextActionKey: null,
            suggestionActionKeys: [],
            contextPatch: {
              liveStatus: null,
              lastCanvasUrl: funnelEditorAnchor.canvasUrl,
              lastFunnel: funnelRecord
                ? { id: funnelRecord.id, label: String(funnelRecord.name || funnelRecord.slug || "").trim() || funnelRecord.id }
                : { id: funnelEditorAnchor.funnelId, label: funnelEditorAnchor.funnelId },
              lastFunnelPage: pageRecord
                ? {
                    id: pageRecord.id,
                    label: String(pageRecord.title || pageRecord.slug || "").trim() || pageRecord.id,
                    funnelId: String(pageRecord.funnelId || funnelEditorAnchor.funnelId).trim() || funnelEditorAnchor.funnelId,
                  }
                : { id: funnelEditorAnchor.pageId, label: funnelEditorAnchor.pageId, funnelId: funnelEditorAnchor.funnelId },
            },
          });
          if (anchorResponse) return anchorResponse;
        }

        const currentFunnelPageTarget = signals.shouldUpdateCurrentFunnelPage
          ? extractFunnelBuilderEditorContextFromUrl(contextUrl)
          : null;
        if (currentFunnelPageTarget) {
          const currentPageEditResponse = await runDirectActionPlan({
            action: "funnel_builder.pages.generate_html",
            traceTitle: "Update Funnel Page",
            args: {
              funnelId: currentFunnelPageTarget.funnelId,
              pageId: currentFunnelPageTarget.pageId,
              prompt: preflightPrompt,
            },
          });
          if (currentPageEditResponse) return currentPageEditResponse;
        }

        if (shouldUseRecentHostedPageTarget && recentHostedPageDocument) {
          const service = String(recentHostedPageDocument.service || "").trim().toUpperCase();
          if (service === "BOOKING" || service === "NEWSLETTER" || service === "REVIEWS" || service === "BLOGS") {
            const recentHostedPageResponse = await runDirectActionPlan({
              action: "hosted_pages.documents.generate_html",
              traceTitle: "Generate Hosted Page HTML",
              args: {
                service,
                ...(String(recentHostedPageDocument.pageKey || "").trim() ? { pageKey: String(recentHostedPageDocument.pageKey).trim() } : null),
                prompt: preflightPrompt,
              },
            });
            if (recentHostedPageResponse) return recentHostedPageResponse;
          }
        }

        const bookingSettingsSurfaceUpdate = isBookingSettingsContextUrl(contextUrl)
          ? extractBookingSettingsSurfaceUpdate(preflightPrompt)
          : null;
        if (bookingSettingsSurfaceUpdate && wantsBookingEditorAndLiveLink(preflightPrompt) && !looksLikeConditionalBookingDurationPrompt(preflightPrompt)) {
          const bookingUpdateExec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: "booking.settings.update",
            args: bookingSettingsSurfaceUpdate,
          });
          const bookingSettingsExec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: "booking.settings.get",
            args: {},
          });
          const bookingSiteExec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: "booking.site.get",
            args: {},
          });
          const bookingSettingsUrl = typeof (bookingSettingsExec as any)?.linkUrl === "string"
            ? String((bookingSettingsExec as any).linkUrl).trim()
            : "/portal/app/services/booking/settings";
          const liveBookingUrl = typeof (bookingSiteExec as any)?.linkUrl === "string"
            ? String((bookingSiteExec as any).linkUrl).trim()
            : typeof (bookingSiteExec as any)?.result?.site?.publicUrl === "string"
              ? String((bookingSiteExec as any).result.site.publicUrl).trim()
              : null;
          const updatedTitle = typeof (bookingSettingsExec as any)?.result?.site?.title === "string"
            ? String((bookingSettingsExec as any).result.site.title).trim()
            : bookingSettingsSurfaceUpdate.title || "Booking settings";
          const updatedDuration = Number((bookingSettingsExec as any)?.result?.site?.durationMinutes || bookingSettingsSurfaceUpdate.durationMinutes || 0);
          const assistantText = [
            `I updated the booking settings for “${updatedTitle}.”${Number.isFinite(updatedDuration) && updatedDuration > 0 ? ` The duration is set to ${updatedDuration} minutes.` : ""}`,
            formatAssistantMarkdownLink("Open Booking Settings", bookingSettingsUrl),
            liveBookingUrl ? formatAssistantMarkdownLink("Open Live Booking", liveBookingUrl) : null,
          ].filter(Boolean).join("\n\n");
          const bookingSurfaceResponse = await finalizePreflightResponse({
            exec: {
              ...(bookingUpdateExec as any),
              ok: Boolean((bookingUpdateExec as any)?.ok) && Boolean((bookingSettingsExec as any)?.ok),
              linkUrl: bookingSettingsUrl,
              result: {
                update: (bookingUpdateExec as any)?.result ?? null,
                settings: (bookingSettingsExec as any)?.result ?? null,
                site: (bookingSiteExec as any)?.result ?? null,
              },
              assistantText,
            },
            traceKey: "booking.settings.update",
            traceTitle: "Update Booking Settings",
            traceArgs: bookingSettingsSurfaceUpdate,
            promptText: preflightPrompt,
            suggestionActionKeys: ["booking.settings.update", "booking.settings.get", "booking.site.get"],
          });
          if (bookingSurfaceResponse) return bookingSurfaceResponse;
        }

        const requestedBookingDuration = looksLikeConditionalBookingDurationPrompt(preflightPrompt) && isBookingSettingsContextUrl(contextUrl)
          ? extractRequestedBookingDurationMinutes(preflightPrompt)
          : null;
        if (requestedBookingDuration) {
          const bookingSettingsExec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: "booking.settings.get",
            args: {},
          });
          const currentDuration = Number((bookingSettingsExec as any)?.result?.site?.durationMinutes || 0);
          const bookingSettingsUrl = typeof (bookingSettingsExec as any)?.linkUrl === "string"
            ? String((bookingSettingsExec as any).linkUrl).trim()
            : "/portal/app/services/booking/settings";

          if (Number.isFinite(currentDuration) && currentDuration === requestedBookingDuration) {
            const alreadySetResponse = await finalizePreflightResponse({
              exec: {
                ok: true,
                linkUrl: bookingSettingsUrl,
                result: (bookingSettingsExec as any)?.result,
                assistantText: `I checked your booking settings and the duration is already set to ${requestedBookingDuration} minutes, so I left everything else unchanged.\n\n${formatAssistantMarkdownLink("Open Booking Settings", bookingSettingsUrl)}`,
              },
              traceKey: "booking.settings.get",
              traceTitle: "Verify Booking Duration",
              traceArgs: {},
              promptText: preflightPrompt,
              suggestionActionKeys: ["booking.settings.get"],
            });
            if (alreadySetResponse) return alreadySetResponse;
          }

          const bookingUpdateArgs = { durationMinutes: requestedBookingDuration };
          const bookingUpdateExec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: "booking.settings.update",
            args: bookingUpdateArgs,
          });
          const bookingUpdateUrl = typeof (bookingUpdateExec as any)?.linkUrl === "string"
            ? String((bookingUpdateExec as any).linkUrl).trim()
            : bookingSettingsUrl;
          const bookingUpdateResponse = await finalizePreflightResponse({
            exec: {
              ...(bookingUpdateExec as any),
              linkUrl: bookingUpdateUrl,
              assistantText: `I updated just the booking duration to ${requestedBookingDuration} minutes and left everything else unchanged.\n\n${formatAssistantMarkdownLink("Open Booking Settings", bookingUpdateUrl)}`,
            },
            traceKey: "booking.settings.update",
            traceTitle: "Update Booking Duration",
            traceArgs: bookingUpdateArgs,
            promptText: preflightPrompt,
            suggestionActionKeys: ["booking.settings.update"],
          });
          if (bookingUpdateResponse) return bookingUpdateResponse;
        }

        const newsletterDraftSurfaceRewrite = extractNewsletterDraftSurfaceRewrite(preflightPrompt);
        if (newsletterDraftSurfaceRewrite) {
          const newsletterGetExec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: "newsletter.newsletters.get",
            args: { newsletterId: newsletterDraftSurfaceRewrite.titleHint },
          });
          const existingNewsletter = (newsletterGetExec as any)?.result?.newsletter && typeof (newsletterGetExec as any).result.newsletter === "object"
            ? (newsletterGetExec as any).result.newsletter
            : null;
          const newsletterEditorUrl = typeof (newsletterGetExec as any)?.linkUrl === "string"
            ? String((newsletterGetExec as any).linkUrl).trim()
            : "/portal/app/services/newsletter";

          if (!existingNewsletter) {
            const newsletterMissingResponse = await finalizePreflightResponse({
              exec: {
                ok: false,
                linkUrl: newsletterEditorUrl,
                assistantText: `I couldn’t find the current newsletter draft titled “${newsletterDraftSurfaceRewrite.titleHint}.”\n\n${formatAssistantMarkdownLink("Open Newsletter", newsletterEditorUrl)}`,
              },
              traceKey: "newsletter.newsletters.get",
              traceTitle: "Find Newsletter Draft",
              traceArgs: { newsletterId: newsletterDraftSurfaceRewrite.titleHint },
              promptText: preflightPrompt,
              suggestionActionKeys: ["newsletter.newsletters.get"],
            });
            if (newsletterMissingResponse) return newsletterMissingResponse;
          }

          if (existingNewsletter) {
            const currentTitle = String(existingNewsletter.title || newsletterDraftSurfaceRewrite.titleHint).trim().slice(0, 180) || newsletterDraftSurfaceRewrite.titleHint;
            const rewrittenOpening = await rewriteNewsletterOpeningSection({
              title: currentTitle,
              currentExcerpt: String(existingNewsletter.excerpt || "").trim(),
              currentContent: String(existingNewsletter.content || "").trim(),
              excerpt: newsletterDraftSurfaceRewrite.excerpt,
              audienceHint: newsletterDraftSurfaceRewrite.audienceHint,
              rewriteGoal: newsletterDraftSurfaceRewrite.rewriteGoal,
            });
            const nextContent = replaceNewsletterOpeningSection(String(existingNewsletter.content || "").trim(), rewrittenOpening);
            const updateArgs = {
              newsletterId: String(existingNewsletter.id || newsletterDraftSurfaceRewrite.titleHint).trim(),
              excerpt: newsletterDraftSurfaceRewrite.excerpt,
              content: nextContent,
            };
            const newsletterUpdateExec = await executePortalAgentAction({
              ownerId,
              actorUserId: createdByUserId,
              action: "newsletter.newsletters.update",
              args: updateArgs,
            });
            const updateLinkUrl = typeof (newsletterUpdateExec as any)?.linkUrl === "string"
              ? String((newsletterUpdateExec as any).linkUrl).trim()
              : newsletterEditorUrl;
            const assistantText = [
              `I updated the current draft “${currentTitle}”${newsletterDraftSurfaceRewrite.audienceHint ? ` for ${newsletterDraftSurfaceRewrite.audienceHint}` : ""}. The title stays unchanged, the excerpt is updated, and the newsletter remains in draft status.`,
              formatAssistantMarkdownLink("Open Newsletter", updateLinkUrl),
            ].filter(Boolean).join("\n\n");
            const newsletterSurfaceResponse = await finalizePreflightResponse({
              exec: {
                ...(newsletterUpdateExec as any),
                linkUrl: updateLinkUrl,
                result: {
                  ...((newsletterUpdateExec as any)?.result && typeof (newsletterUpdateExec as any).result === "object" ? (newsletterUpdateExec as any).result : {}),
                  newsletter: {
                    ...existingNewsletter,
                    id: String(existingNewsletter.id || "").trim(),
                    title: currentTitle,
                    excerpt: newsletterDraftSurfaceRewrite.excerpt,
                    content: nextContent,
                    status: typeof existingNewsletter.status === "string" ? String(existingNewsletter.status).trim() : "DRAFT",
                  },
                },
                assistantText,
              },
              traceKey: "newsletter.newsletters.update",
              traceTitle: "Update Newsletter Draft",
              traceArgs: updateArgs,
              promptText: preflightPrompt,
              suggestionActionKeys: ["newsletter.newsletters.get", "newsletter.newsletters.update"],
              contextPatch: {
                lastNewsletter: { id: String(existingNewsletter.id || "").trim(), label: currentTitle },
                lastCanvasUrl: updateLinkUrl,
              },
            });
            if (newsletterSurfaceResponse) return newsletterSurfaceResponse;
          }
        }

        const simpleDirectPlan = shouldBypassSimpleDirectPlan || shouldSkipMutatingDirectPreflight
          ? null
          : getPuraDirectActionPlan({ prompt: preflightPrompt, signals, threadContext: preflightCtx });
        const simpleDirectResponse = await runDirectActionPlan(simpleDirectPlan);
        if (simpleDirectResponse) return simpleDirectResponse;

        const directPrerequisiteMessage = shouldSkipMutatingDirectPreflight ? null : getPuraDirectPrerequisiteMessage({ signals, threadContext: preflightCtx });
        if (directPrerequisiteMessage) {
          const prerequisiteResponse = await finalizePreflightResponse({
            exec: { ok: false, assistantText: directPrerequisiteMessage },
            traceKey: "direct.intent.prerequisite",
            traceTitle: "Direct Intent Prerequisite Check",
            traceArgs: {},
            promptText: preflightPrompt,
            contextActionKey: null,
            suggestionActionKeys: [],
          });
          if (prerequisiteResponse) return prerequisiteResponse;
        }

        if (shouldClarifyContextlessPolishTarget) {
          const clarifyMissingTargetResponse = await finalizePreflightResponse({
            exec: {
              ok: false,
              assistantText:
                "I can do that, but I need the target first. Tell me which page, draft, funnel page, or service area you want cleaned up so I stay on the right surface.",
            },
            traceKey: "direct.intent.prerequisite",
            traceTitle: "Clarify Missing Work Target",
            traceArgs: {},
            promptText: preflightPrompt,
            contextActionKey: null,
            suggestionActionKeys: [],
          });
          if (clarifyMissingTargetResponse) return clarifyMissingTargetResponse;
        }

        if (signals.newsletterCreateTitle) {
          const profile = await prisma.businessProfile.findUnique({
            where: { ownerId },
            select: {
              businessName: true,
              websiteUrl: true,
              industry: true,
              businessModel: true,
              primaryGoals: true,
              targetCustomer: true,
              brandVoice: true,
            },
          }).catch(() => null);
          const primaryGoals = Array.isArray(profile?.primaryGoals)
            ? (profile.primaryGoals as unknown[]).filter((value) => typeof value === "string").map((value) => String(value)).slice(0, 10)
            : undefined;
          const generatedDraft = await generateClientNewsletterDraft({
            kind: "EXTERNAL",
            businessName: profile?.businessName,
            websiteUrl: profile?.websiteUrl,
            industry: profile?.industry,
            businessModel: profile?.businessModel,
            primaryGoals,
            targetCustomer: profile?.targetCustomer,
            brandVoice: profile?.brandVoice,
            topicHint: signals.newsletterCreateTitle,
          }).catch(() => null);

          const createArgs = generatedDraft
            ? {
                kind: "EXTERNAL",
                status: "DRAFT",
                title: generatedDraft.title,
                excerpt: generatedDraft.excerpt,
                content: generatedDraft.content,
                ...(generatedDraft.smsText ? { smsText: generatedDraft.smsText } : {}),
              }
            : {
                kind: "EXTERNAL",
                status: "DRAFT",
                title: signals.newsletterCreateTitle,
                excerpt: `A sharper update focused on ${signals.newsletterCreateTitle}.`,
                content: `## ${signals.newsletterCreateTitle}\n\nThis newsletter draft is ready for refinement and sending.`,
              };
          const createExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "newsletter.newsletters.create", args: createArgs });
          const cta = formatAssistantMarkdownLink("Open Newsletter", typeof (createExec as any)?.linkUrl === "string" ? String((createExec as any).linkUrl).trim() : null);
          const assistantText = `I created a full newsletter draft for “${String(createArgs.title || signals.newsletterCreateTitle).trim()}.”${generatedDraft?.excerpt ? `\n\n${String(generatedDraft.excerpt).trim()}` : ""}${cta ? `\n\n${cta}` : ""}`;
          const newsletterCreateResponse = await finalizePreflightResponse({
            exec: { ...(createExec as any), assistantText },
            traceKey: "newsletter.newsletters.create",
            traceTitle: "Create Newsletter",
            traceArgs: createArgs,
            promptText: preflightPrompt,
          });
          if (newsletterCreateResponse) return newsletterCreateResponse;
        }

        if (signals.blogCreateTitle) {
          const profile = await prisma.businessProfile.findUnique({
            where: { ownerId },
            select: {
              businessName: true,
              websiteUrl: true,
              industry: true,
              businessModel: true,
              primaryGoals: true,
              targetCustomer: true,
              brandVoice: true,
            },
          }).catch(() => null);
          const primaryGoals = Array.isArray(profile?.primaryGoals)
            ? (profile.primaryGoals as unknown[]).filter((value) => typeof value === "string").map((value) => String(value)).slice(0, 10)
            : undefined;
          const draft = await generateClientBlogDraft({
            businessName: profile?.businessName,
            websiteUrl: profile?.websiteUrl,
            industry: profile?.industry,
            businessModel: profile?.businessModel,
            primaryGoals,
            targetCustomer: profile?.targetCustomer,
            brandVoice: profile?.brandVoice,
            topic: signals.blogCreateTitle,
            strictTopicOnly: true,
          }).catch(() => null);
          const createArgs = { title: draft?.title || signals.blogCreateTitle };
          const createExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "blogs.posts.create", args: createArgs });
          const postId = typeof (createExec as any)?.result?.post?.id === "string" ? String((createExec as any).result.post.id).trim() : "";
          if (postId && draft) {
            const updateArgs = {
              postId,
              title: draft.title,
              slug: slugify(draft.title || signals.blogCreateTitle || "blog-post") || "blog-post",
              excerpt: draft.excerpt,
              content: draft.content,
              ...(Array.isArray(draft.seoKeywords) && draft.seoKeywords.length ? { seoKeywords: draft.seoKeywords } : {}),
            };
            const updateExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "blogs.posts.update", args: updateArgs });
            const blogCreateExec = Boolean((updateExec as any)?.ok) ? updateExec : createExec;
            const cta = formatAssistantMarkdownLink("Open Blogs", typeof (blogCreateExec as any)?.linkUrl === "string" ? String((blogCreateExec as any).linkUrl).trim() : null);
            const assistantText = Boolean((updateExec as any)?.ok)
              ? `I created a full blog draft for “${draft.title}.”${draft.excerpt ? `\n\n${draft.excerpt}` : ""}${cta ? `\n\n${cta}` : ""}`
              : "";
            const blogCreateResponse = await finalizePreflightResponse({
              exec: assistantText ? { ...(blogCreateExec as any), assistantText } : blogCreateExec,
              traceKey: Boolean((updateExec as any)?.ok) ? "blogs.posts.update" : "blogs.posts.create",
              traceTitle: "Create Blog Draft",
              traceArgs: Boolean((updateExec as any)?.ok) ? updateArgs : createArgs,
              promptText: preflightPrompt,
            });
            if (blogCreateResponse) return blogCreateResponse;
          }
        }

        if (shouldRunPreflightReviewSummary || preflightReviewDetailName) {
          const reviewsExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "reviews.inbox.list", args: {} });
          const reviews = Array.isArray((reviewsExec as any)?.result?.reviews) ? ((reviewsExec as any).result.reviews as any[]) : [];
          const cta = formatAssistantMarkdownLink("Open Reviews", typeof (reviewsExec as any)?.linkUrl === "string" ? String((reviewsExec as any).linkUrl).trim() : null);

          if (preflightReviewDetailName) {
            const normalizeMatch = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
            const queryNorm = normalizeMatch(preflightReviewDetailName);
            const bestReview = reviews
              .map((review) => {
                const nameNorm = normalizeMatch(review?.name);
                const score = nameNorm === queryNorm ? 100 : nameNorm.startsWith(queryNorm) ? 80 : nameNorm.includes(queryNorm) ? 60 : 0;
                return { review, score };
              })
              .sort((left, right) => right.score - left.score)[0]?.review;
            const assistantText = bestReview
              ? buildReviewDetailAssistantText(bestReview, typeof (reviewsExec as any)?.linkUrl === "string" ? String((reviewsExec as any).linkUrl).trim() : null)
              : `I couldn’t find a review from “${preflightReviewDetailName}.”${cta ? `\n\n${cta}` : ""}`;
            const reviewDetailResponse = await finalizePreflightResponse({
              exec: { ...(reviewsExec as any), assistantText },
              traceKey: "reviews.inbox.list",
              traceTitle: bestReview ? "Show Review Details" : "Find Review",
              traceArgs: {},
              promptText: preflightPrompt,
            });
            if (reviewDetailResponse) return reviewDetailResponse;
          }

          if (shouldRunPreflightReviewSummary) {
            const topReviews = reviews.slice(0, 3).map((review) => {
              const name = String(review?.name || "Review").trim() || "Review";
              const rating = Number(review?.rating || 0);
              const body = typeof review?.body === "string" ? String(review.body).trim().replace(/\s+/g, " ").slice(0, 140) : "";
              const hasReply = typeof review?.businessReply === "string" && String(review.businessReply).trim().length > 0;
              return `- ${name}${rating ? ` - ${rating}/5` : ""}${body ? ` - ${body}` : ""}${hasReply ? " - reply posted" : " - needs reply"}`;
            });
            const averageRating = reviews.length
              ? (reviews.reduce((sum, review) => sum + Number(review?.rating || 0), 0) / reviews.length).toFixed(1)
              : null;
            const assistantText = reviews.length
              ? `Here’s a quick review summary from the latest feedback:\n\n${topReviews.join("\n")}${averageRating ? `\n\nAverage rating: ${averageRating}/5` : ""}${cta ? `\n\n${cta}` : ""}`
              : `You don’t have any reviews to summarize right now.${cta ? `\n\n${cta}` : ""}`;
            const reviewSummaryResponse = await finalizePreflightResponse({
              exec: { ...(reviewsExec as any), assistantText },
              traceKey: "reviews.inbox.list",
              traceTitle: "Summarize Reviews",
              traceArgs: {},
              promptText: preflightPrompt,
            });
            if (reviewSummaryResponse) return reviewSummaryResponse;
          }
        }

        if (!shouldRunPreflightCrossSurfaceNextSteps && (shouldRunPreflightReceptionist || shouldRunPreflightReceptionistPeople)) {
          const [receptionistSettingsExec, receptionistHighlightsExec] = await Promise.all([
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "ai_receptionist.settings.get", args: {} }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "ai_receptionist.highlights.get", args: { lookbackHours: 24 * 7, limit: 20 } }),
          ]);
          const receptionistEvents = Array.isArray((receptionistSettingsExec as any)?.result?.events)
            ? ((receptionistSettingsExec as any).result.events as any[])
            : [];
          const receptionistLinkUrl = typeof (receptionistSettingsExec as any)?.linkUrl === "string"
            ? String((receptionistSettingsExec as any).linkUrl).trim()
            : typeof (receptionistHighlightsExec as any)?.linkUrl === "string"
              ? String((receptionistHighlightsExec as any).linkUrl).trim()
              : null;
          const assistantText = shouldRunPreflightReceptionistPeople
            ? buildReceptionistRecentPeopleAssistantText(receptionistEvents, receptionistLinkUrl)
            : buildReceptionistSummaryAssistantText((receptionistHighlightsExec as any)?.result, receptionistEvents, receptionistLinkUrl);
          const receptionistResponse = await finalizePreflightResponse({
            exec: { ok: Boolean((receptionistSettingsExec as any)?.ok) || Boolean((receptionistHighlightsExec as any)?.ok), linkUrl: receptionistLinkUrl, assistantText },
            traceKey: shouldRunPreflightReceptionistPeople ? "ai_receptionist.settings.get" : "ai_receptionist.highlights.get",
            traceTitle: shouldRunPreflightReceptionistPeople ? "Show Recent AI Receptionist Callers" : "Summarize AI Receptionist Calls",
            traceArgs: shouldRunPreflightReceptionistPeople ? {} : { lookbackHours: 24 * 7, limit: 20 },
            promptText: preflightPrompt,
            contextActionKey: null,
            suggestionActionKeys: ["ai_receptionist.settings.get", "ai_receptionist.highlights.get"],
          });
          if (receptionistResponse) return receptionistResponse;
        }

        if (shouldRunPreflightWorkSummary) {
          const inboxArgs = { channel: "ALL", take: 20, allChannels: true, needsReply: true };
          const taskArgs = { status: "ALL", limit: 10 };
          const [inboxExec, taskExec] = await Promise.all([
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "inbox.threads.list", args: inboxArgs }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "tasks.list", args: taskArgs }),
          ]);
          const threads = Array.isArray((inboxExec as any)?.result?.threads) ? ((inboxExec as any).result.threads as any[]) : [];
          const tasks = Array.isArray((taskExec as any)?.result?.tasks) ? ((taskExec as any).result.tasks as any[]) : [];
          const assistantText = buildWorkSummaryAssistantText(
            threads,
            tasks,
            typeof (inboxExec as any)?.linkUrl === "string" ? String((inboxExec as any).linkUrl).trim() : null,
            typeof (taskExec as any)?.linkUrl === "string" ? String((taskExec as any).linkUrl).trim() : null,
          );
          const workSummaryResponse = await finalizePreflightResponse({
            exec: { ok: Boolean((inboxExec as any)?.ok) || Boolean((taskExec as any)?.ok), linkUrl: (inboxExec as any)?.linkUrl, assistantText },
            traceKey: "inbox.threads.list",
            traceTitle: "Summarize Tasks and Inbox",
            traceArgs: inboxArgs,
            promptText: preflightPrompt,
            contextActionKey: null,
            suggestionActionKeys: ["inbox.threads.list", "tasks.list"],
          });
          if (workSummaryResponse) return workSummaryResponse;
        }

        if (shouldRunPreflightCrossSurfaceNextSteps) {
          const inboxArgs = { channel: "ALL", take: 10, allChannels: true, needsReply: true };
          const taskArgs = { status: "ALL", limit: 10 };
          const [inboxExec, taskExec, contactsExec, reviewsExec, receptionistHighlightsExec] = await Promise.all([
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "inbox.threads.list", args: inboxArgs }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "tasks.list", args: taskArgs }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "contacts.list", args: { limit: 5 } }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "reviews.inbox.list", args: {} }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "ai_receptionist.highlights.get", args: { lookbackHours: 24 * 7, limit: 20 } }),
          ]);
          const assistantText = buildCrossSurfaceNextStepsAssistantText({
            threads: Array.isArray((inboxExec as any)?.result?.threads) ? ((inboxExec as any).result.threads as any[]) : [],
            tasks: Array.isArray((taskExec as any)?.result?.tasks) ? ((taskExec as any).result.tasks as any[]) : [],
            contacts: Array.isArray((contactsExec as any)?.result?.contacts) ? ((contactsExec as any).result.contacts as any[]) : [],
            reviews: Array.isArray((reviewsExec as any)?.result?.reviews) ? ((reviewsExec as any).result.reviews as any[]) : [],
            receptionistHighlights: (receptionistHighlightsExec as any)?.result,
            inboxUrl: typeof (inboxExec as any)?.linkUrl === "string" ? String((inboxExec as any).linkUrl).trim() : null,
            tasksUrl: typeof (taskExec as any)?.linkUrl === "string" ? String((taskExec as any).linkUrl).trim() : null,
            contactsUrl: typeof (contactsExec as any)?.linkUrl === "string" ? String((contactsExec as any).linkUrl).trim() : null,
            reviewsUrl: typeof (reviewsExec as any)?.linkUrl === "string" ? String((reviewsExec as any).linkUrl).trim() : null,
            receptionistUrl: typeof (receptionistHighlightsExec as any)?.linkUrl === "string" ? String((receptionistHighlightsExec as any).linkUrl).trim() : null,
          });
          const nextStepsResponse = await finalizePreflightResponse({
            exec: { ok: true, linkUrl: (inboxExec as any)?.linkUrl, assistantText },
            traceKey: "inbox.threads.list",
            traceTitle: "Recommend Next Actions",
            traceArgs: inboxArgs,
            promptText: preflightPrompt,
            contextActionKey: null,
            suggestionActionKeys: ["inbox.threads.list", "tasks.list", "contacts.list", "reviews.inbox.list", "ai_receptionist.highlights.get"],
          });
          if (nextStepsResponse) return nextStepsResponse;
        }

        if (preflightContactDetailName) {
          const listArgs = { q: preflightContactDetailName, limit: 5 };
          const contactListExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "contacts.list", args: listArgs });
          const contacts = Array.isArray((contactListExec as any)?.result?.contacts) ? ((contactListExec as any).result.contacts as any[]) : [];
          const normalizeMatch = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          const queryNorm = normalizeMatch(preflightContactDetailName);
          const bestContact = contacts
            .map((contact) => {
              const nameNorm = normalizeMatch(contact?.name);
              const emailNorm = normalizeMatch(contact?.email);
              const phoneNorm = normalizeMatch(contact?.phone);
              const score = nameNorm === queryNorm ? 100 : nameNorm.startsWith(queryNorm) ? 80 : nameNorm.includes(queryNorm) ? 60 : emailNorm.includes(queryNorm) || phoneNorm.includes(queryNorm) ? 40 : 0;
              return { contact, score };
            })
            .sort((left, right) => right.score - left.score)[0]?.contact;
          const contactId = typeof bestContact?.id === "string" ? String(bestContact.id).trim() : "";

          if (contactId) {
            const detailArgs = { contactId };
            const contactExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "contacts.get", args: detailArgs });
            const assistantText = buildContactDetailAssistantText(
              (contactExec as any)?.result?.contact,
              typeof (contactExec as any)?.linkUrl === "string" ? String((contactExec as any).linkUrl).trim() : null,
              preflightContactDetailName,
            );
            if (assistantText) {
              const contactResponse = await finalizePreflightResponse({
                exec: { ...(contactExec as any), assistantText },
                traceKey: "contacts.get",
                traceTitle: "Show Contact Details",
                traceArgs: detailArgs,
                promptText: preflightPrompt,
              });
              if (contactResponse) return contactResponse;
            }
          }

          const inboxFallbackArgs = { channel: "ALL", q: preflightContactDetailName, take: 5, allChannels: true };
          const inboxFallbackExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "inbox.threads.list", args: inboxFallbackArgs });
          const fallbackThreads = Array.isArray((inboxFallbackExec as any)?.result?.threads) ? ((inboxFallbackExec as any).result.threads as any[]) : [];
          const fallbackThread = fallbackThreads[0] || null;
          const fallbackThreadContactId = typeof fallbackThread?.contact?.id === "string"
            ? String(fallbackThread.contact.id).trim()
            : typeof fallbackThread?.contactId === "string"
              ? String(fallbackThread.contactId).trim()
              : "";

          if (fallbackThreadContactId) {
            const detailArgs = { contactId: fallbackThreadContactId };
            const contactExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "contacts.get", args: detailArgs });
            const assistantText = buildContactDetailAssistantText(
              (contactExec as any)?.result?.contact,
              typeof (contactExec as any)?.linkUrl === "string" ? String((contactExec as any).linkUrl).trim() : null,
              preflightContactDetailName,
            );
            if (assistantText) {
              const contactResponse = await finalizePreflightResponse({
                exec: { ...(contactExec as any), assistantText },
                traceKey: "contacts.get",
                traceTitle: "Show Contact Details",
                traceArgs: detailArgs,
                promptText: preflightPrompt,
              });
              if (contactResponse) return contactResponse;
            }
          }

          if (fallbackThread) {
            const assistantText = buildInboxBackedContactAssistantText(
              preflightContactDetailName,
              fallbackThread,
              typeof (inboxFallbackExec as any)?.linkUrl === "string" ? String((inboxFallbackExec as any).linkUrl).trim() : null,
            );
            if (assistantText) {
              const inboxFallbackResponse = await finalizePreflightResponse({
                exec: { ...(inboxFallbackExec as any), assistantText },
                traceKey: "inbox.threads.list",
                traceTitle: "Find Contact Activity",
                traceArgs: inboxFallbackArgs,
                promptText: preflightPrompt,
                contextActionKey: null,
                suggestionActionKeys: [],
              });
              if (inboxFallbackResponse) return inboxFallbackResponse;
            }
          }

          const fallbackAssistantText = contacts.length
            ? `I found ${contacts.length} contact${contacts.length === 1 ? "" : "s"} matching “${preflightContactDetailName}”, but I need a more exact match to show one contact’s full details.${typeof (contactListExec as any)?.linkUrl === "string" ? ` Review them here: [Open Contacts](${String((contactListExec as any).linkUrl).trim()}).` : ""}`
            : `I couldn’t find a contact matching “${preflightContactDetailName}”.${typeof (contactListExec as any)?.linkUrl === "string" ? ` Review contacts here: [Open Contacts](${String((contactListExec as any).linkUrl).trim()}).` : ""}`;
          const fallbackResponse = await finalizePreflightResponse({
            exec: { ...(contactListExec as any), assistantText: fallbackAssistantText },
            traceKey: "contacts.list",
            traceTitle: "Find Contact",
            traceArgs: listArgs,
            promptText: preflightPrompt,
          });
          if (fallbackResponse) return fallbackResponse;
        }

        if (preflightTaskLookupQuery) {
          const taskArgs = { status: "ALL", q: preflightTaskLookupQuery, limit: 10 };
          const taskExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "tasks.list", args: taskArgs });
          const tasks = Array.isArray((taskExec as any)?.result?.tasks) ? ((taskExec as any).result.tasks as any[]) : [];
          const assistantText = buildTaskLookupAssistantText(preflightTaskLookupQuery, tasks, typeof (taskExec as any)?.linkUrl === "string" ? String((taskExec as any).linkUrl).trim() : null);
          if (assistantText) {
            const taskResponse = await finalizePreflightResponse({
              exec: { ...(taskExec as any), assistantText },
              traceKey: "tasks.list",
              traceTitle: "Find Task",
              traceArgs: taskArgs,
              promptText: preflightPrompt,
            });
            if (taskResponse) return taskResponse;
          }
        }

        if (draftInboxReplyIntent) {
          const searchArgs = {
            channel: preflightInboxSearchChannel || "ALL",
            q: preflightInboxSearchQuery || draftInboxReplyIntent.contactName,
            take: 10,
            allChannels: !preflightInboxSearchChannel || preflightInboxSearchChannel === "ALL",
          };
          const threadListExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "inbox.threads.list", args: searchArgs });
          const threads = Array.isArray((threadListExec as any)?.result?.threads) ? ((threadListExec as any).result.threads as any[]) : [];
          const topicTokens = String(draftInboxReplyIntent.topicHint || "")
            .toLowerCase()
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 3)
            .slice(0, 8);
          const scoredThreads = threads
            .map((thread) => {
              const haystack = [thread?.subject, thread?.lastMessagePreview, thread?.contact?.name, thread?.peerAddress].join("\n").toLowerCase();
              const score = topicTokens.reduce((sum, token) => (haystack.includes(token) ? sum + 1 : sum), 0);
              return { thread, score };
            })
            .sort((left, right) => right.score - left.score);
          const chosenThreadId = typeof scoredThreads[0]?.thread?.id === "string" ? String(scoredThreads[0].thread.id).trim() : "";

          if (!chosenThreadId) {
            const draftReplyResponse = await finalizePreflightResponse({
              exec: {
                ok: false,
                assistantText: `I couldn’t find a recent inbox conversation for ${draftInboxReplyIntent.contactName} to draft from yet. If you want, I can help once that thread is in the inbox or you can point me to the exact conversation.`,
              },
              traceKey: "inbox.threads.list",
              traceTitle: "Find Inbox Conversation",
              traceArgs: searchArgs,
              promptText: preflightPrompt,
              contextActionKey: null,
              suggestionActionKeys: [],
            });
            if (draftReplyResponse) return draftReplyResponse;
          }

          const messagesExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "inbox.thread.messages.list", args: { threadId: chosenThreadId, take: 20 } });
          const threadMessages = Array.isArray((messagesExec as any)?.result?.messages) ? ((messagesExec as any).result.messages as any[]) : [];

          if (threadMessages.length) {
            let draftAssistantText = "";
            try {
              draftAssistantText = stripEmptyAssistantBullets(
                String(
                  await generateText({
                    system: [
                      "You are Pura, an AI assistant inside a SaaS portal.",
                      "The user asked for a draft reply only.",
                      "Write a message draft they could send based on the conversation context.",
                      "Hard constraints:",
                      "- DO NOT claim the message was sent.",
                      "- DO NOT ask for confirmation to send.",
                      "- DO NOT invent facts not present in the thread or user request.",
                      "Formatting rules:",
                      "- Start with a single short lead-in sentence like 'Here’s a draft reply you can send.'",
                      "- Then provide the draft message in plain text.",
                      "- No headings, bullet lists, JSON, or fake links.",
                    ].join("\n"),
                    user: `User request:\n${preflightPrompt}\n\nDraft target:\n${JSON.stringify(draftInboxReplyIntent, null, 2)}\n\nRecent thread messages (JSON):\n${JSON.stringify(threadMessages.slice(-8), null, 2)}`,
                  }),
                ),
              );
            } catch {
              draftAssistantText = "";
            }

            if (draftAssistantText.trim()) {
              const draftReplyResponse = await finalizePreflightResponse({
                exec: { ok: true, assistantText: draftAssistantText, result: { messages: threadMessages } },
                traceKey: "inbox.thread.messages.list",
                traceTitle: "Draft Inbox Reply",
                traceArgs: { threadId: chosenThreadId, take: 20 },
                promptText: preflightPrompt,
                contextActionKey: null,
                suggestionActionKeys: [],
              });
              if (draftReplyResponse) return draftReplyResponse;
            }
          }
        }

        if (shouldTightenLatestNewsletter && preflightCtx?.lastNewsletter?.id) {
          const newsletterId = String(preflightCtx.lastNewsletter.id).trim();
          const getArgs = { newsletterId };
          const current = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "newsletter.newsletters.get", args: getArgs });
          const existing = current?.result?.newsletter && typeof current.result.newsletter === "object" ? current.result.newsletter : null;
          const title = String(existing?.title || preflightCtx?.lastNewsletter?.label || "Newsletter").trim().slice(0, 180) || "Newsletter";
          const profile = await prisma.businessProfile.findUnique({
            where: { ownerId },
            select: {
              businessName: true,
              websiteUrl: true,
              industry: true,
              businessModel: true,
              primaryGoals: true,
              targetCustomer: true,
              brandVoice: true,
            },
          }).catch(() => null);
          const primaryGoals = Array.isArray(profile?.primaryGoals)
            ? (profile.primaryGoals as unknown[]).filter((value) => typeof value === "string").map((value) => String(value)).slice(0, 10)
            : undefined;
          const generatedDraft = await generateClientNewsletterDraft({
            kind: "EXTERNAL",
            businessName: profile?.businessName,
            websiteUrl: profile?.websiteUrl,
            industry: profile?.industry,
            businessModel: profile?.businessModel,
            primaryGoals,
            targetCustomer: profile?.targetCustomer,
            brandVoice: profile?.brandVoice,
            topicHint: `${title} - sharpen this draft`,
            promptAnswers: {
              currentExcerpt: String(existing?.excerpt || "").slice(0, 1200),
              currentContent: String(existing?.content || "").slice(0, 6000),
              rewriteGoal: preflightPrompt,
            },
          }).catch(() => null);
          const updateArgs = generatedDraft
            ? {
                newsletterId,
                title: generatedDraft.title,
                excerpt: generatedDraft.excerpt,
                content: generatedDraft.content,
                ...(generatedDraft.smsText ? { smsText: generatedDraft.smsText } : {}),
              }
            : {
                newsletterId,
                title,
                excerpt: `A sharper, more compelling opener for ${title}.`,
                content: String(existing?.content || `## ${title}\n\nThis version has a stronger hook, clearer promise, and a tighter introduction for conversion.`).trim().slice(0, 200000),
              };
          const updateExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "newsletter.newsletters.update", args: updateArgs });
          const newsletterCta = formatAssistantMarkdownLink("Open Newsletter", typeof (updateExec as any)?.linkUrl === "string" ? String((updateExec as any).linkUrl).trim() : null);
          const newsletterAssistantText = `I tightened the newsletter “${String(updateArgs.title || title).trim()}.”${generatedDraft?.excerpt ? `\n\n${String(generatedDraft.excerpt).trim()}` : ""}${newsletterCta ? `\n\n${newsletterCta}` : ""}`;
          const updateResponse = await finalizePreflightResponse({ exec: { ...(updateExec as any), assistantText: newsletterAssistantText }, traceKey: "newsletter.newsletters.update", traceTitle: "Update Newsletter", traceArgs: updateArgs, promptText: preflightPrompt });
          if (updateResponse) return updateResponse;
        }

        if (shouldPolishLatestBlog && preflightCtx?.lastBlogPost?.id) {
          const polishArgs = {
            postId: String(preflightCtx.lastBlogPost.id).trim(),
            prompt: `Rewrite and strengthen this blog draft so it sounds sharper, more premium, and more persuasive while keeping the same core topic. User request: ${preflightPrompt}`,
          };
          const polishExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "blogs.posts.generate_draft", args: polishArgs });
          const draft = (polishExec as any)?.result?.draft && typeof (polishExec as any).result.draft === "object" ? (polishExec as any).result.draft : null;
          if (draft) {
            const updateArgs = {
              postId: polishArgs.postId,
              title: String(draft.title || preflightCtx?.lastBlogPost?.label || "Blog Post").trim(),
              slug: slugify(String(draft.title || preflightCtx?.lastBlogPost?.label || "blog-post").trim() || "blog-post") || "blog-post",
              excerpt: String(draft.excerpt || "").trim(),
              content: String(draft.content || "").trim(),
              ...(Array.isArray(draft.seoKeywords) && draft.seoKeywords.length ? { seoKeywords: draft.seoKeywords } : {}),
            };
            const updateExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "blogs.posts.update", args: updateArgs });
            const blogCta = formatAssistantMarkdownLink("Open Blogs", typeof (updateExec as any)?.linkUrl === "string" ? String((updateExec as any).linkUrl).trim() : null);
            const blogAssistantText = Boolean((updateExec as any)?.ok)
              ? `I strengthened the blog draft${draft.title ? ` “${String(draft.title).trim()}”` : ""}.${draft.excerpt ? `\n\n${String(draft.excerpt).trim()}` : ""}${blogCta ? `\n\n${blogCta}` : ""}`
              : "";
            const polishResponse = await finalizePreflightResponse({ exec: blogAssistantText ? { ...(updateExec as any), assistantText: blogAssistantText } : updateExec, traceKey: "blogs.posts.update", traceTitle: "Polish Blog Draft", traceArgs: updateArgs, promptText: preflightPrompt });
            if (polishResponse) return polishResponse;
          }
          const polishResponse = await finalizePreflightResponse({ exec: polishExec, traceKey: "blogs.posts.generate_draft", traceTitle: "Polish Blog Draft", traceArgs: polishArgs, promptText: preflightPrompt });
          if (polishResponse) return polishResponse;
        }

        if (reviewReplyIntent) {
          const reviewName = String(reviewReplyIntent.reviewName || "").trim();
          const replyText = String(reviewReplyIntent.replyText || "").trim();
          const reviewsExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "reviews.inbox.list", args: {} });
          const reviews = Array.isArray(reviewsExec?.result?.reviews) ? (reviewsExec.result.reviews as any[]) : [];
          const match = reviews.find((review) => String(review?.name || "").toLowerCase().includes(reviewName.toLowerCase()));
          const reviewId = typeof match?.id === "string" ? String(match.id).trim() : "";
          if (reviewId && replyText) {
            const replyArgs = { reviewId, reply: replyText };
            const replyExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "reviews.reply", args: replyArgs });
            const replyResponse = await finalizePreflightResponse({ exec: replyExec, traceKey: "reviews.reply", traceTitle: "Reply to Review", traceArgs: replyArgs, promptText: preflightPrompt });
            if (replyResponse) return replyResponse;
          }
        }

        if (shouldSetWeekdayAvailability) {
          const bookingSite = await (prisma as any).portalBookingSite.findUnique({ where: { ownerId }, select: { timeZone: true } }).catch(() => null);
          const timeZone = typeof bookingSite?.timeZone === "string" && bookingSite.timeZone.trim() ? String(bookingSite.timeZone).trim() : "America/Chicago";
          const startDate = new Date();
          const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60_000);
          const formatDate = (value: Date) => value.toISOString().slice(0, 10);
          const availabilityArgs = {
            startDateLocal: formatDate(startDate),
            endDateLocal: formatDate(endDate),
            startTimeLocal: "9:00",
            endTimeLocal: "17:00",
            timeZone,
            isoWeekdays: [1, 2, 3, 4, 5],
            replaceExisting: true,
          };
          const availabilityExec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "booking.availability.set_daily", args: availabilityArgs });
          const availabilityResponse = await finalizePreflightResponse({ exec: availabilityExec, traceKey: "booking.availability.set_daily", traceTitle: "Set Booking Availability", traceArgs: availabilityArgs, promptText: preflightPrompt });
          if (availabilityResponse) return availabilityResponse;
        }

        if (shouldAssessCrossSurfaceReadiness) {
          const [newslettersExec, blogsExec, nurtureExec, funnelsExec, mediaExec, reviewsExec, bookingSiteExec, slotsExec, leadsExec] = await Promise.all([
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "newsletter.newsletters.list", args: { take: 5 } }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "blogs.posts.list", args: { take: 5 } }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "nurture.campaigns.list", args: { take: 5 } }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "funnel_builder.funnels.list", args: {} }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "media.items.list", args: { limit: 5 } }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "reviews.inbox.list", args: {} }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "booking.site.get", args: {} }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "booking.suggestions.slots", args: { days: 7, limit: 5 } }),
            executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "lead_scraping.leads.list", args: { take: 5 } }),
          ]);

          const funnels = Array.isArray((funnelsExec as any)?.result?.funnels) ? ((funnelsExec as any).result.funnels as any[]) : [];
          const latestFunnelId = typeof funnels[0]?.id === "string" ? String(funnels[0].id).trim() : "";
          const pagesExec = latestFunnelId
            ? await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: "funnel_builder.pages.list", args: { funnelId: latestFunnelId } })
            : null;
          const pages = Array.isArray((pagesExec as any)?.result?.pages) ? ((pagesExec as any).result.pages as any[]) : [];

          const newsletters = Array.isArray((newslettersExec as any)?.result?.newsletters) ? ((newslettersExec as any).result.newsletters as any[]) : [];
          const blogs = Array.isArray((blogsExec as any)?.result?.posts) ? ((blogsExec as any).result.posts as any[]) : [];
          const campaigns = Array.isArray((nurtureExec as any)?.result?.campaigns) ? ((nurtureExec as any).result.campaigns as any[]) : [];
          const mediaItems = Array.isArray((mediaExec as any)?.result?.items) ? ((mediaExec as any).result.items as any[]) : [];
          const reviews = Array.isArray((reviewsExec as any)?.result?.reviews) ? ((reviewsExec as any).result.reviews as any[]) : [];
          const slots = Array.isArray((slotsExec as any)?.result?.slots) ? ((slotsExec as any).result.slots as any[]) : [];
          const leads = Array.isArray((leadsExec as any)?.result?.leads) ? ((leadsExec as any).result.leads as any[]) : [];
          const bookingSite = (bookingSiteExec as any)?.result?.site ?? null;

          const strengths: string[] = [];
          const weakSpots: string[] = [];
          if (newsletters.length) strengths.push(`newsletters are present (${newsletters.length} recent item${newsletters.length === 1 ? "" : "s"})`);
          else weakSpots.push("newsletters still look empty");
          if (blogs.length) strengths.push(`blogs are present (${blogs.length} recent post${blogs.length === 1 ? "" : "s"})`);
          else weakSpots.push("blogs still look empty");
          if (campaigns.length) strengths.push(`nurture campaigns exist (${campaigns.length})`);
          else weakSpots.push("nurture campaigns still look empty");
          if (reviews.length) strengths.push(`reviews are populated (${reviews.length})`);
          else weakSpots.push("reviews look sparse");
          if (leads.length) strengths.push(`lead scraping has captured leads (${leads.length})`);
          else weakSpots.push("lead scraping results are thin");
          if (mediaItems.length) strengths.push(`media library has assets (${mediaItems.length} sampled)`);
          else weakSpots.push("media library still looks underfilled");
          if (!bookingSite) weakSpots.push("booking site details are incomplete");
          if (!slots.length) weakSpots.push("booking availability still does not yield suggested slots this week");
          if (!funnels.length) weakSpots.push("no funnel exists yet");
          else if (!pages.length) weakSpots.push("the funnel exists but still needs at least one usable page/layout");
          else strengths.push(`funnel builder has ${funnels.length} funnel${funnels.length === 1 ? "" : "s"} and ${pages.length} page${pages.length === 1 ? "" : "s"} on the latest funnel`);

          const assistantText = [
            "Here’s the current readiness read from the live demo account:",
            strengths.length ? `Strongest areas: ${strengths.join("; ")}.` : "I do not yet see strong completed areas across the major surfaces.",
            weakSpots.length ? `Still weak or incomplete: ${weakSpots.join("; ")}.` : "I do not see any obvious weak spots in the sampled surfaces.",
            weakSpots.length ? "If you want, I can keep hardening the weakest remaining area first." : "This looks much closer to production-ready across the sampled surfaces.",
          ].join("\n\n");

          const crossSurfaceResponse = await finalizePreflightResponse({
            exec: { ok: true, assistantText },
            traceKey: "newsletter.newsletters.list",
            traceTitle: "Assess Demo Readiness",
            traceArgs: { take: 5 },
            promptText: preflightPrompt,
          });
          if (crossSurfaceResponse) return crossSurfaceResponse;
        }

        const preflightAction = preflightSmsThreadMatch
          ? {
              action: "inbox.threads.list" as PortalAgentActionKey,
              title: "Find SMS Thread",
              args: { channel: "SMS", q: preflightSmsThreadMatch.trim() || preflightPrompt, take: 10 },
            }
          : preflightInboxSearchQuery
            ? {
                action: "inbox.threads.list" as PortalAgentActionKey,
                title: "Find Inbox Thread",
                args: {
                  channel: preflightInboxSearchChannel || "ALL",
                  q: preflightInboxSearchQuery,
                  take: 10,
                  allChannels: !preflightInboxSearchChannel || preflightInboxSearchChannel === "ALL",
                },
              }
          : shouldRunPreflightInboxSummary
            ? {
                action: "inbox.threads.list" as PortalAgentActionKey,
                title: "Summarize Inbox",
                args: { channel: "ALL", take: 20, allChannels: true, needsReply: true },
              }
            : shouldRunPreflightReceptionist
              ? {
                  action: "ai_receptionist.highlights.get" as PortalAgentActionKey,
                  title: "Summarize AI Receptionist Calls",
                  args: { lookbackHours: 24 * 7, limit: 20 },
                }
              : null;

        if (preflightAction) {
          let preflightExec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: preflightAction.action,
            args: preflightAction.args as Record<string, unknown>,
          });
          let traceKey = preflightAction.action;
          let traceTitle = preflightAction.title;

          if (preflightSmsThreadMatch && Boolean((preflightExec as any)?.ok)) {
            const threads = Array.isArray((preflightExec as any)?.result?.threads) ? ((preflightExec as any).result.threads as any[]) : [];
            const firstThreadId = typeof threads[0]?.id === "string" ? String(threads[0].id).trim() : "";
            if (firstThreadId) {
              const secondExec = await executePortalAgentAction({
                ownerId,
                actorUserId: createdByUserId,
                action: "inbox.thread.messages.list",
                args: { threadId: firstThreadId, take: 20, channel: "SMS" },
              });
              if ((secondExec as any)?.ok || typeof (secondExec as any)?.assistantText === "string" || Array.isArray((secondExec as any)?.result?.messages)) {
                preflightExec = secondExec as any;
                traceKey = "inbox.thread.messages.list";
                traceTitle = "Summarize SMS Thread";
              }
            }
          }

          const preflightAssistantText = typeof (preflightExec as any)?.assistantText === "string" ? String((preflightExec as any).assistantText).trim() : "";
          if (preflightAssistantText) {
            const preflightResponse = await finalizePreflightResponse({
              exec: preflightExec,
              traceKey,
              traceTitle,
              traceArgs: preflightAction.args as Record<string, unknown>,
              promptText: preflightPrompt,
            });
            if (preflightResponse) return preflightResponse;
          }
        }
      }

      const unresolvedRunForPlanning = normalizeUnresolvedRun(
        threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any).unresolvedRun : null,
      );
      const nextStepContextForPlanningBase = normalizeNextStepContext(
        threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any).nextStepContext : null,
      );
      const continuationIntent = Boolean((unresolvedRunForPlanning || nextStepContextForPlanningBase) && hasNewUserText && looksLikeContinuationRequest(effectiveText));
      const nextStepContextForPlanning = continuationIntent
        ? nextStepContextForContinuationPrompt(effectiveText, nextStepContextForPlanningBase)
        : nextStepContextForPlanningBase;
      const recentRunContinuityForPlanning = continuationIntent ? await loadRecentRunContinuity() : null;

      // --- ChatGPT wrapper loop ---
      // 1) If we previously asked a question to run a specific action, try to continue that now.
      if (pendingAction && !isConfirmOnly && (hasNewUserText || didClickChoice)) {
        if (await checkInterruptRequested()) {
          return await buildStoppedAssistantMessage(responseUserMessage);
        }
        const actionKey = String((pendingAction as any)?.key || "").trim();
        const title = String((pendingAction as any)?.title || actionKey).trim().slice(0, 160) || actionKey;
        const argsRaw = (pendingAction as any)?.args && typeof (pendingAction as any).args === "object" && !Array.isArray((pendingAction as any).args)
          ? ((pendingAction as any).args as Record<string, unknown>)
          : {};

        const keyParsed = PortalAgentActionKeySchema.safeParse(actionKey);
        if (keyParsed.success) {
          threadContext = await persistLiveStatus(
            { phase: "resolving", label: `Resolving ${title || keyParsed.data}`, actionKey: keyParsed.data, title, completedSteps: 0 },
            threadContext,
          );
          if (await checkInterruptRequested()) {
            return await buildStoppedAssistantMessage(responseUserMessage);
          }
          const resolved = await resolvePlanArgs({
            ownerId,
            stepKey: keyParsed.data,
            args: argsRaw,
            userHint: effectiveText,
            url: contextUrl,
            threadContext,
          });

          if (!resolved.ok) {
            const clarifyChoices = Array.isArray((resolved as any).choices) ? ((resolved as any).choices as any[]) : null;
            const rawClarifyPrompt = String(resolved.clarifyQuestion || "").trim();
            let clarifyText = "";
            try {
              const prevCtx = threadContext;
              const summary =
                prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx) && typeof (prevCtx as any).threadSummary === "string"
                  ? String((prevCtx as any).threadSummary || "").trim().slice(0, 1200)
                  : "";

              clarifyText = String(
                await generateText({
                  system: [
                    "You are Pura, an AI assistant inside a SaaS portal.",
                    "You need ONE clarifying question so you can run the requested action.",
                    "Write a single short question.",
                    "Rules:",
                    "- Ask only for the one missing detail that truly blocks execution.",
                    "- Do not ask for anything that can be inferred from thread context, page context, or the provided clickable choices.",
                    "- Do not ask for internal IDs unless the user must paste one.",
                    "- If clickable choices are available, mention they can click one.",
                    "- Do NOT list the choices in the message; the UI shows them as clickable options.",
                    "- Be concrete, not vague.",
                    "- No JSON output.",
                  ].join("\n"),
                  user: `Context (JSON):\n${JSON.stringify(
                    {
                      threadSummary: summary || null,
                      stepKey: keyParsed.data,
                      rawClarifyPrompt: rawClarifyPrompt || null,
                      choices: (clarifyChoices || []).slice(0, 8),
                    },
                    null,
                    2,
                  )}`,
                }),
              )
                .trim()
                .slice(0, 600);
            } catch {
              clarifyText = "";
            }

            const assistantMsg = clarifyText
              ? await (prisma as any).portalAiChatMessage.create({
                  data: {
                    ownerId,
                    threadId,
                    role: "assistant",
                    text: clarifyText,
                    attachmentsJson: null,
                    createdByUserId: null,
                    sendAt: null,
                    sentAt: now,
                  },
                  select: {
                    id: true,
                    role: true,
                    text: true,
                    attachmentsJson: true,
                    createdAt: true,
                    sendAt: true,
                    sentAt: true,
                  },
                })
              : null;

            const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
            const completedRunId = activeRunId;
            const completedRunStartedAt = activeRunStartedAt;
            const nextCtx = completeInterruptibleRun({
              ...clearNextStepContext(prevCtx),
              pendingAction: { key: keyParsed.data, title, args: argsRaw },
              pendingActionClarify: { at: now.toISOString(), question: clarifyText || null, rawClarifyPrompt: rawClarifyPrompt || null },
              pendingPlan: null,
              pendingPlanClarify: null,
            });
            await (prisma as any).portalAiChatThread.update({
              where: { id: threadId },
              data: assistantMsg ? { lastMessageAt: now, contextJson: nextCtx } : { contextJson: nextCtx },
            });
            await persistActiveChatRun({
              status: "needs_input",
              runId: completedRunId,
              startedAt: completedRunStartedAt,
              runTrace: {
                workTitle: title || keyParsed.data,
                assistantMessageId: assistantMsg?.id ?? null,
              },
              summaryText: clarifyText || rawClarifyPrompt || null,
              completedAt: now,
            });
            return NextResponse.json({ ok: true, userMessage: responseUserMessage, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null, assistantChoices: clarifyChoices, clientUiActions: [] });
          }

          const resolvedArgs = resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args)
            ? (resolved.args as Record<string, unknown>)
            : {};

          const resolvedArgsWithThread = (() => {
            const withThread =
              keyParsed.data === "ai_chat.scheduled.create" && !String((resolvedArgs as any).threadId || "").trim()
                ? ({ ...resolvedArgs, threadId } as Record<string, unknown>)
                : resolvedArgs;

            if (keyParsed.data === "ai_chat.scheduled.create") return patchArgsForScheduledCreate(withThread, threadContext);
            if (keyParsed.data === "ai_chat.scheduled.reschedule") return patchArgsForScheduledReschedule(withThread, threadContext);
            return withThread;
          })();

          threadContext = await persistLiveStatus(
            { phase: "executing", label: `Running ${title || keyParsed.data}`, actionKey: keyParsed.data, title, completedSteps: 0 },
            threadContext,
          );
          if (await checkInterruptRequested()) {
            return await buildStoppedAssistantMessage(responseUserMessage);
          }
          const exec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: keyParsed.data, args: resolvedArgsWithThread });
          const cua = (exec as any).clientUiAction ?? null;
          const execError = typeof (exec as any).error === "string" ? String((exec as any).error).trim().slice(0, 800) : "";
          const resultForSummary = stripAssistantVisibleAccountingFields((exec as any)?.result ?? (execError ? { ok: false, error: execError } : null));
          const linkUrl = (exec as any).linkUrl ?? null;

          const derivedPatch = deriveThreadContextPatchFromAction(keyParsed.data, resolvedArgsWithThread, (exec as any).result);
          const mergedPatch = {
            ...(resolved.contextPatch && typeof resolved.contextPatch === "object" && !Array.isArray(resolved.contextPatch) ? (resolved.contextPatch as any) : {}),
            ...(derivedPatch && typeof derivedPatch === "object" && !Array.isArray(derivedPatch) ? (derivedPatch as any) : {}),
          };

          const mappedCanvasUrl = portalCanvasUrlForAction(keyParsed.data, resolvedArgsWithThread) || null;
          const canvasUrl = (typeof linkUrl === "string" && linkUrl.trim() ? linkUrl : mappedCanvasUrl) || null;

          let assistantText = "";
          try {
            assistantText = stripEmptyAssistantBullets(
              String(
                await generateText({
                  system: [
                    "You are Pura, an AI assistant inside a SaaS portal.",
                    "You just ran a portal action after the user answered a question.",
                    "Write a normal chat reply (not a report).",
                    "Hard constraint: NEVER claim success unless ok=true and status is 2xx.",
                    "If ok=false or status is non-2xx, clearly say it failed and what happens next.",
                    "Formatting rules:",
                    "- 1-3 short paragraphs.",
                    "- NO headings, NO bullet lists, NO tables.",
                    "- Do NOT print raw JSON or field dumps.",
                    "- Do NOT use labels like 'Action:', 'Status:', 'Result:'.",
                    "- Never invent URLs, domains, or links. Only mention a link when linkUrl or canvasUrl is explicitly provided, and use that exact path/value.",
                    "Rules:",
                    "- Mention what you did and the outcome.",
                    "- If it failed, say what failed and what you need next.",
                    "- Do not invent details. If uncertain, say you’re not sure.",
                  ].join("\n"),
                  user: `Action result (JSON):\n${JSON.stringify(
                    {
                      action: keyParsed.data,
                      title,
                      ok: Boolean((exec as any).ok),
                      status: Number((exec as any).status) || 0,
                      args: resolvedArgsWithThread,
                      error: (() => {
                        const e1 =
                          resultForSummary && typeof resultForSummary === "object" && !Array.isArray(resultForSummary) && typeof (resultForSummary as any).error === "string"
                            ? String((resultForSummary as any).error).trim().slice(0, 500)
                            : "";
                        return (e1 || execError || "").trim() || null;
                      })(),
                      result: resultForSummary,
                      linkUrl,
                      userPrompt: String(promptMessage || "").slice(0, 2000),
                    },
                    null,
                    2,
                  )}`,
                }),
              ),
            );
          } catch {
            assistantText = "";
          }

          const assistantMsg = assistantText.trim()
            ? await (prisma as any).portalAiChatMessage.create({
                data: { ownerId, threadId, role: "assistant", text: assistantText.slice(0, 12_000), attachmentsJson: null, createdByUserId: null, sendAt: null, sentAt: now },
                select: { id: true, role: true, text: true, attachmentsJson: true, createdAt: true, sendAt: true, sentAt: true },
              })
            : null;

          const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
          const prevRuns = Array.isArray(prevCtx.runs) ? (prevCtx.runs as unknown[]) : [];
          const runTrace = {
            at: now.toISOString(),
            workTitle: title || keyParsed.data,
            assistantMessageId: assistantMsg?.id ?? null,
            steps: [{ key: keyParsed.data, title, ok: Boolean((exec as any).ok), linkUrl }],
            canvasUrl,
          };
          const runs = [...prevRuns.slice(-19), runTrace];

          const completedRunId = activeRunId;
          const completedRunStartedAt = activeRunStartedAt;
          const singleRunStatus: PortalAiChatRunStatus = Boolean((exec as any).ok) && Number((exec as any).status) >= 200 && Number((exec as any).status) < 300 ? "completed" : "failed";
          const nextCtx = completeInterruptibleRun(
            singleRunStatus === "completed"
              ? clearNextStepContext(clearUnresolvedRun({
                  ...prevCtx,
                  ...mergedPatch,
                  lastWorkTitle: title || keyParsed.data,
                  lastCanvasUrl: canvasUrl,
                  pendingAction: null,
                  pendingActionClarify: null,
                  pendingPlan: null,
                  pendingPlanClarify: null,
                  runs,
                }))
              : withUnresolvedRun(
                  clearNextStepContext({
                    ...prevCtx,
                    ...mergedPatch,
                    lastWorkTitle: title || keyParsed.data,
                    lastCanvasUrl: canvasUrl,
                    pendingAction: null,
                    pendingActionClarify: null,
                    pendingPlan: null,
                    pendingPlanClarify: null,
                    runs,
                  }),
                  {
                    status: "failed",
                    runId: completedRunId,
                    updatedAt: now.toISOString(),
                    workTitle: title || keyParsed.data,
                    summaryText: assistantMsg?.text ?? execError ?? null,
                    userRequest: promptMessage,
                    canvasUrl,
                  },
                ),
          );
          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
          if (assistantText) await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText });

          const followUpSuggestions = buildProactiveFollowUpSuggestions({
            actionKeys: [String(keyParsed.data)],
            canvasUrl,
            promptText: promptMessage,
            completedCount: Boolean((exec as any).ok) && Number((exec as any).status) >= 200 && Number((exec as any).status) < 300 ? 1 : 0,
            failedCount: Boolean((exec as any).ok) && Number((exec as any).status) >= 200 && Number((exec as any).status) < 300 ? 0 : 1,
            pendingCount: 0,
          });

          const finalizedCtx =
            singleRunStatus === "completed"
              ? withNextStepContext(nextCtx, {
                  updatedAt: now.toISOString(),
                  objective: promptMessage,
                  workTitle: title || keyParsed.data,
                  summaryText: assistantMsg?.text ?? null,
                  suggestedPrompt: followUpSuggestions[0] ?? null,
                  suggestions: followUpSuggestions,
                  canvasUrl,
                })
              : nextCtx;

          const persistedCtx = withPersistedFollowUpSuggestions(finalizedCtx, assistantMsg?.id, followUpSuggestions);
          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: persistedCtx } });
          await persistActiveChatRun({
            status: singleRunStatus,
            runId: completedRunId,
            startedAt: completedRunStartedAt,
            runTrace,
            summaryText: assistantMsg?.text ?? null,
            followUpSuggestions,
            completedAt: now,
          });
          persistedThreadContext = persistedCtx;

          return NextResponse.json({ ok: true, userMessage: responseUserMessage, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl, assistantChoices: null, clientUiActions: cua ? [cua] : [], openScheduledTasks: String(keyParsed.data).startsWith("ai_chat.scheduled."), runTrace, followUpSuggestions });
        }
      }

      const MAX_TOTAL_ACTIONS = 18;

      const maxAutoRoundsEnv = Number(process.env.PORTAL_AI_AUTORUN_MAX_ROUNDS);
      const MAX_AUTORUN_ROUNDS = Number.isFinite(maxAutoRoundsEnv) && maxAutoRoundsEnv > 0 ? Math.min(40, Math.max(2, Math.floor(maxAutoRoundsEnv))) : 12;

      const maxAutoMsEnv = Number(process.env.PORTAL_AI_AUTORUN_MAX_MS);
      const MAX_AUTORUN_MS = Number.isFinite(maxAutoMsEnv) && maxAutoMsEnv > 0 ? Math.min(60_000, Math.max(2_000, Math.floor(maxAutoMsEnv))) : 20_000;
      const autoStartMs = Date.now();

      let lastAutoClarify: { question: string | null; choices: any[] | null; stepKey?: string; title?: string } | null = null;
      let lastAutoResolutionError: string | null = null;
      let lastAutoExecutionError: { action: string; status: number; error: string } | null = null;

      const allResolvedSteps: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }> = [];
      const allContextPatches: Array<Record<string, unknown> | undefined> = [];
      const allResults: Array<{ ok: boolean; status: number; action: PortalAgentActionKey; args: Record<string, unknown>; result: any; linkUrl?: string | null; clientUiAction?: any | null; error?: string | null }> = [];
      const allClientUiActions: any[] = [];

      let localCtx: any = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? { ...(threadContext as any) } : {};
      const seenPlanKeys = new Set<string>();
      let finalDirectMessage: string | null = null;

      localCtx = await persistLiveStatus({ phase: "planning", label: "Planning the next step", round: 1, completedSteps: 0 }, localCtx);

      const containsPlaceholderValueDeep = (v: unknown): boolean => {
        if (typeof v === "string") {
          const s = v.trim();
          if (!s) return false;
          if (/placeholder/i.test(s)) return true;
          if ((s.startsWith("<") && s.endsWith(">")) || s.includes("{{") || s.includes("}}")) return true;
          if (/\bnew[_-]?[a-z0-9_-]*id\b/i.test(s)) return true;
          return false;
        }
        if (Array.isArray(v)) return v.some((x) => containsPlaceholderValueDeep(x));
        if (v && typeof v === "object") {
          for (const val of Object.values(v as Record<string, unknown>)) {
            if (containsPlaceholderValueDeep(val)) return true;
          }
        }
        return false;
      };

      const hasPlaceholderArgs = (actionsIn: Array<{ args?: Record<string, unknown> }>): boolean => {
        return (actionsIn || []).some((a) => containsPlaceholderValueDeep(a?.args || null));
      };

      const isAutoRepairableClarifyPrompt = (questionRaw: string, choices?: any[] | null): boolean => {
        if (Array.isArray(choices) && choices.length) return true;
        const question = String(questionRaw || "").trim().toLowerCase();
        if (!question) return false;

        if (/^planner repair required:/i.test(question)) return true;

        if (
          /(what local time|reply like 09:00|which tag should i use|reply with the tag name|nested schedule step|rephrase the schedule|missing its required prompt string)/i.test(
            question,
          )
        ) {
          return false;
        }

        const mentionsResolvableEntity =
          /\b(contact|thread|calendar|booking|funnel|page|automation|task|review|question|campaign|step|user|member|domain|folder|item|report|letter|pull|post|newsletter|schedule|message|id)\b/.test(
            question,
          );
        const looksLikeDiscoveryProblem =
          /\b(which|what|couldn'?t\s+find|can'?t\s+find|not\s+find|multiple|matching|specific\s+id|exact\s+.*id|paste\s+the\s+.*id|reply\s+with\s+the\s+.*id|need\s+(?:the\s+)?(?:exact\s+)?(?:.*\s+)?id|i\s+need\s+(?:a\s+)?specific\s+id)\b/.test(
            question,
          );

        return mentionsResolvableEntity && looksLikeDiscoveryProblem;
      };

      const inferPreferredDiscoveryAction = (actionKeyRaw: string | null | undefined): PortalAgentActionKey | null => {
        const actionKey = String(actionKeyRaw || "").trim();
        if (!actionKey) return null;
        if (actionKey === "booking.calendars.get" || actionKey.startsWith("booking.calendar.") || actionKey.startsWith("booking.reminders.")) return "booking.calendars.get";
        if (actionKey.startsWith("booking.")) return "booking.bookings.list";
        if (actionKey.startsWith("tasks.")) return "tasks.list";
        if (actionKey.startsWith("contacts.")) return "contacts.list";
        if (actionKey.startsWith("people.")) return "people.users.list";
        if (actionKey.startsWith("inbox.")) return "inbox.threads.list";
        if (actionKey === "media.folders.update" || actionKey === "media.folder.ensure") return "media.folders.list";
        if (actionKey.startsWith("media.")) return "media.items.list";
        if (actionKey.startsWith("reporting.stripe.")) return "reporting.stripe.get";
        if (actionKey.startsWith("reporting.sales.")) return "reporting.sales.get";
        if (actionKey.startsWith("reporting.")) return "reporting.summary.get";
        if (actionKey.startsWith("ai_chat.")) return "ai_chat.threads.list";
        if (actionKey.startsWith("funnel_builder.pages.")) return "funnel_builder.pages.list";
        if (actionKey.startsWith("funnel_builder.") || actionKey.startsWith("funnel.")) return "funnel_builder.funnels.list";
        return null;
      };

      const buildDomainContinuationHint = (actionKeyRaw: string | null | undefined): string | null => {
        const preferred = inferPreferredDiscoveryAction(actionKeyRaw);
        if (!preferred) return null;
        switch (preferred) {
          case "booking.calendars.get":
            return "Stay in the booking domain. If you need more context, inspect the booking calendars first before trying unrelated tools.";
          case "booking.bookings.list":
            return "Stay in the booking domain. If you need more context, inspect the existing bookings first before trying unrelated tools.";
          case "tasks.list":
            return "Stay in the tasks domain. If you need more context, list the open tasks before trying unrelated tools.";
          case "contacts.list":
            return "Stay in the contacts domain. If you need more context, list or inspect contacts before trying unrelated tools.";
          case "people.users.list":
            return "Stay in the team/users domain. If you need more context, inspect the portal users before trying unrelated tools.";
          case "inbox.threads.list":
            return "Stay in the inbox domain. If you need more context, inspect inbox threads before trying unrelated tools.";
          case "media.folders.list":
            return "Stay in the media domain. If you need more context, inspect media folders before trying unrelated tools.";
          case "media.items.list":
            return "Stay in the media domain. If you need more context, inspect media items before trying unrelated tools.";
          case "reporting.stripe.get":
            return "Stay in the Stripe reporting domain. If you need more context, load the Stripe summary before trying unrelated tools.";
          case "reporting.sales.get":
            return "Stay in the sales reporting domain. If you need more context, load the sales summary before trying unrelated tools.";
          case "reporting.summary.get":
            return "Stay in the reporting domain. If you need more context, load the reporting summary before trying unrelated tools.";
          case "ai_chat.threads.list":
            return "Stay in the AI chat domain. If you need more context, inspect chat threads before trying unrelated tools.";
          case "funnel_builder.pages.list":
            return "Stay in the funnel domain. If you need more context, inspect the funnel pages before trying unrelated tools.";
          case "funnel_builder.funnels.list":
            return "Stay in the funnel domain. If you need more context, inspect the funnels before trying unrelated tools.";
          default:
            return null;
        }
      };

      const buildSafeDiscoveryFallbackStep = (preferredActionKey?: PortalAgentActionKey | null): { key: PortalAgentActionKey; title: string; args: Record<string, unknown> } => {
        const requestText = String(planningTextWithAttachments || effectiveText || "").trim().toLowerCase();
        const currentUrl = String(contextUrl || "").trim().toLowerCase();
        const threadSummary =
          localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) && typeof (localCtx as any).threadSummary === "string"
            ? String((localCtx as any).threadSummary || "").trim().toLowerCase()
            : "";
        const combined = [requestText, currentUrl, threadSummary].filter(Boolean).join("\n");
        const hasLastFunnelId = Boolean(localCtx?.lastFunnel && typeof localCtx.lastFunnel?.id === "string" && String(localCtx.lastFunnel.id).trim());

        const buildAction = (key: PortalAgentActionKey, title: string, args: Record<string, unknown>) => ({ key, title, args });

        const preferred = preferredActionKey || null;

        if (preferred === "booking.bookings.list") {
          return buildAction("booking.bookings.list", "Find the bookings", { take: 25 });
        }
        if (preferred === "booking.calendars.get") {
          return buildAction("booking.calendars.get", "Find the booking calendars", {});
        }
        if (preferred === "tasks.list") {
          return buildAction("tasks.list", "Find the tasks", { status: "OPEN", limit: 25 });
        }
        if (preferred === "inbox.threads.list") {
          return buildAction("inbox.threads.list", "Find the inbox threads", { take: 25 });
        }
        if (preferred === "contacts.list") {
          return buildAction("contacts.list", "Find the contacts", { limit: 25 });
        }
        if (preferred === "people.users.list") {
          return buildAction("people.users.list", "Find the portal users", {});
        }
        if (preferred === "media.folders.list") {
          return buildAction("media.folders.list", "Find the media folders", {});
        }
        if (preferred === "media.items.list") {
          return buildAction("media.items.list", "Find the media items", { limit: 25 });
        }
        if (preferred === "reporting.stripe.get") {
          return buildAction("reporting.stripe.get", "Load the Stripe summary", { range: "30d" });
        }
        if (preferred === "reporting.sales.get") {
          return buildAction("reporting.sales.get", "Load the sales summary", { range: "30d" });
        }
        if (preferred === "reporting.summary.get") {
          return buildAction("reporting.summary.get", "Load the reporting summary", { range: "30d" });
        }
        if (preferred === "ai_chat.threads.list") {
          return buildAction("ai_chat.threads.list", "Find the chat threads", {});
        }
        if (preferred === "funnel_builder.pages.list") {
          return hasLastFunnelId
            ? buildAction("funnel_builder.pages.list", "Find the funnel pages", { funnelId: String(localCtx.lastFunnel.id).trim().slice(0, 120) })
            : buildAction("funnel_builder.funnels.list", "Find the funnels", {});
        }
        if (preferred === "funnel_builder.funnels.list") {
          return buildAction("funnel_builder.funnels.list", "Find the funnels", {});
        }

        if (/\b(calendar|booking|bookings|appointment|appointments|availability|meeting|scheduler|schedule link)\b/.test(combined)) {
          if (/\b(booking|bookings|appointment|appointments)\b/.test(combined)) {
            return buildAction("booking.bookings.list", "Find the bookings", { take: 25 });
          }
          return buildAction("booking.calendars.get", "Find the booking calendars", {});
        }

        if (/\b(inbox|email|emails|sms|text message|text messages|texts|conversation|conversations|message thread|message threads)\b/.test(combined)) {
          const channel = /\b(email|emails)\b/.test(combined) ? "EMAIL" : /\b(sms|text message|text messages|texts)\b/.test(combined) ? "SMS" : null;
          return buildAction("inbox.threads.list", "Find the inbox threads", channel ? { channel, take: 25 } : { take: 25 });
        }

        if (
          /\b(contact|contacts|lead|leads|customer|customers|client|clients|prospect|prospects)\b/.test(combined) ||
          /\b[A-Z0-9._%+-]{1,80}@[A-Z0-9.-]{1,120}\.[A-Z]{2,24}\b/i.test(combined) ||
          /\+?\d[\d\s().-]{7,}\d/.test(combined) ||
          (Boolean(localCtx?.lastContact?.id) && /\b(name|email|phone|number|rename|contact info|crm)\b/.test(combined))
        ) {
          return buildAction("contacts.list", "Find the contacts", { limit: 25 });
        }

        if (/\b(task|tasks|todo|to-do|follow[-\s]?up|followup|checklist)\b/.test(combined)) {
          return buildAction("tasks.list", "Find the tasks", { status: "OPEN", limit: 25 });
        }

        if (/\b(user|users|team|staff|employee|employees|member|members|owner|owners)\b/.test(combined)) {
          return buildAction("people.users.list", "Find the portal users", {});
        }

        if (/\b(media|asset|assets|file|files|image|images|photo|photos|video|videos|upload|uploads|folder|folders|library)\b/.test(combined)) {
          if (/\b(folder|folders)\b/.test(combined)) {
            return buildAction("media.folders.list", "Find the media folders", {});
          }
          return buildAction("media.items.list", "Find the media items", { limit: 25 });
        }

        if (/\b(report|reports|reporting|dashboard|analytics|metrics|revenue|sales|stripe|payment|payments)\b/.test(combined)) {
          if (/\b(stripe|payment|payments)\b/.test(combined)) {
            return buildAction("reporting.stripe.get", "Load the Stripe summary", { range: "30d" });
          }
          if (/\b(sales|revenue)\b/.test(combined)) {
            return buildAction("reporting.sales.get", "Load the sales summary", { range: "30d" });
          }
          return buildAction("reporting.summary.get", "Load the reporting summary", { range: "30d" });
        }

        if (/\b(ai chat|chat thread|chat threads|thread|threads|conversation history|assistant thread)\b/.test(combined)) {
          return buildAction("ai_chat.threads.list", "Find the chat threads", {});
        }

        if (/\b(funnel|funnels|landing page|landing pages|landing|website|site|page builder|checkout|upsell|downsell|thank you|thank-you|opt[-\s]?in)\b/.test(combined) || currentUrl.includes("/funnel") || currentUrl.includes("/funnels")) {
          return hasLastFunnelId
            ? buildAction("funnel_builder.pages.list", "Find the funnel pages", { funnelId: String(localCtx.lastFunnel.id).trim().slice(0, 120) })
            : buildAction("funnel_builder.funnels.list", "Find the funnels", {});
        }

        return hasLastFunnelId
          ? buildAction("funnel_builder.pages.list", "Find the funnel pages", { funnelId: String(localCtx.lastFunnel.id).trim().slice(0, 120) })
          : buildAction("contacts.list", "Find the contacts", { limit: 25 });
      };

      const buildSafeDiscoveryFallback = (preferredActionKey?: PortalAgentActionKey | null) => [buildSafeDiscoveryFallbackStep(preferredActionKey)] as any;

      const buildExecutionFailureDirectMessage = (opts: { title: string; error: string; status: number; failureMeta?: PortalAgentFailureMeta | null }): string => {
        const title = String(opts.title || "this action").trim() || "this action";
        const error = String(opts.error || "That action failed.").trim().replace(/\s+/g, " ").slice(0, 400) || "That action failed.";
        const failureMeta = opts.failureMeta || classifyPortalAgentFailure({ status: opts.status, error });
        if (failureMeta?.kind === "not_configured") {
          return `I couldn’t finish ${title} because ${error}${failureMeta.setupHint ? ` ${failureMeta.setupHint}` : ""}${failureMeta.setupClickPath ? ` Go to ${failureMeta.setupClickPath}.` : ""} This is a setup issue, so retrying the same step won’t help until that is configured.`;
        }
        if (
          failureMeta?.kind === "unsupported" ||
          failureMeta?.kind === "not_implemented" ||
          failureMeta?.kind === "external_dependency"
        ) {
          return `I couldn’t finish ${title} because ${error} This looks like a real portal limitation or dependency issue, so retrying the same step won’t fix it from chat alone.`;
        }
        if (
          failureMeta?.kind === "temporary_unavailable" ||
          failureMeta?.kind === "rate_limited"
        ) {
          return `I couldn’t finish ${title} because ${error} This looks like a temporary provider or network issue, so I stopped instead of looping on the same failing call. Retrying in a bit may help.`;
        }
        return `I couldn’t finish ${title} because ${error}`;
      };

      const hasHotContextForDiscoveryAction = (key: PortalAgentActionKey): boolean => {
        switch (key) {
          case "contacts.list":
            return Boolean(localCtx?.lastContact?.id);
          case "tasks.list":
            return Boolean(localCtx?.lastTask?.id);
          case "booking.calendars.get":
            return Boolean(localCtx?.lastBookingCalendar?.id);
          case "booking.bookings.list":
            return Boolean(localCtx?.lastBooking?.id || localCtx?.lastBookingCalendar?.id);
          case "media.folders.list":
            return Boolean(localCtx?.lastMediaFolder?.id);
          case "media.items.list":
            return Boolean(localCtx?.lastMediaItem?.id || localCtx?.lastMediaFolder?.id);
          case "funnel_builder.pages.list":
            return Boolean(localCtx?.lastFunnelPage?.id || localCtx?.lastFunnel?.id || localCtx?.activeFunnel?.id);
          case "funnel_builder.funnels.list":
            return Boolean(localCtx?.lastFunnel?.id || localCtx?.activeFunnel?.id);
          default:
            return false;
        }
      };

      const shouldPrimePlannerWithDiscovery = (key: PortalAgentActionKey): boolean => {
        if (!hasNewUserText) return false;
        if (didClickChoice || isConfirmOnly) return false;
        if (!isImperativeRequest(effectiveText)) return false;
        return !hasHotContextForDiscoveryAction(key);
      };


      const currentStickyRecoveryAction = (): PortalAgentActionKey | null => {
        const fromExecution = inferPreferredDiscoveryAction(lastAutoExecutionError?.action);
        if (fromExecution) return fromExecution;
        const fromClarify = inferPreferredDiscoveryAction(lastAutoClarify?.stepKey);
        if (fromClarify) return fromClarify;
        const fromRecentStep = inferPreferredDiscoveryAction(allResolvedSteps[allResolvedSteps.length - 1]?.key || null);
        if (fromRecentStep) return fromRecentStep;
        return inferPreferredDiscoveryAction(bootstrapDiscoverySummary?.action || null);
      };

      const runPlannerOnce = async (opts: { round: number; extraSystem?: string; temperature?: number; lastRunSummary?: any }) => {
        const cheat = toolCheatSheetForPrompt(planningTextWithAttachments, contextUrl);
        const knownIdsNote = buildKnownPortalIdsSystemNote({
          threadContext: localCtx,
          lastRunSummary: opts.lastRunSummary,
        });
        const modelSystem = buildPlannerSystemPrompt({
          cheatSheet: cheat,
          extraSystem: [knownIdsNote, opts.extraSystem].filter(Boolean).join("\n\n") || undefined,
        });

        const threadSummaryForPrompt =
          localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) && typeof (localCtx as any).threadSummary === "string"
            ? String((localCtx as any).threadSummary || "").trim().slice(0, 1200)
            : "";

        const modelUser = buildPlannerUserPrompt({
          contextUrl,
          threadSummary: threadSummaryForPrompt || null,
          lastRunSummary: opts.lastRunSummary,
          recentRunContinuity: recentRunContinuityForPlanning,
          unresolvedRun: unresolvedRunForPlanning,
          nextStepContext: nextStepContextForPlanning,
          continuationIntent,
          recentMessages: modelMessages,
          userRequest: planningTextWithAttachments,
        });

        const modelText = String(
          await generateText({ system: modelSystem, user: modelUser, temperature: typeof opts.temperature === "number" ? opts.temperature : isRedo ? 0.85 : 0.6 }),
        ).trim();
        const decision = parseChatWrapperDecision(modelText);
        const actions = Array.isArray(decision?.actions) ? decision!.actions! : [];
        const directMessage = typeof decision?.message === "string" ? decision!.message!.trim() : "";
        return { modelText, actions, directMessage };
      };

      let bootstrapDiscoverySummary:
        | {
            action: PortalAgentActionKey;
            title: string;
            ok: boolean;
            status: number;
            idHints: ReturnType<typeof summarizeIdsFromArgs>;
            resultPreview: ReturnType<typeof previewResultForPlanner>;
          }
        | null = null;

      {
        const bootstrapStep = buildSafeDiscoveryFallbackStep();
        if (shouldPrimePlannerWithDiscovery(bootstrapStep.key)) {
          localCtx = await persistLiveStatus(
            { phase: "bootstrap", label: `Scanning context with ${bootstrapStep.title}`, actionKey: bootstrapStep.key, title: bootstrapStep.title, round: 1, completedSteps: 0 },
            localCtx,
          );
          const resolved = await resolvePlanArgs({
            ownerId,
            stepKey: bootstrapStep.key,
            args: bootstrapStep.args,
            userHint: effectiveText,
            url: contextUrl,
            threadContext: localCtx,
          });

          if (resolved.ok) {
            const resolvedArgs =
              resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args)
                ? (resolved.args as Record<string, unknown>)
                : {};

            if (resolved.contextPatch && typeof resolved.contextPatch === "object" && !Array.isArray(resolved.contextPatch)) {
              localCtx = { ...localCtx, ...(resolved.contextPatch as any) };
            }

            localCtx = await persistLiveStatus(
              { phase: "executing", label: `Running ${bootstrapStep.title}`, actionKey: bootstrapStep.key, title: bootstrapStep.title, round: 1, completedSteps: 0 },
              localCtx,
            );
            const exec = await executePortalAgentAction({
              ownerId,
              actorUserId: createdByUserId,
              action: bootstrapStep.key,
              args: resolvedArgs,
            }).catch(() => null);

            if (exec && Boolean((exec as any).ok) && Number((exec as any).status) >= 200 && Number((exec as any).status) < 300) {
              const derivedPatch = deriveThreadContextPatchFromAction(bootstrapStep.key, resolvedArgs, (exec as any).result);
              if (derivedPatch && typeof derivedPatch === "object" && !Array.isArray(derivedPatch)) {
                localCtx = { ...localCtx, ...(derivedPatch as any) };
              }
              bootstrapDiscoverySummary = {
                action: bootstrapStep.key,
                title: bootstrapStep.title,
                ok: true,
                status: Number((exec as any).status) || 0,
                idHints: summarizeIdsFromArgs(resolvedArgs),
                resultPreview: previewResultForPlanner(bootstrapStep.key, (exec as any).result),
              };
            }
          }
        }
      }

      for (let round = 0; round < MAX_AUTORUN_ROUNDS; round += 1) {
        if (Date.now() - autoStartMs > MAX_AUTORUN_MS) break;
        localCtx = await persistLiveStatus(
          {
            phase: "planning",
            label: round > 0 ? "Replanning the next step" : "Planning the next step",
            title: round > 0 ? `Round ${round + 1}` : null,
            round: round + 1,
            completedSteps: allResolvedSteps.length,
            lastCompletedTitle: allResolvedSteps[allResolvedSteps.length - 1]?.title || null,
          },
          localCtx,
        );
        if (await checkInterruptRequested()) {
          return await buildStoppedAssistantMessage(responseUserMessage);
        }
        const lastRunSummary = allResolvedSteps.length || lastAutoClarify || lastAutoExecutionError || lastAutoResolutionError || bootstrapDiscoverySummary
          ? {
              ...(bootstrapDiscoverySummary ? { bootstrapDiscovery: bootstrapDiscoverySummary } : {}),
              executedSteps: allResolvedSteps.slice(-12).map((s) => ({ key: s.key, title: s.title })),
              lastResults: allResults
                .slice(-10)
                .map((r) => ({
                  action: r.action,
                  ok: r.ok,
                  status: r.status,
                  error: r.error || null,
                  idHints: summarizeIdsFromArgs((r as any).args || {}),
                  resultPreview: previewResultForPlanner((r as any).action, (r as any).result),
                }))
                .slice(0, 10),
              ...(lastAutoClarify
                ? {
                    lastClarify: {
                      question: lastAutoClarify.question,
                      stepKey: lastAutoClarify.stepKey || null,
                      title: lastAutoClarify.title || null,
                      choices: lastAutoClarify.choices,
                    },
                  }
                : {}),
              ...(lastAutoResolutionError ? { lastResolutionError: lastAutoResolutionError } : {}),
              ...(lastAutoExecutionError ? { lastExecutionError: lastAutoExecutionError } : {}),
            }
          : null;

        let planned = await runPlannerOnce({
          round,
          lastRunSummary,
          extraSystem:
            round > 0
              ? [
                  buildDomainContinuationHint(currentStickyRecoveryAction()),
                  "Continuation: keep going until the user request is DONE. Output the next actions now; do not ask for permission.",
                  lastAutoClarify
                    ? `The last attempt stalled during resolution: ${String(lastAutoClarify.question || "Missing or ambiguous required fields.").slice(0, 600)} Do NOT ask the user yet if you can discover this yourself. Use discovery tools (list/get/search/get-by-context) or the provided choices to select REAL IDs, then continue. Never use placeholders like <...> or new_*_id.`
                    : null,
                  lastAutoExecutionError
                    ? `The last attempt failed during execution (${lastAutoExecutionError.action} status ${lastAutoExecutionError.status}). Fix args and retry. Never guess IDs; use list/get first if needed.`
                    : null,
                  lastAutoResolutionError
                    ? `The last attempt failed during arg resolution: ${lastAutoResolutionError}. Fix it by listing/looking up entities instead of asking the user.`
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n")
              : undefined,
        });

        if (planned.actions.length && hasPlaceholderArgs(planned.actions) && round + 1 < MAX_AUTORUN_ROUNDS) {
          // Force the model into stepwise planning so it never needs placeholders.
          const retryExtra = [
            "You used placeholder IDs/values in tool args (like <...placeholder...>). That is invalid.",
            "Hard rule: Do NOT output placeholder strings (no <...>, no {{...}}, no *_placeholder, no new_*_id).",
            "Hard rule: Do NOT output a multi-action plan that depends on IDs created earlier in the SAME response.",
            "If an ID must be created/discovered first, output EXACTLY ONE action: the discovery/create step, then stop.",
            "Do not ask the user to pick. Do not guess IDs.",
            "Output JSON actions only.",
          ].join("\n");
          planned = await runPlannerOnce({ round, lastRunSummary, temperature: 0.25, extraSystem: retryExtra });

          // If the retry still has placeholders, truncate to the first safe step or fall back to discovery.
          if (planned.actions.length && hasPlaceholderArgs(planned.actions)) {
            const firstSafe = planned.actions.find((a) => !containsPlaceholderValueDeep((a as any)?.args || null));
            if (firstSafe) {
              planned = { ...planned, actions: [firstSafe] as any };
            } else {
              planned = {
                ...planned,
                actions: buildSafeDiscoveryFallback(currentStickyRecoveryAction()),
                directMessage: "",
              } as any;
            }
          }
        }

        if (!planned.actions.length) {
          const assistantText = stripEmptyAssistantBullets(planned.directMessage || planned.modelText);
          if (looksLikeProceedLoopMessage(assistantText) && isImperativeRequest(effectiveText) && round + 1 < MAX_AUTORUN_ROUNDS) {
            planned = await runPlannerOnce({
              round,
              lastRunSummary,
              temperature: 0.3,
              extraSystem:
                "The user already said to do it. Do not ask 'Would you like to proceed?' Output actions only, immediately.",
            });
          }

          if (!planned.actions.length && looksLikePortalHowToInstructions(assistantText) && isImperativeRequest(effectiveText) && round + 1 < MAX_AUTORUN_ROUNDS) {
            planned = await runPlannerOnce({
              round,
              lastRunSummary,
              temperature: 0.25,
              extraSystem:
                "The user wants you to do the work in the portal. Do NOT provide how-to steps or instructions. Output JSON actions only.",
            });
          }

          if (!planned.actions.length && looksLikeNonActionDeflection(assistantText) && isImperativeRequest(effectiveText) && round + 1 < MAX_AUTORUN_ROUNDS) {
            planned = await runPlannerOnce({
              round,
              lastRunSummary,
              temperature: 0.25,
              extraSystem:
                [
                  buildDomainContinuationHint(currentStickyRecoveryAction()),
                  "Stop deflecting. The user asked you to do it. Output JSON actions only. If unsure what to do next, start with the most relevant read-only discovery step for the current domain (for example contacts.list, tasks.list, booking.calendars.get, inbox.threads.list, media.folders.list, reporting.summary.get, ai_chat.threads.list, people.users.list, or funnel_builder.pages.list / funnel_builder.funnels.list).",
                ]
                  .filter(Boolean)
                  .join("\n"),
            });
          }

          // Last-resort: if the user clearly told us to do it, but the model still won't emit actions,
          // run a safe discovery action so we can continue without asking permission.
          if (!planned.actions.length && isImperativeRequest(effectiveText)) {
            planned = {
              ...planned,
              actions: buildSafeDiscoveryFallback(currentStickyRecoveryAction()),
              directMessage: "",
            } as any;
          }

          if (!planned.actions.length) {
            finalDirectMessage = assistantText || null;
            break;
          }
        }

        let planKey = JSON.stringify(planned.actions.map((a) => ({ key: a.key, args: a.args || null })).slice(0, 6));
        if (seenPlanKeys.has(planKey)) {
          const recoveryActions = buildSafeDiscoveryFallback(currentStickyRecoveryAction()) as Array<{ key: PortalAgentActionKey; args?: Record<string, unknown> }>;
          const recoveryPlanKey = JSON.stringify(recoveryActions.map((a) => ({ key: a.key, args: a.args || null })).slice(0, 6));
          if (isImperativeRequest(effectiveText) && recoveryActions.length && recoveryPlanKey !== planKey && round + 1 < MAX_AUTORUN_ROUNDS) {
            planned = {
              ...planned,
              actions: recoveryActions as any,
              directMessage: "",
            } as any;
            planKey = recoveryPlanKey;
          } else {
            finalDirectMessage =
              "I’m not making progress with the current plan. I’m going to stop here to avoid looping. Tell me the exact record or page you want me to target (or click the option if prompted), and I’ll continue.";
            break;
          }
        }
        seenPlanKeys.add(planKey);

        const actions = planned.actions;

        if (threadChatMode !== "work" && actions.length && actions.some((action) => !isReadOnlyPortalAgentAction(action.key))) {
          const discussText = "You’re in discuss mode, so I didn’t make portal changes. Switch this chat to Work and send that request again if you want me to do it.";
          const assistantMsg = await (prisma as any).portalAiChatMessage.create({
            data: {
              ownerId,
              threadId,
              role: "assistant",
              text: discussText,
              attachmentsJson: null,
              createdByUserId: null,
              sendAt: null,
              sentAt: now,
            },
            select: {
              id: true,
              role: true,
              text: true,
              attachmentsJson: true,
              createdAt: true,
              sendAt: true,
              sentAt: true,
            },
          });

          const prevCtx = localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) ? (localCtx as any) : {};
          const nextCtx = {
            ...prevCtx,
            chatMode: threadChatMode,
            pendingConfirm: null,
            pendingPlan: null,
            pendingPlanClarify: null,
            pendingAction: null,
            pendingActionClarify: null,
            liveStatus: null,
          };

          await (prisma as any).portalAiChatThread.update({
            where: { id: threadId },
            data: { lastMessageAt: now, contextJson: nextCtx },
          });
          persistedThreadContext = nextCtx;

          return NextResponse.json({ ok: true, userMessage: responseUserMessage, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null, assistantChoices: null, clientUiActions: [] });
        }

        // If any requested action needs confirmation, ask for it and stop.
        const confirmSpec =
          actions
            .map((a) => getInteractiveConfirmSpecForPortalAgentAction(a.key) || getConfirmSpecForPortalAgentAction(a.key))
            .find(Boolean) || null;

        if (confirmSpec) {
          const resolvedStepsForConfirm: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }> = [];
          let blockedForReplan = false;

          for (const a of actions.slice(0, 6)) {
            if (await checkInterruptRequested()) {
              return await buildStoppedAssistantMessage(responseUserMessage);
            }
            const key = a.key;
            const title = String(a.title || a.key).trim().slice(0, 160) || String(a.key);
            const argsRaw = a.args && typeof a.args === "object" && !Array.isArray(a.args) ? (a.args as Record<string, unknown>) : {};

            localCtx = await persistLiveStatus(
              {
                phase: "resolving",
                label: `Resolving ${title || key}`,
                actionKey: key,
                title,
                round: round + 1,
                completedSteps: allResolvedSteps.length,
                lastCompletedTitle: allResolvedSteps[allResolvedSteps.length - 1]?.title || null,
              },
              localCtx,
            );
            if (await checkInterruptRequested()) {
              return await buildStoppedAssistantMessage(responseUserMessage);
            }
            const resolved = await resolvePlanArgs({ ownerId, stepKey: key, args: argsRaw, userHint: effectiveText, url: contextUrl, threadContext: localCtx });
            if (!resolved.ok) {
              const clarifyChoices = Array.isArray((resolved as any).choices) ? ((resolved as any).choices as any[]) : null;
              const rawClarifyPrompt = String(resolved.clarifyQuestion || "").trim();

              if (/^Planner repair required:/i.test(rawClarifyPrompt)) {
                lastAutoResolutionError = rawClarifyPrompt || "Planner repair required";
                blockedForReplan = true;
                break;
              }

              // Auto-replan: if we have real, clickable entity choices, feed them back to the model
              // and let it pick + retry without involving the user.
              if (clarifyChoices && clarifyChoices.length) {
                lastAutoClarify = { question: rawClarifyPrompt || null, choices: clarifyChoices.slice(0, 8), stepKey: String(key), title };
                lastAutoResolutionError = rawClarifyPrompt || "Missing/ambiguous required fields";
                blockedForReplan = true;
                break;
              }

              if (isAutoRepairableClarifyPrompt(rawClarifyPrompt, clarifyChoices) && round + 1 < MAX_AUTORUN_ROUNDS) {
                lastAutoClarify = { question: rawClarifyPrompt || null, choices: null, stepKey: String(key), title };
                lastAutoResolutionError = rawClarifyPrompt || "Missing/ambiguous required fields";
                blockedForReplan = true;
                break;
              }

              let clarifyText = "";
              try {
                const summary =
                  localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) && typeof (localCtx as any).threadSummary === "string"
                    ? String((localCtx as any).threadSummary || "").trim().slice(0, 1200)
                    : "";

                clarifyText = String(
                  await generateText({
                    system: [
                      "You are Pura, an AI assistant inside a SaaS portal.",
                      "You need ONE clarifying question so the user can proceed.",
                      "Write a single short question.",
                      "Rules:",
                      "- Do not ask for internal IDs unless the user must paste one.",
                      "- If clickable choices are available, mention they can click one.",
                      "- Do NOT list the choices in the message; the UI already shows them as clickable options.",
                      "- No JSON output.",
                    ].join("\n"),
                    user: `Context (JSON):\n${JSON.stringify(
                      { threadSummary: summary || null, stepKey: key, rawClarifyPrompt: rawClarifyPrompt || null, choices: (clarifyChoices || []).slice(0, 8) },
                      null,
                      2,
                    )}`,
                  }),
                )
                  .trim()
                  .slice(0, 600);
              } catch {
                clarifyText = "";
              }

              const assistantMsg = clarifyText
                ? await (prisma as any).portalAiChatMessage.create({
                    data: { ownerId, threadId, role: "assistant", text: clarifyText, attachmentsJson: null, createdByUserId: null, sendAt: null, sentAt: now },
                    select: { id: true, role: true, text: true, attachmentsJson: true, createdAt: true, sendAt: true, sentAt: true },
                  })
                : null;

              const prevCtx = localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) ? localCtx : {};
              const nextCtx = {
                ...prevCtx,
                pendingAction: { key, title, args: argsRaw },
                pendingActionClarify: { at: now.toISOString(), question: clarifyText || null, rawClarifyPrompt: rawClarifyPrompt || null },
                pendingPlan: null,
                pendingPlanClarify: null,
                liveStatus: null,
              };
              await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: assistantMsg ? { lastMessageAt: now, contextJson: nextCtx } : { contextJson: nextCtx } });
              if (clarifyText) await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: clarifyText });

              return NextResponse.json({ ok: true, userMessage: responseUserMessage, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null, assistantChoices: clarifyChoices, clientUiActions: [] });
            }

            const resolvedArgs = resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args)
              ? (resolved.args as Record<string, unknown>)
              : {};
            const resolvedArgsWithThread = (() => {
              const withThread =
                key === "ai_chat.scheduled.create" && !String((resolvedArgs as any).threadId || "").trim()
                  ? ({ ...resolvedArgs, threadId } as Record<string, unknown>)
                  : resolvedArgs;
              if (key === "ai_chat.scheduled.create") return patchArgsForScheduledCreate(withThread, localCtx);
              if (key === "ai_chat.scheduled.reschedule") return patchArgsForScheduledReschedule(withThread, localCtx);
              return withThread;
            })();

            resolvedStepsForConfirm.push({ key, title, args: resolvedArgsWithThread });
            if (resolved.contextPatch && typeof resolved.contextPatch === "object" && !Array.isArray(resolved.contextPatch)) {
              localCtx = { ...localCtx, ...(resolved.contextPatch as any) };
            }
          }

          if (blockedForReplan) {
            if (round + 1 < MAX_AUTORUN_ROUNDS) continue;
            break;
          }

          const token = randomUUID();
          const prevCtx = localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) ? localCtx : {};
          const completedRunId = activeRunId;
          const completedRunStartedAt = activeRunStartedAt;
          const nextCtx = completeInterruptibleRun({
            ...withUnresolvedRun(clearNextStepContext(prevCtx), {
              status: "needs_input",
              runId: completedRunId,
              updatedAt: now.toISOString(),
              workTitle: resolvedStepsForConfirm[0]?.title ?? null,
              summaryText: (confirmSpec as any)?.message || null,
              userRequest: promptMessage,
              canvasUrl: null,
            }),
            pendingConfirm: { token, createdAt: now.toISOString(), workTitle: resolvedStepsForConfirm[0]?.title ?? null, steps: resolvedStepsForConfirm, confirm: confirmSpec },
            pendingAction: null,
            pendingActionClarify: null,
            pendingPlan: null,
            pendingPlanClarify: null,
          });
          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });

          let confirmText = "";
          try {
            confirmText = String(
              await generateText({
                system: [
                  "You are Pura, an AI assistant inside a SaaS portal.",
                  "The user needs to confirm before you run the requested actions.",
                  "Write a short confirmation prompt in 1-2 sentences.",
                  "Rules:",
                  "- Do not include internal IDs.",
                  "- Mention what you’re about to do at a high level.",
                  "- Tell them to click Confirm to proceed (or Cancel).",
                  "- No JSON.",
                ].join("\n"),
                user: `Context (JSON):\n${JSON.stringify(
                  {
                    confirm: { title: (confirmSpec as any)?.title ?? null, message: (confirmSpec as any)?.message ?? null },
                    stepsPreview: resolvedStepsForConfirm.map((s) => ({ key: s.key, title: s.title })).slice(0, 6),
                    userPrompt: String(promptMessage || "").slice(0, 2000),
                  },
                  null,
                  2,
                )}`,
              }),
            )
              .trim()
              .slice(0, 800);
          } catch {
            confirmText = "";
          }

          const assistantMsg = confirmText
            ? await (prisma as any).portalAiChatMessage.create({
                data: { ownerId, threadId, role: "assistant", text: confirmText, attachmentsJson: null, createdByUserId: null, sendAt: null, sentAt: now },
                select: { id: true, role: true, text: true, attachmentsJson: true, createdAt: true, sendAt: true, sentAt: true },
              })
            : null;

          await persistActiveChatRun({
            status: "needs_input",
            runId: completedRunId,
            startedAt: completedRunStartedAt,
            runTrace: {
              workTitle: resolvedStepsForConfirm[0]?.title ?? null,
              assistantMessageId: assistantMsg?.id ?? null,
            },
            summaryText: confirmText || (confirmSpec as any)?.message || null,
            completedAt: now,
          });

          if (confirmText) await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: confirmText });
          return NextResponse.json({ ok: true, userMessage: responseUserMessage, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null, assistantChoices: null, clientUiActions: [], needsConfirm: { ...(confirmSpec as any), token } });
        }

        // Execute requested actions immediately.
        let blockedForReplan = false;
        for (const a of actions.slice(0, 6)) {
          if (allResolvedSteps.length >= MAX_TOTAL_ACTIONS) break;
        if (await checkInterruptRequested()) {
          return await buildStoppedAssistantMessage(responseUserMessage);
        }
        const key = a.key;
        const title = String(a.title || a.key).trim().slice(0, 160) || String(a.key);
        const argsRaw = a.args && typeof a.args === "object" && !Array.isArray(a.args) ? (a.args as Record<string, unknown>) : {};

        localCtx = await persistLiveStatus(
          {
            phase: "resolving",
            label: `Resolving ${title || key}`,
            actionKey: key,
            title,
            round: round + 1,
            completedSteps: allResolvedSteps.length,
            lastCompletedTitle: allResolvedSteps[allResolvedSteps.length - 1]?.title || null,
          },
          localCtx,
        );
        if (await checkInterruptRequested()) {
          return await buildStoppedAssistantMessage(responseUserMessage);
        }
        const resolved = await resolvePlanArgs({ ownerId, stepKey: key, args: argsRaw, userHint: effectiveText, url: contextUrl, threadContext: localCtx });
        if (!resolved.ok) {
          const clarifyChoices = Array.isArray((resolved as any).choices) ? ((resolved as any).choices as any[]) : null;
          const rawClarifyPrompt = String(resolved.clarifyQuestion || "").trim();

          if (/^Planner repair required:/i.test(rawClarifyPrompt)) {
            lastAutoResolutionError = rawClarifyPrompt || "Planner repair required";
            blockedForReplan = true;
            break;
          }

          if (clarifyChoices && clarifyChoices.length) {
            lastAutoClarify = { question: rawClarifyPrompt || null, choices: clarifyChoices.slice(0, 8), stepKey: String(key), title };
            lastAutoResolutionError = rawClarifyPrompt || "Missing/ambiguous required fields";
            blockedForReplan = true;
            break;
          }

          if (isAutoRepairableClarifyPrompt(rawClarifyPrompt, clarifyChoices) && round + 1 < MAX_AUTORUN_ROUNDS) {
            lastAutoClarify = { question: rawClarifyPrompt || null, choices: null, stepKey: String(key), title };
            lastAutoResolutionError = rawClarifyPrompt || "Missing/ambiguous required fields";
            blockedForReplan = true;
            break;
          }

          let clarifyText = "";
          try {
            const summary =
              localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) && typeof (localCtx as any).threadSummary === "string"
                ? String((localCtx as any).threadSummary || "").trim().slice(0, 1200)
                : "";

            clarifyText = String(
              await generateText({
                system: [
                  "You are Pura, an AI assistant inside a SaaS portal.",
                  "You need ONE clarifying question so the user can proceed.",
                  "Write a single short question.",
                  "Rules:",
                  "- Do not ask for internal IDs unless the user must paste one.",
                  "- If clickable choices are available, mention they can click one.",
                  "- Do NOT list the choices in the message; the UI already shows them as clickable options.",
                  "- No JSON output.",
                ].join("\n"),
                user: `Context (JSON):\n${JSON.stringify(
                  { threadSummary: summary || null, stepKey: key, rawClarifyPrompt: rawClarifyPrompt || null, choices: (clarifyChoices || []).slice(0, 8) },
                  null,
                  2,
                )}`,
              }),
            )
              .trim()
              .slice(0, 600);
          } catch {
            clarifyText = "";
          }

          const assistantMsg = clarifyText
            ? await (prisma as any).portalAiChatMessage.create({
                data: { ownerId, threadId, role: "assistant", text: clarifyText, attachmentsJson: null, createdByUserId: null, sendAt: null, sentAt: now },
                select: { id: true, role: true, text: true, attachmentsJson: true, createdAt: true, sendAt: true, sentAt: true },
              })
            : null;

          const prevCtx = localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) ? localCtx : {};
          const completedRunId = activeRunId;
          const completedRunStartedAt = activeRunStartedAt;
          const nextCtx = completeInterruptibleRun({
            ...withUnresolvedRun(clearNextStepContext(prevCtx), {
              status: "needs_input",
              runId: completedRunId,
              updatedAt: now.toISOString(),
              workTitle: title,
              summaryText: clarifyText || rawClarifyPrompt || null,
              userRequest: promptMessage,
              canvasUrl: null,
            }),
            pendingAction: { key, title, args: argsRaw },
            pendingActionClarify: { at: now.toISOString(), question: clarifyText || null, rawClarifyPrompt: rawClarifyPrompt || null },
            pendingPlan: null,
            pendingPlanClarify: null,
          });
          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: assistantMsg ? { lastMessageAt: now, contextJson: nextCtx } : { contextJson: nextCtx } });
          await persistActiveChatRun({
            status: "needs_input",
            runId: completedRunId,
            startedAt: completedRunStartedAt,
            runTrace: {
              workTitle: title,
              assistantMessageId: assistantMsg?.id ?? null,
            },
            summaryText: clarifyText || rawClarifyPrompt || null,
            completedAt: now,
          });
          if (clarifyText) await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: clarifyText });

          return NextResponse.json({ ok: true, userMessage: responseUserMessage, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null, assistantChoices: clarifyChoices, clientUiActions: [] });
        }

        const resolvedArgs = resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args) ? (resolved.args as Record<string, unknown>) : {};
        const resolvedArgsWithThread = (() => {
          const withThread =
            key === "ai_chat.scheduled.create" && !String((resolvedArgs as any).threadId || "").trim()
              ? ({ ...resolvedArgs, threadId } as Record<string, unknown>)
              : resolvedArgs;
          if (key === "ai_chat.scheduled.create") return patchArgsForScheduledCreate(withThread, localCtx);
          if (key === "ai_chat.scheduled.reschedule") return patchArgsForScheduledReschedule(withThread, localCtx);
          return withThread;
        })();

        allResolvedSteps.push({ key, title, args: resolvedArgsWithThread });
        allContextPatches.push(resolved.contextPatch);
        if (resolved.contextPatch && typeof resolved.contextPatch === "object" && !Array.isArray(resolved.contextPatch)) {
          localCtx = { ...localCtx, ...(resolved.contextPatch as any) };
        }

        localCtx = await persistLiveStatus(
          {
            phase: "executing",
            label: `Running ${title || key}`,
            actionKey: key,
            title,
            round: round + 1,
            completedSteps: Math.max(0, allResolvedSteps.length - 1),
            lastCompletedTitle: allResolvedSteps.length > 1 ? allResolvedSteps[allResolvedSteps.length - 2]?.title || null : null,
          },
          localCtx,
        );
        if (await checkInterruptRequested()) {
          return await buildStoppedAssistantMessage(responseUserMessage);
        }
        const exec = await executePortalAgentAction({ ownerId, actorUserId: createdByUserId, action: key, args: resolvedArgsWithThread });
        const cua = (exec as any).clientUiAction ?? null;
        const execError = typeof (exec as any).error === "string" ? String((exec as any).error).trim().slice(0, 800) : "";
        const execResult = (exec as any).result ?? (execError ? { ok: false, error: execError } : null);
        allResults.push({
          ok: Boolean((exec as any).ok),
          status: Number((exec as any).status) || 0,
          action: key,
          args: resolvedArgsWithThread,
          result: execResult,
          linkUrl: (exec as any).linkUrl ?? null,
          clientUiAction: cua,
          ...(execError ? { error: execError } : {}),
        } as any);
        if (cua) allClientUiActions.push(cua);

        if (!Boolean((exec as any).ok) || Number((exec as any).status) < 200 || Number((exec as any).status) >= 300) {
          const failureMeta = ((exec as any).failureMeta as PortalAgentFailureMeta | null | undefined) ||
            classifyPortalAgentFailure({ status: Number((exec as any).status) || 0, error: execError, result: (exec as any).result ?? null });
          lastAutoExecutionError = {
            action: String(key),
            status: Number((exec as any).status) || 0,
            error: String(execError || "Execution failed").slice(0, 800),
          };
          if (failureMeta && (failureMeta.retryable || failureMeta.kind !== "unknown")) {
            finalDirectMessage = buildExecutionFailureDirectMessage({
              title,
              error: execError || "Execution failed.",
              status: Number((exec as any).status) || 0,
              failureMeta,
            });
            break;
          }
          blockedForReplan = true;
          break;
        }

        const derivedPatch = deriveThreadContextPatchFromAction(key, resolvedArgsWithThread, (exec as any).result);
        if (derivedPatch && typeof derivedPatch === "object" && !Array.isArray(derivedPatch)) {
          allContextPatches.push(derivedPatch);
          localCtx = { ...localCtx, ...(derivedPatch as any) };
        }
      }

        if (blockedForReplan) {
          if (round + 1 < MAX_AUTORUN_ROUNDS) continue;
          break;
        }

        if (allResolvedSteps.length >= MAX_TOTAL_ACTIONS) {
          finalDirectMessage = null;
          break;
        }
      }

      const mappedCanvasUrl =
        (allResolvedSteps.map((s) => portalCanvasUrlForAction(s.key, s.args)).filter(Boolean).slice(-1)[0] as string | undefined) || null;
      const normalizedResolved = collapseRedundantConflictSteps(allResolvedSteps, allResults);
      const effectiveResolvedSteps = normalizedResolved.steps;
      const effectiveAllResults = normalizedResolved.results;
      const canvasUrl =
        (effectiveAllResults.filter((r) => r.ok).map((r) => r.linkUrl).filter(Boolean).slice(-1)[0] as string | undefined) || mappedCanvasUrl || null;

      let assistantTextFinal = "";
      try {
        if (await checkInterruptRequested()) {
          return await buildStoppedAssistantMessage(responseUserMessage);
        }
        localCtx = await persistLiveStatus(
          {
            phase: "summarizing",
            label: "Summarizing what I just did",
            round: Math.max(1, Math.min(MAX_AUTORUN_ROUNDS, allResolvedSteps.length ? seenPlanKeys.size || 1 : 1)),
            completedSteps: allResolvedSteps.length,
            lastCompletedTitle: allResolvedSteps[allResolvedSteps.length - 1]?.title || null,
          },
          localCtx,
        );
        const normalizedResolved = collapseRedundantConflictSteps(allResolvedSteps, allResults);
        const effectiveResolvedSteps = normalizedResolved.steps;
        const effectiveAllResults = normalizedResolved.results;
        const resultsForSummary = effectiveAllResults.map((r: any) => {
          const cleaned = stripAssistantVisibleAccountingFields((r as any)?.result);
          const extractedError =
            cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && typeof (cleaned as any).error === "string"
              ? String((cleaned as any).error).trim().slice(0, 500)
              : null;
          const fallbackError = typeof (r as any)?.error === "string" ? String((r as any).error).trim().slice(0, 500) : null;
          const returnedQuestion =
            cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && typeof (cleaned as any).question === "string"
              ? String((cleaned as any).question).trim().slice(0, 800)
              : null;
          const returnedActionsCount =
            cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && Array.isArray((cleaned as any).actions)
              ? Math.min(12, ((cleaned as any).actions as unknown[]).length)
              : 0;
          const proposalOnly =
            String((r as any).action || "") === "funnel_builder.custom_code_block.generate" &&
            Boolean(returnedQuestion || returnedActionsCount || (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && (typeof (cleaned as any).html === "string" || typeof (cleaned as any).css === "string")));
          const completed = Boolean((r as any).ok) && Number((r as any).status) >= 200 && Number((r as any).status) < 300 && !returnedQuestion && !proposalOnly;
          return {
            ok: Boolean((r as any).ok),
            completed,
            status: Number((r as any).status) || 0,
            action: (r as any).action,
            args: (r as any).args,
            linkUrl: (r as any).linkUrl ?? null,
            clientUiAction: (r as any).clientUiAction ?? null,
            question: returnedQuestion,
            proposalOnly,
            returnedActionsCount,
            error: extractedError || fallbackError,
            result: cleaned,
          };
        });

        const workTitle = effectiveResolvedSteps[0]?.title || effectiveResolvedSteps[0]?.key || "";
        const okCount = resultsForSummary.filter((r: any) => r && r.completed).length;
        const failedCount = resultsForSummary.filter((r: any) => !r || !r.ok || Number(r.status) < 200 || Number(r.status) >= 300).length;
        const pendingCount = resultsForSummary.filter((r: any) => r && r.ok && !r.completed).length;
        const shouldReuseStepAssistantText =
          effectiveResolvedSteps.length > 0 &&
          failedCount === 0 &&
          pendingCount === 0 &&
          effectiveResolvedSteps.every((step) => isReadOnlyPortalAgentAction(String(step?.key || "") as PortalAgentActionKey));
        const lastStepAssistantText = shouldReuseStepAssistantText
          ? String((effectiveAllResults[effectiveAllResults.length - 1] as any)?.assistantMessage?.text || "").trim().slice(0, 12_000)
          : "";

        const directMessage = finalDirectMessage ? String(finalDirectMessage).trim().slice(0, 800) : "";
        assistantTextFinal = lastStepAssistantText
          ? stripEmptyAssistantBullets(lastStepAssistantText)
          : stripEmptyAssistantBullets(
              String(
                await generateText({
                  system: [
                    "You are Pura, an AI assistant inside a SaaS portal.",
                    "Write a normal chat reply (not a report).",
                    "Hard constraint: NEVER claim an action succeeded unless ALL steps are completed=true.",
                    "If ANY step has ok=false or a non-2xx status, you must clearly say it failed and what happens next.",
                    "If ANY step returned a question or proposalOnly=true, you must clearly say the work is not finished yet.",
                    "Do not ask the user to do the portal work themselves unless you truly need missing info.",
                    "Formatting rules:",
                    "- 1-3 short paragraphs.",
                    "- NO headings, NO bullet lists, NO tables.",
                    "- Do NOT print raw JSON or field dumps.",
                    "- Do NOT use labels like 'Action:', 'Status:', 'Result:'.",
                    "- Never invent URLs, domains, or links. Only mention a link when linkUrl or canvasUrl is explicitly provided, and use that exact path/value.",
                    "- Never output bare relative paths like /portal/app/... . If you mention a URL, always write the full https://purelyautomation.com/... absolute URL.",
                    "Content rules:",
                    "- Say what you did and the outcome in plain language.",
                    "- If something failed, say what failed and the next step.",
                    "- If something is pending because the tool asked a question or only produced a proposal, say that directly and do not pretend the edit happened.",
                    "- If you need the user to choose something, ask ONE specific question.",
                  ].join("\n"),
                  user: `Action execution results (JSON):\n${JSON.stringify(
                    {
                      workTitle,
                      steps: effectiveResolvedSteps,
                      results: resultsForSummary,
                      summary: { total: effectiveResolvedSteps.length, okCount, failedCount, pendingCount },
                      modelDirectMessage: directMessage || null,
                      canvasUrl,
                      userPrompt: String(promptMessage || "").slice(0, 2000),
                    },
                    null,
                    2,
                  )}`,
                }),
              ),
            );
      } catch {
        assistantTextFinal = finalDirectMessage || "";
      }

      assistantTextFinal = absolutizeAssistantTextLinks(assistantTextFinal);

      const assistantMsg = assistantTextFinal.trim()
        ? await (prisma as any).portalAiChatMessage.create({
            data: { ownerId, threadId, role: "assistant", text: assistantTextFinal.slice(0, 12_000), attachmentsJson: null, createdByUserId: null, sendAt: null, sentAt: now },
            select: { id: true, role: true, text: true, attachmentsJson: true, createdAt: true, sendAt: true, sentAt: true },
          })
        : null;

      const mergedPatch = Object.assign({}, ...allContextPatches.filter(Boolean));
      const prevCtx = localCtx && typeof localCtx === "object" && !Array.isArray(localCtx) ? localCtx : {};
      const prevRuns = Array.isArray((prevCtx as any).runs) ? ((prevCtx as any).runs as unknown[]) : [];
      const runTrace = {
        at: now.toISOString(),
        workTitle: effectiveResolvedSteps[0]?.title || effectiveResolvedSteps[0]?.key || null,
        assistantMessageId: assistantMsg?.id ?? null,
        steps: effectiveResolvedSteps.map((s, idx) => ({ key: s.key, title: s.title, ok: Boolean(effectiveAllResults[idx]?.ok), linkUrl: effectiveAllResults[idx]?.linkUrl ?? null })),
        canvasUrl,
      };
      const runs = [...prevRuns.slice(-19), runTrace];
      const finalPendingCount = effectiveAllResults.filter((r: any) => Boolean(r.ok) && (r?.result?.question || (Array.isArray(r?.result?.actions) && r.result.actions.length))).length;
      const finalFailedCount = effectiveAllResults.filter((r) => !Boolean(r.ok) || Number(r.status) < 200 || Number(r.status) >= 300).length;
      const finalOkCount = effectiveAllResults.filter((r) => Boolean(r.ok) && Number(r.status) >= 200 && Number(r.status) < 300).length;

      const completedRunId = activeRunId;
      const completedRunStartedAt = activeRunStartedAt;
      const finalRunStatus: PortalAiChatRunStatus = finalPendingCount > 0 ? "needs_input" : finalFailedCount > 0 ? (finalOkCount > 0 ? "partial" : "failed") : "completed";
      const nextCtx = completeInterruptibleRun(
        finalRunStatus === "completed"
          ? clearNextStepContext(clearUnresolvedRun({
              ...prevCtx,
              ...mergedPatch,
              lastWorkTitle: effectiveResolvedSteps[0]?.title || effectiveResolvedSteps[0]?.key || null,
              lastCanvasUrl: canvasUrl,
              pendingAction: null,
              pendingActionClarify: null,
              pendingPlan: null,
              pendingPlanClarify: null,
              runs,
            }))
          : withUnresolvedRun(
              clearNextStepContext({
                ...prevCtx,
                ...mergedPatch,
                lastWorkTitle: effectiveResolvedSteps[0]?.title || effectiveResolvedSteps[0]?.key || null,
                lastCanvasUrl: canvasUrl,
                pendingAction: null,
                pendingActionClarify: null,
                pendingPlan: null,
                pendingPlanClarify: null,
                runs,
              }),
              {
                status: finalRunStatus as UnresolvedRunStatus,
                runId: completedRunId,
                updatedAt: now.toISOString(),
                workTitle: effectiveResolvedSteps[0]?.title || effectiveResolvedSteps[0]?.key || null,
                summaryText: assistantMsg?.text ?? null,
                userRequest: promptMessage,
                lastCompletedTitle: effectiveResolvedSteps[effectiveResolvedSteps.length - 1]?.title || null,
                canvasUrl,
              },
            ),
      );

      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
      if (assistantTextFinal) await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: assistantTextFinal });

      const openScheduledTasks = effectiveResolvedSteps.some((s) => String(s.key || "").startsWith("ai_chat.scheduled."));
      const followUpSuggestions = buildProactiveFollowUpSuggestions({
        actionKeys: effectiveResolvedSteps.map((s) => String(s.key || "")).filter(Boolean),
        canvasUrl,
        promptText: promptMessage,
        completedCount: finalOkCount,
        failedCount: finalFailedCount,
        pendingCount: finalPendingCount,
      });
      const finalizedCtx =
        finalRunStatus === "completed"
          ? withNextStepContext(nextCtx, {
              updatedAt: now.toISOString(),
              objective: promptMessage,
              workTitle: effectiveResolvedSteps[0]?.title || effectiveResolvedSteps[0]?.key || null,
              summaryText: assistantMsg?.text ?? null,
              suggestedPrompt: followUpSuggestions[0] ?? null,
              suggestions: followUpSuggestions,
              canvasUrl,
            })
          : nextCtx;
      const persistedCtx = withPersistedFollowUpSuggestions(finalizedCtx, assistantMsg?.id, followUpSuggestions);
      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: persistedCtx } });
      await persistActiveChatRun({
        status: finalRunStatus,
        runId: completedRunId,
        startedAt: completedRunStartedAt,
        runTrace,
        summaryText: assistantMsg?.text ?? null,
        followUpSuggestions,
        completedAt: now,
      });
      persistedThreadContext = persistedCtx;
      return NextResponse.json({ ok: true, userMessage: responseUserMessage, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl, assistantChoices: null, clientUiActions: allClientUiActions, openScheduledTasks, runTrace, followUpSuggestions });
    } catch {
      try {
        await persistLiveStatus(null);
      } catch {
        // ignore
      }
      // If planning fails, fall through to existing behavior.
    }

    const promptForFallback = String(promptMessage || "").trim();
    const smsThreadMatch = promptForFallback.match(/\b(?:text|sms)\s+thread\s+with\s+(.+?)\s*\??$/i);
    const shouldRunInboxSummaryFallback = /\bsummarize\s+my\s+inbox\b|\bwhat\s+needs\s+attention\b/i.test(promptForFallback);
    const shouldRunReceptionistFallback = /\brecent\s+ai\s+receptionist\s+calls\b|\bai\s+receptionist\s+calls\b/i.test(promptForFallback);
    const shouldRunOpenTasksFallback = /\bwhat\s+open\s+tasks\s+do\s+i\s+have\b|\bopen\s+tasks\b/i.test(promptForFallback);
    const mikeTaskMatch = promptForFallback.match(/\btask\b.*\babout\s+(.+?)\s*\??$/i);
    const supportFallbackNoDataPattern = /there (?:is|are|were) no recent (?:messages|calls)|couldn't retrieve any information|tool didn't find any data|nothing to report at this time/i;

    const heuristicFallbackAction = smsThreadMatch
      ? {
          action: "inbox.threads.list" as PortalAgentActionKey,
          title: "Find SMS Thread",
          args: { channel: "SMS", q: smsThreadMatch[1]?.trim() || promptForFallback, take: 10 },
        }
      : shouldRunInboxSummaryFallback
        ? {
            action: "inbox.threads.list" as PortalAgentActionKey,
            title: "Summarize Inbox",
            args: { channel: "ALL", take: 20, allChannels: true, needsReply: true },
          }
        : mikeTaskMatch
          ? {
              action: "tasks.list" as PortalAgentActionKey,
              title: "Find Matching Task",
              args: { status: "ALL", q: mikeTaskMatch[1]?.trim() || promptForFallback, limit: 20 },
            }
          : shouldRunOpenTasksFallback
            ? {
                action: "tasks.list" as PortalAgentActionKey,
                title: "List Open Tasks",
                args: { status: "OPEN", limit: 20 },
              }
            : shouldRunReceptionistFallback
              ? {
                  action: "ai_receptionist.highlights.get" as PortalAgentActionKey,
                  title: "Summarize AI Receptionist Calls",
                  args: { lookbackHours: 24 * 7, limit: 20 },
                }
              : null;

    const buildHeuristicAssistantText = (traceKey: string, result: any, linkUrl?: string | null) => {
      const cta = formatAssistantMarkdownLink(
        traceKey === "inbox.thread.messages.list"
          ? "Open Conversation"
          : traceKey === "ai_receptionist.highlights.get"
            ? "Open Receptionist"
            : "Open Inbox",
        typeof linkUrl === "string" ? linkUrl.trim() : null,
      );
      if (traceKey === "inbox.threads.list") {
        const threads = Array.isArray(result?.threads) ? (result.threads as any[]) : [];
        if (!threads.length) return "I couldn't find any inbox threads that need attention right now.";
        const highlights = threads.slice(0, 4).map((thread) => {
          const contactName = typeof thread?.contact?.name === "string" && thread.contact.name.trim()
            ? String(thread.contact.name).trim()
            : String(thread?.peerAddress || "Conversation").trim() || "Conversation";
          const channel = String(thread?.channel || "").trim().toUpperCase();
          const preview = typeof thread?.lastMessagePreview === "string" ? String(thread.lastMessagePreview).trim().replace(/\s+/g, " ").slice(0, 140) : "";
          const needsReply = thread?.needsReply === true ? "needs a reply" : "is active";
          return `${contactName}${channel ? ` on ${channel}` : ""} ${needsReply}${preview ? ` - ${preview}` : ""}`;
        });
        return `I pulled the inbox conversations that matter most right now. ${highlights.join("; ")}.${cta ? `\n\n${cta}` : ""}`;
      }

      if (traceKey === "inbox.thread.messages.list") {
        const messages = Array.isArray(result?.messages) ? (result.messages as any[]) : [];
        if (!messages.length) return "I found that conversation, but there are no messages in it yet.";
        const lines = messages.slice(-4).map((message) => {
          const direction = String(message?.direction || "").trim().toUpperCase() === "OUT" ? "You" : "Contact";
          const body = typeof message?.bodyText === "string" ? String(message.bodyText).trim().replace(/\s+/g, " ").slice(0, 160) : "";
          return `${direction}: ${body || "(no text)"}`;
        });
        return `Here’s the recent flow from that SMS conversation: ${lines.join(" | ")}.${cta ? `\n\n${cta}` : ""}`;
      }

      if (traceKey === "ai_receptionist.highlights.get") {
        const stats = result?.stats && typeof result.stats === "object" ? result.stats : null;
        if (!stats) return "I couldn't find any recent AI receptionist call data to summarize.";
        const lines = [
          `${Number(stats.total || 0)} recent calls total`,
          `${Number(stats.completed || 0)} completed`,
          `${Number(stats.failed || 0)} failed`,
          `${Number(stats.inProgress || 0)} still in progress`,
        ];
        const warnings = Array.isArray(result?.warnings) ? (result.warnings as string[]) : [];
        const issues = Array.isArray(result?.issues) ? (result.issues as any[]) : [];
        const extras = [
          warnings.length ? `Warning: ${String(warnings[0] || "").trim()}` : "",
          issues.length ? `Top issue: ${String(issues[0]?.summary || "").trim()}` : "",
        ].filter(Boolean);
        return `Here’s the recent AI receptionist snapshot: ${lines.join(", ")}.${extras.length ? ` ${extras.join(". ")}.` : ""}${cta ? `\n\n${cta}` : ""}`;
      }

      return null;
    };

    const tryHeuristicFallbackResponse = async () => {
      if (!heuristicFallbackAction) return null;

      try {
        let exec = await executePortalAgentAction({
          ownerId,
          actorUserId: memberId,
          action: heuristicFallbackAction.action,
          args: heuristicFallbackAction.args as Record<string, unknown>,
        });
        let traceKey = heuristicFallbackAction.action;
        let traceTitle = heuristicFallbackAction.title;

        if (smsThreadMatch && Boolean((exec as any)?.ok)) {
          const threads = Array.isArray((exec as any)?.result?.threads) ? ((exec as any).result.threads as any[]) : [];
          const firstThreadId = typeof threads[0]?.id === "string" ? String(threads[0].id).trim() : "";
          if (firstThreadId) {
            const secondExec = await executePortalAgentAction({
              ownerId,
              actorUserId: memberId,
              action: "inbox.thread.messages.list",
              args: { threadId: firstThreadId, take: 20, channel: "SMS" },
            });
            if ((secondExec as any)?.ok || typeof (secondExec as any)?.assistantText === "string" || Array.isArray((secondExec as any)?.result?.messages)) {
              exec = secondExec as any;
              traceKey = "inbox.thread.messages.list";
              traceTitle = "Summarize SMS Thread";
            }
          }
        }

        const canvasUrl = typeof (exec as any)?.linkUrl === "string" ? String((exec as any).linkUrl).trim().slice(0, 1200) : null;
        let assistantMsg = null;
        const assistantText = typeof (exec as any)?.assistantText === "string" ? absolutizeAssistantTextLinks(String((exec as any).assistantText).trim()) : "";
        const fallbackText = absolutizeAssistantTextLinks(assistantText || buildHeuristicAssistantText(traceKey, (exec as any)?.result, canvasUrl));
        if (fallbackText) {
          assistantMsg = await (prisma as any).portalAiChatMessage.create({
            data: {
              ownerId,
              threadId,
              role: "assistant",
              text: fallbackText,
              attachmentsJson: null,
              createdByUserId: null,
              sendAt: null,
              sentAt: now,
            },
            select: {
              id: true,
              role: true,
              text: true,
              attachmentsJson: true,
              createdAt: true,
              sendAt: true,
              sentAt: true,
            },
          });
        }
        if (!assistantMsg) return null;

        const runTrace = {
          at: now.toISOString(),
          workTitle: traceTitle,
          assistantMessageId: assistantMsg?.id ?? null,
          steps: [{ key: traceKey, title: traceTitle, ok: Boolean((exec as any)?.ok), linkUrl: canvasUrl }],
          canvasUrl,
        };
        const prevCtx = persistedThreadContext && typeof persistedThreadContext === "object" && !Array.isArray(persistedThreadContext) ? (persistedThreadContext as any) : {};
        const prevRuns = Array.isArray(prevCtx.runs) ? (prevCtx.runs as unknown[]) : [];
        const followUpSuggestions = buildProactiveFollowUpSuggestions({
          actionKeys: [traceKey],
          canvasUrl,
          promptText: promptMessage,
          completedCount: Boolean((exec as any)?.ok) ? 1 : 0,
          failedCount: Boolean((exec as any)?.ok) ? 0 : 1,
          pendingCount: 0,
        });
        const nextCtx = withPersistedFollowUpSuggestions(
          {
            ...prevCtx,
            lastWorkTitle: traceTitle,
            lastCanvasUrl: canvasUrl,
            runs: [...prevRuns.slice(-19), runTrace],
          },
          assistantMsg?.id,
          followUpSuggestions,
        );

        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
        await persistActiveChatRun({
          status: Boolean((exec as any)?.ok) ? "completed" : "failed",
          runId: activeRunId,
          startedAt: activeRunStartedAt,
          runTrace,
          summaryText: typeof assistantMsg?.text === "string" ? assistantMsg.text : null,
          followUpSuggestions,
          completedAt: now,
        });

        return NextResponse.json({
          ok: true,
          userMessage: responseUserMessage,
          assistantMessage: assistantMsg,
          assistantActions: [],
          autoActionMessage: null,
          canvasUrl,
          assistantChoices: (exec as any)?.assistantChoices ?? null,
          clientUiActions: Array.isArray((exec as any)?.clientUiAction) ? (exec as any).clientUiAction : (exec as any)?.clientUiAction ? [(exec as any).clientUiAction] : [],
          runTrace,
          followUpSuggestions,
        });
      } catch (error) {
        console.error("[portal-ai-chat] heuristic fallback failed", {
          prompt: promptForFallback,
          action: heuristicFallbackAction.action,
          error: error instanceof Error ? error.message : String(error ?? ""),
        });
        return null;
      }
    };

    const heuristicFallbackResponse = await tryHeuristicFallbackResponse();
    if (heuristicFallbackResponse) {
      return heuristicFallbackResponse;
    }

    const tryHostedPageDirectFallbackResponse = async () => {
      const fallbackSurfaceHint = describeDirectIntentSurface({
        url: contextUrl,
        canvasUrl: null,
        contextKeys: [],
      });
      const fallbackPrompt = [fallbackSurfaceHint, promptForFallback].filter(Boolean).join("\n\n");
      const signals = detectPuraDirectIntentSignals(promptForFallback || fallbackPrompt, fallbackThreadContext);
      const hasHostedDirectIntent = Boolean(
        signals.hostedPageGenerateTarget ||
          signals.hostedPageUpdateTarget ||
          signals.hostedPagePublishTarget ||
          signals.hostedPageResetTarget ||
          signals.hostedPagePreviewTarget ||
          signals.hostedPageGetTarget ||
          signals.hostedPageListService,
      );
      if (!hasHostedDirectIntent) return null;

      const directPrerequisiteMessage = getPuraDirectPrerequisiteMessage({ signals, threadContext: fallbackThreadContext });
      if (directPrerequisiteMessage) {
        const assistantMsg = await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: absolutizeAssistantTextLinks(directPrerequisiteMessage),
            attachmentsJson: null,
            createdByUserId: null,
            sendAt: null,
            sentAt: now,
          },
          select: {
            id: true,
            role: true,
            text: true,
            attachmentsJson: true,
            createdAt: true,
            sendAt: true,
            sentAt: true,
          },
        });
        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now } });
        return NextResponse.json({
          ok: true,
          userMessage: responseUserMessage,
          assistantMessage: assistantMsg,
          assistantActions: [],
          autoActionMessage: null,
          canvasUrl: null,
          assistantChoices: null,
          clientUiActions: [],
        });
      }

      const plan = getPuraDirectActionPlan({ prompt: promptForFallback, signals, threadContext: fallbackThreadContext });
      if (!plan) return null;

      const exec = await executePortalAgentAction({
        ownerId,
        actorUserId: createdByUserId,
        action: plan.action,
        args: plan.args,
      });
      const assistantText = typeof (exec as any)?.assistantText === "string" ? absolutizeAssistantTextLinks(String((exec as any).assistantText).trim()) : "";
      if (!assistantText) return null;

      const assistantMsg = await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "assistant",
          text: assistantText,
          attachmentsJson: null,
          createdByUserId: null,
          sendAt: null,
          sentAt: now,
        },
        select: {
          id: true,
          role: true,
          text: true,
          attachmentsJson: true,
          createdAt: true,
          sendAt: true,
          sentAt: true,
        },
      });

      const canvasUrl = typeof (exec as any)?.linkUrl === "string" ? String((exec as any).linkUrl).trim().slice(0, 1200) : null;
      const prevCtx = persistedThreadContext && typeof persistedThreadContext === "object" && !Array.isArray(persistedThreadContext) ? (persistedThreadContext as any) : {};
      const prevRuns = Array.isArray(prevCtx.runs) ? (prevCtx.runs as unknown[]) : [];
      const derivedPatch = deriveThreadContextPatchFromAction(plan.action, plan.args, (exec as any)?.result);
      const runTrace = {
        at: now.toISOString(),
        workTitle: plan.traceTitle,
        assistantMessageId: assistantMsg.id,
        steps: [{ key: plan.action, title: plan.traceTitle, ok: Boolean((exec as any)?.ok), linkUrl: canvasUrl }],
        canvasUrl,
      };
      const followUpSuggestions = buildProactiveFollowUpSuggestions({
        actionKeys: [plan.action],
        canvasUrl,
        promptText: promptMessage,
        completedCount: Boolean((exec as any)?.ok) ? 1 : 0,
        failedCount: Boolean((exec as any)?.ok) ? 0 : 1,
        pendingCount: 0,
      });
      const nextCtx = withPersistedFollowUpSuggestions(
        {
          ...prevCtx,
          ...(derivedPatch && typeof derivedPatch === "object" && !Array.isArray(derivedPatch) ? (derivedPatch as any) : {}),
          lastWorkTitle: plan.traceTitle,
          lastCanvasUrl: canvasUrl,
          runs: [...prevRuns.slice(-19), runTrace],
        },
        assistantMsg.id,
        followUpSuggestions,
      );

      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
      await persistActiveChatRun({
        status: Boolean((exec as any)?.ok) ? "completed" : "failed",
        runId: activeRunId,
        startedAt: activeRunStartedAt,
        runTrace,
        summaryText: assistantText,
        followUpSuggestions,
        completedAt: now,
      });
      persistedThreadContext = nextCtx;

      return NextResponse.json({
        ok: true,
        userMessage: responseUserMessage,
        assistantMessage: assistantMsg,
        assistantActions: [],
        autoActionMessage: null,
        canvasUrl,
        assistantChoices: null,
        clientUiActions: Array.isArray((exec as any)?.clientUiAction)
          ? (exec as any).clientUiAction
          : (exec as any)?.clientUiAction
            ? [(exec as any).clientUiAction]
            : [],
        runTrace,
        followUpSuggestions,
      });
    };

    const hostedPageDirectFallbackResponse = await tryHostedPageDirectFallbackResponse();
    if (hostedPageDirectFallbackResponse) {
      return hostedPageDirectFallbackResponse;
    }

    // If agentic planning didn't return a response, fall back to support chat.
    // AI-first: if model generation fails, omit the assistant bubble.
    try {
      const reply = await runPortalSupportChat({
        message: promptMessage,
        url: contextUrl,
        recentMessages: modelMessages,
        threadContext: fallbackThreadContext,
      });

      const replyText = typeof reply === "string" ? absolutizeAssistantTextLinks(reply.trim()) : "";
      if (replyText) {
        if (heuristicFallbackAction && supportFallbackNoDataPattern.test(replyText)) {
          const heuristicAfterSupport = await tryHeuristicFallbackResponse();
          if (heuristicAfterSupport) {
            return heuristicAfterSupport;
          }
        }
        await persistLiveStatus({ phase: "summarizing", label: "Writing the reply" });
        const assistantMsg = await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: replyText,
            attachmentsJson: null,
            createdByUserId: null,
            sendAt: null,
            sentAt: now,
          },
          select: {
            id: true,
            role: true,
            text: true,
            attachmentsJson: true,
            createdAt: true,
            sendAt: true,
            sentAt: true,
          },
        });

        const completedRunId = activeRunId;
        const completedRunStartedAt = activeRunStartedAt;
        const prevCtx = persistedThreadContext && typeof persistedThreadContext === "object" && !Array.isArray(persistedThreadContext) ? (persistedThreadContext as any) : {};
        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: completeInterruptibleRun(clearNextStepContext(clearUnresolvedRun(prevCtx))) } });
        await persistActiveChatRun({
          status: "completed",
          runId: completedRunId,
          startedAt: completedRunStartedAt,
          runTrace: {
            assistantMessageId: assistantMsg?.id ?? null,
          },
          summaryText: replyText,
          completedAt: now,
        });
        await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: replyText });

        return NextResponse.json({
          ok: true,
          userMessage: responseUserMessage,
          assistantMessage: assistantMsg,
          assistantActions: [],
          autoActionMessage: null,
          canvasUrl: null,
          assistantChoices: null,
          clientUiActions: [],
        });
      }
    } catch (error) {
      const failureSummary =
        aiConfigErrorMessage ||
        (error instanceof Error && error.message.trim() ? error.message.trim().slice(0, 400) : "Run ended before Pura could produce a reply.");
      try {
        await persistActiveChatRun({
          status: "failed",
          summaryText: failureSummary,
          completedAt: now,
        });
        await persistThreadContext(
          completeInterruptibleRun(
            withUnresolvedRun(clearNextStepContext(persistedThreadContext), {
              status: "failed",
              runId: activeRunId,
              updatedAt: now.toISOString(),
              workTitle: null,
              summaryText: failureSummary,
              userRequest: promptMessage,
              canvasUrl: null,
            }),
          ),
        );
      } catch {
        // ignore
      }
      // ignore
    }
  }

  const finalFailureSummary = aiConfigErrorMessage || "Run ended without a reply.";

  try {
    await persistActiveChatRun({
      status: "failed",
      summaryText: finalFailureSummary,
      completedAt: now,
    });
    await persistThreadContext(
      completeInterruptibleRun(
        withUnresolvedRun(clearNextStepContext(persistedThreadContext), {
          status: "failed",
          runId: activeRunId,
          updatedAt: now.toISOString(),
          workTitle: null,
          summaryText: finalFailureSummary,
          userRequest: promptMessage,
          canvasUrl: null,
        }),
      ),
    );
  } catch {
    // ignore
  }

  // AI-first: no deterministic routing/shortcuts, and no deterministic assistant bubble copy.
  return NextResponse.json({
    ok: false,
    error: finalFailureSummary,
    code: aiConfigErrorMessage ? "AI_UNAVAILABLE" : "NO_ASSISTANT_REPLY",
    userMessage: responseUserMessage,
    assistantMessage: null,
    assistantActions: [],
    autoActionMessage: null,
    canvasUrl: null,
    assistantChoices: null,
    clientUiActions: [],
  }, { status: aiConfigErrorMessage ? 503 : 500 });
}

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  try {
    const cloned = req.clone();
    const body = await cloned.json().catch(() => null);
    const requestedResponseProfileRaw = typeof body?.responseProfile === "string" ? String(body.responseProfile).trim() : "";
    const requestedResponseProfile = requestedResponseProfileRaw ? normalizePuraAiProfile(requestedResponseProfileRaw) : null;
    const { threadId } = await ctx.params;
    const thread = await (prisma as any).portalAiChatThread.findFirst({
      where: { id: threadId },
      select: { contextJson: true },
    }).catch(() => null);
    const storedResponseProfile = normalizePuraAiProfile((thread as any)?.contextJson?.responseProfile);
    const activeResponseProfile = requestedResponseProfile || storedResponseProfile;
    return await runWithPuraAiProfile(activeResponseProfile, async () => await handlePostMessage(req, ctx));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[AI Chat POST Error]", { message, stack: err instanceof Error ? err.stack : undefined });
    return NextResponse.json(
      { ok: false, error: String(message && typeof message === "string" ? message : "Send failed").slice(0, 500) },
      { status: 500 },
    );
  }
}
