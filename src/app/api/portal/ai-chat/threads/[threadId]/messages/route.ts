import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { generateText } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";
import {
  PortalAgentActionKeySchema,
  extractJsonObject,
  portalAgentActionsIndexText,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import { deriveThreadContextPatchFromAction, executePortalAgentAction, executePortalAgentActionForThread } from "@/lib/portalAgentActionExecutor";
import { getConfirmSpecForPortalAgentAction, portalCanvasUrlForAction, portalContactUiUrl } from "@/lib/portalAgentActionMeta";
import { encodeScheduledActionEnvelope } from "@/lib/portalAiChatScheduledActionEnvelope";
import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";
import { planPuraActions } from "@/lib/puraPlanner";
import { resolvePlanArgs } from "@/lib/puraResolver";

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

const SendMessageSchema = z
  .object({
    text: z.string().trim().max(4000).optional(),
    url: z.string().trim().optional(),
    canvasUrl: z.string().trim().max(1200).optional(),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    clientTimeZone: z.string().trim().max(80).optional(),
    confirmToken: z.string().trim().min(1).max(200).optional(),
    choice: ChoiceSchema,
    redoLastAssistant: z.boolean().optional(),
  })
  .refine(
    (d) =>
      Boolean((d as any).redoLastAssistant) ||
      Boolean(String((d as any).confirmToken || "").trim()) ||
      Boolean((d.text || "").trim()) ||
      Boolean((d as any).choice) ||
      (Array.isArray(d.attachments) && d.attachments.length > 0),
    { message: "Text or attachments required" },
  );

function toAbsoluteHttpUrl(raw: string, reqUrl: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const u = s.startsWith("/") ? new URL(s, reqUrl) : new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
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

function imageUrlsFromAttachments(attachments: any[], reqUrl: string): string[] {
  if (!Array.isArray(attachments) || !attachments.length) return [];
  const out: string[] = [];
  for (const a of attachments.slice(0, 10)) {
    if (!looksLikeImageAttachment(a)) continue;
    const abs = toAbsoluteHttpUrl(String(a?.url || ""), reqUrl);
    if (abs) out.push(abs);
    if (out.length >= 8) break;
  }
  return out;
}

function cleanSuggestedTitle(raw: string): string {
  const s = String(raw || "").trim().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  // Keep it short and UI-friendly.
  return s.replace(/^"|"$/g, "").replace(/^'|'$/g, "").slice(0, 60).trim();
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

function buildDeterministicWeekdaySmsPlan(opts: {
  text: string;
  ownerTimeZone?: string;
}): { mode: "execute"; workTitle: string; steps: Array<{ key: any; title: string; args: Record<string, unknown> }> } | null {
  const text = String(opts.text || "");
  if (!looksLikeWeekdaySmsSchedule(text)) return null;

  const contactHint = extractContactHint(text) || "Chester";
  const timeLocal = extractTimeLocalHHmm(text) || "09:00";
  const tz = String(opts.ownerTimeZone || "").trim().slice(0, 80);

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

  const createAssistantMessage = async (text: string) => {
    const assistantMsg = await (prisma as any).portalAiChatMessage.create({
      data: {
        ownerId,
        threadId,
        role: "assistant",
        text: String(text || "").slice(0, 12000),
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
    return {
      ok: false,
      assistantMessage: await createAssistantMessage(
        `I found multiple matches for “${plan.contactHint}”. Please select the correct contact below.`
      ),
      ambiguousContacts: ambiguous.slice(0, 5),
      canvasUrl: null,
    };
  }

  if (!contact) {
    const msg = await createAssistantMessage(
      `I couldn’t find a contact for “${plan.contactHint}”. Reply with their email or phone number and I’ll update their tags.`,
    );
    return { ok: false, assistantMessage: msg, canvasUrl: null };
  }

  const results: string[] = [];
  let anyOk = false;

  for (const rawName of plan.removeTagNames) {
    const name = cleanShortLabel(rawName, 60);
    if (!name || isBadTagName(name)) continue;
    const tagRow = await (prisma as any).portalContactTag
      .findFirst({ where: { ownerId, nameKey: normalizeNameKey(name) }, select: { id: true, name: true } })
      .catch(() => null);
    if (!tagRow?.id) {
      results.push(`No tag named “${name}” exists.`);
      continue;
    }

    const ok = await removeContactTagAssignment({ ownerId, contactId: contact.id, tagId: String(tagRow.id) });
    if (ok) {
      anyOk = true;
      results.push(`Removed tag “${String(tagRow.name)}” from ${contact.name}.`);
    } else {
      results.push(`${contact.name} didn’t have tag “${String(tagRow.name)}”.`);
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
      results.push(`I couldn’t create or find the “${name}” tag.`);
      continue;
    }

    if (!existing?.id) results.push(`Created tag “${tag.name}”.`);

    const ok = await addContactTagAssignment({ ownerId, contactId: contact.id, tagId: tag.id });
    if (ok) {
      anyOk = true;
      results.push(`Added tag “${tag.name}” to ${contact.name}.`);
    } else {
      results.push(`I couldn’t add tag “${tag.name}” to ${contact.name}.`);
    }
  }

  if (!results.length) return null;
  const msg = await createAssistantMessage(results.join("\n"));
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
    const assistantMsg = await (prisma as any).portalAiChatMessage.create({
      data: {
        ownerId,
        threadId,
        role: "assistant",
        text: String(msgText || "").slice(0, 12000),
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
      const assistantMsg = await createAssistantMessage(`I couldn’t list tasks: ${String((exec as any)?.json?.error || "Unknown error")}`);
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    if (!tasks.length) {
      const assistantMsg = await createAssistantMessage("No tasks found.");
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

    const assistantMsg = await createAssistantMessage(["Here are your tasks:", ...lines].join("\n"));
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
      const assistantMsg = await createAssistantMessage(`I couldn’t create that task: ${String((exec as any)?.json?.error || "Unknown error")}`);
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    const taskId = typeof (exec as any)?.json?.taskId === "string" ? String((exec as any).json.taskId).slice(0, 32) : "";
    const assistantMsg = await createAssistantMessage(`Created task “${createCmd.title}”.${taskId ? ` (task id: ${taskId})` : ""}`);
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
        const assistantMsg = await createAssistantMessage(`I couldn’t update that task: ${String((exec as any)?.json?.error || "Unknown error")}`);
        return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
      }

      const assistantMsg = await createAssistantMessage(`Updated task (task id: ${explicitTaskId}) to ${status}.`);
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
      const assistantMsg = await createAssistantMessage(
        `I couldn’t find an open task matching “${titleCmd.titleHint}”. If you paste the task id (e.g. “task id: …”) I can update it.`,
      );
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    if (matches.length > 1) {
      const preview = matches
        .slice(0, 5)
        .map((m) => `- ${m.title} (task id: ${m.id.slice(0, 32)})`)
        .join("\n");
      const assistantMsg = await createAssistantMessage(
        `I found multiple matching tasks. Reply with the exact task id to update:\n${preview}`,
      );
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
      const assistantMsg = await createAssistantMessage(`I couldn’t update that task: ${String((exec2 as any)?.json?.error || "Unknown error")}`);
      return { ok: false, assistantMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
    }

    const assistantMsg = await createAssistantMessage(`Updated “${chosen.title}” to ${desiredStatus}.`);
    return { ok: true, assistantMessage: assistantMsg, autoActionMessage: assistantMsg, canvasUrl: "/portal/app/services/tasks" };
  }

  return null;
}

function detectDeterministicActionsFromText(opts: {
  text: string;
  attachments: Array<{ id?: string | null; fileName?: string; url?: string }>;
}): Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown> }> {
  const t = String(opts.text || "").trim();
  const lower = t.toLowerCase();
  const attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
  if (!t && !attachments.length) return [];

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
    const quotedName = /\bcontact\b\s+"([^"\n]{2,80})"/i.exec(t) || /\bcontact\b\s+'([^'\n]{2,80})'/i.exec(t);
    if (quotedName?.[1]) {
      name = String(quotedName[1]).trim().slice(0, 80);
    } else {
      const after = /\bcontact\b\s*(?:named|called)?\s*([^\n]{2,120})/i.exec(t);
      if (after?.[1]) {
        const candidate = String(after[1])
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

export async function GET(_req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
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
  const lastCanvasUrl = typeof ctxJson.lastCanvasUrl === "string" && ctxJson.lastCanvasUrl.trim() ? String(ctxJson.lastCanvasUrl).trim().slice(0, 1200) : null;
  const lastWorkTitle = typeof ctxJson.lastWorkTitle === "string" && ctxJson.lastWorkTitle.trim() ? String(ctxJson.lastWorkTitle).trim().slice(0, 200) : null;

  return NextResponse.json({ ok: true, messages, threadContext: { lastCanvasUrl, lastWorkTitle } });
}

async function handlePostMessage(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
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

  const redoLastAssistant = Boolean((parsed.data as any).redoLastAssistant);
  if (redoLastAssistant) {
    const recent = await (prisma as any).portalAiChatMessage.findMany({
      where: { ownerId, threadId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, role: true, text: true, createdAt: true },
    });

    const ordered = Array.isArray(recent) ? [...recent].reverse() : [];
    let lastAssistantIdx = -1;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (String(ordered[i]?.role) === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }

    if (lastAssistantIdx < 0) {
      return NextResponse.json({ ok: false, error: "No assistant message to redo." }, { status: 400 });
    }

    const lastAssistant = ordered[lastAssistantIdx];
    let lastUser: any = null;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (String(ordered[i]?.role) === "user") {
        lastUser = ordered[i];
        break;
      }
    }

    if (!lastUser || !String(lastUser.text || "").trim()) {
      return NextResponse.json({ ok: false, error: "No user message found to redo." }, { status: 400 });
    }

    await (prisma as any).portalAiChatMessage.deleteMany({ where: { id: lastAssistant.id, ownerId, threadId } });

    const threadContext = (thread as any).contextJson ?? null;

    const recentMessages = ordered
      .slice(0, lastAssistantIdx)
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && String(m?.text || "").trim())
      .slice(-40)
      .map((m) => ({ role: m.role, text: String(m.text || "").trim().slice(0, 4000) }));

    const prompt = [
      "Regenerate the assistant's last response to the user message below.",
      "Constraints:",
      "- Do not mention that you are regenerating or redoing.",
      "- Do not execute any portal actions; this is text-only regeneration.",
      "- Keep the answer helpful and concise.",
      "",
      "User message:",
      String(lastUser.text || "").trim().slice(0, 4000),
      "",
      "Previous assistant response (for reference):",
      String(lastAssistant.text || "").trim().slice(0, 4000),
      "",
      "New assistant response:",
    ].join("\n");

    const contextUrl = typeof parsed.data.url === "string" ? String(parsed.data.url).trim().slice(0, 1200) : "";
    const reply = await runPortalSupportChat({
      message: prompt,
      url: contextUrl || undefined,
      recentMessages,
      threadContext,
    });

    const assistantMsg = await (prisma as any).portalAiChatMessage.create({
      data: {
        ownerId,
        threadId,
        role: "assistant",
        text: reply,
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
    return NextResponse.json({ ok: true, userMessage: null, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null });
  }

  const confirmToken = typeof (parsed.data as any).confirmToken === "string" ? String((parsed.data as any).confirmToken).trim().slice(0, 200) : "";
  const choice = (parsed.data as any).choice ?? null;
  const cleanText = (parsed.data.text || "").trim();
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
  const imageUrls = imageUrlsFromAttachments(attachments as any[], req.url);
  const isConfirmOnly = Boolean(confirmToken) && !cleanText && !choice && !attachments.length;

  if (isConfirmOnly) {
    const threadContext = (thread as any).contextJson ?? null;
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

    const results: Array<{ ok: boolean; markdown?: string; linkUrl?: string | null; clientUiAction?: any | null }> = [];
    const clientUiActions: any[] = [];
    for (const step of confirmedSteps) {
      const exec = await executePortalAgentAction({
        ownerId,
        actorUserId: createdByUserId,
        action: step.key,
        args: step.args,
      });
      const cua = (exec as any).clientUiAction ?? null;
      results.push({ ok: Boolean(exec.ok), markdown: exec.markdown, linkUrl: exec.linkUrl ?? null, clientUiAction: cua });
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

    const assistantText = (() => {
      if (confirmedSteps.length === 1) {
        return String(results[0]?.markdown || "Done.").trim() || "Done.";
      }
      const blocks = confirmedSteps.map((s, idx) => {
        const md = String(results[idx]?.markdown || (results[idx]?.ok ? "Done." : "Action failed.")).trim();
        return `#### ${s.title}\n${md}`;
      });
      return `Done.\n\n${blocks.join("\n\n")}`;
    })();

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

    const prevCtx = threadContext;
    const prevRuns =
      prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx) && Array.isArray((prevCtx as any).runs)
        ? ((prevCtx as any).runs as unknown[])
        : [];
    const runTrace = {
      at: now.toISOString(),
      workTitle: pendingConfirm.workTitle ?? null,
      steps: confirmedSteps.map((s, idx) => ({
        key: s.key,
        title: s.title,
        ok: Boolean(results[idx]?.ok),
        linkUrl: results[idx]?.linkUrl ?? null,
      })),
      canvasUrl,
    };
    const runs = [...prevRuns.slice(-19), runTrace];

    const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
      ? { ...(prevCtx as any), pendingConfirm: null, pendingPlan: null, lastWorkTitle: pendingConfirm.workTitle ?? null, lastCanvasUrl: canvasUrl, runs }
      : { pendingConfirm: null, pendingPlan: null, lastWorkTitle: pendingConfirm.workTitle ?? null, lastCanvasUrl: canvasUrl, runs };

    await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });

    const openScheduledTasks = confirmedSteps.some((s) => String(s.key || "").startsWith("ai_chat.scheduled."));
    return NextResponse.json({ ok: true, userMessage: null, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl, clientUiActions, openScheduledTasks });
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

  const userMsg = isConfirmOnly
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
    await (prisma as any).portalAiChatThread.update({
      where: { id: threadId },
      data: { lastMessageAt: now },
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

  // 0) Deterministic workflows that can resolve IDs for the user.
  // (Example: add/remove a contact tag by name + email/phone/contact name.)
  const modelRows = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "asc" },
    take: 400,
    select: { id: true, role: true, text: true },
  });

  const modelMessages: Array<{ role: "user" | "assistant"; text: string }> = modelRows
    .filter((m: any) => (userMsg ? m.id !== (userMsg as any).id : true))
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: String(m.text || "").slice(0, 2000),
    }))
    .filter((m: { role: "user" | "assistant"; text: string }) => Boolean(String(m.text || "").trim()));

  // Keep a compatibility alias for the legacy fallback flow later in this route.
  const recentMessages = modelMessages.slice(-120);

  // Use a URL that actually represents what the user is working on.
  // The chat page URL is often not enough context to resolve funnel/page entities.
  const canvasUrlRaw = String(parsed.data.canvasUrl || "").trim();
  const contextUrl = String(canvasUrlRaw || parsed.data.url || "").trim() || undefined;

  const tagWorkflow = await tryExecuteContactTagCommand({
    ownerId,
    threadId,
    now,
    text: effectiveText,
    recentMessages: modelMessages,
  });
  if (tagWorkflow?.assistantMessage) {
    return NextResponse.json({
      ok: true,
      userMessage: userMsg,
      assistantMessage: tagWorkflow.assistantMessage,
      assistantActions: [],
      autoActionMessage: null,
      canvasUrl: tagWorkflow.canvasUrl || null,
      ambiguousContacts: (tagWorkflow as any).ambiguousContacts || null,
    });
  }

  const taskWorkflow = await tryExecuteTaskCommand({
    ownerId,
    threadId,
    now,
    text: effectiveText,
    actorUserId: createdByUserId,
  });
  if (taskWorkflow?.assistantMessage) {
    return NextResponse.json({
      ok: true,
      userMessage: userMsg,
      assistantMessage: taskWorkflow.assistantMessage,
      assistantActions: [],
      autoActionMessage: taskWorkflow.autoActionMessage || null,
      canvasUrl: taskWorkflow.canvasUrl || null,
    });
  }

  // 0.5) Agentic planning + deterministic resolution (multi-step, no IDs required).
  // This runs before the legacy action-proposal flow, and it executes immediately for imperative requests.
  let fallbackThreadContext = (thread as any).contextJson ?? null;
  if (isPortalSupportChatConfigured()) {
    try {
      let threadContext = fallbackThreadContext;

      // Persist the latest canvas URL so entity resolution can infer the current funnel/page.
      // Only do this when the client actually provided a canvas URL (not just the chat page URL).
      if (canvasUrlRaw) {
        const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
        const prevCanvasUrl = typeof prevCtx.lastCanvasUrl === "string" ? String(prevCtx.lastCanvasUrl).trim() : "";
        if (!prevCanvasUrl || prevCanvasUrl !== canvasUrlRaw) {
          const nextCtx = { ...prevCtx, lastCanvasUrl: canvasUrlRaw };
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

      const pendingPlan =
        threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
          ? (threadContext as any).pendingPlan
          : null;

      const pendingPlanClarify =
        threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
          ? (threadContext as any).pendingPlanClarify
          : null;

      // Any new user message clears stale confirmations.
      if (pendingConfirm && !isConfirmOnly) {
        const prevCtx = threadContext;
        const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
          ? { ...(prevCtx as any), pendingConfirm: null }
          : { pendingConfirm: null };
        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
        threadContext = nextCtx;
      }

      // Pending plans are only safe to "replay" when the user clicked a structured choice (no new text).
      // If the user typed a reply, we usually re-plan so the model can adjust the steps.
      // BUT: if we previously asked a clarifying question for a pending execute plan, treat the typed reply as an
      // answer and continue the pending plan; this prevents the agent from switching into "instructions" mode.
      const pendingPlanMode = pendingPlan && typeof pendingPlan === "object" ? String((pendingPlan as any).mode || "") : "";
      const hasNewUserText = Boolean(String(effectiveText || "").trim());
      const didClickChoice = Boolean(choice && typeof choice === "object");

      const pendingClarifyOriginalUserText =
        pendingPlanClarify && typeof pendingPlanClarify === "object" && typeof (pendingPlanClarify as any).originalUserText === "string"
          ? String((pendingPlanClarify as any).originalUserText || "").trim()
          : "";

      const shouldContinuePendingClarifyPlan =
        Boolean(pendingPlan) &&
        pendingPlanMode === "clarify" &&
        !isConfirmOnly &&
        Boolean(pendingClarifyOriginalUserText) &&
        (didClickChoice || hasNewUserText);

      const effectivePlanningText = shouldContinuePendingClarifyPlan
        ? [
            pendingClarifyOriginalUserText,
            "\n\nUser answer:",
            String(effectiveText || "").trim() || "(no text)",
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 4000)
        : effectiveText;
      const shouldReplayPendingExecutePlan =
        Boolean(pendingPlan) &&
        pendingPlanMode === "execute" &&
        !isConfirmOnly &&
        (didClickChoice || (hasNewUserText && Boolean(pendingPlanClarify)));

      // Clear stale clarify-mode pendingPlan so follow-up replies can progress.
      if (pendingPlan && pendingPlanMode === "clarify" && !isConfirmOnly && !shouldContinuePendingClarifyPlan) {
        const prevCtx = threadContext;
        const nextCtx =
          prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
            ? { ...(prevCtx as any), pendingPlan: null, pendingPlanClarify: null }
            : { pendingPlan: null, pendingPlanClarify: null };
        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
        threadContext = nextCtx;
      }

      const attachmentTextContext = attachments.length
        ? await extractTextContextFromAttachments({ ownerId, attachments, maxTotalChars: 8000 }).catch(() => "")
        : "";

      const planningTextWithAttachments = attachmentTextContext
        ? [effectivePlanningText, attachmentTextContext].filter(Boolean).join("\n").slice(0, 12_000)
        : effectivePlanningText;

      const deterministicWeekdaySmsPlan = buildDeterministicWeekdaySmsPlan({
        text: effectivePlanningText,
        ownerTimeZone: String(getTimeZoneHint(threadContext) || "").trim() || undefined,
      });

      let plan: any = null;
      if (shouldReplayPendingExecutePlan) {
        plan = pendingPlan as any;
      } else if (deterministicWeekdaySmsPlan) {
        // Hard rule: recurring weekday SMS schedules are NOT Booking Reminders.
        // Force the deterministic execute plan so the assistant schedules + sends immediately (when requested).
        plan = deterministicWeekdaySmsPlan;
      } else {
        try {
          plan = await planPuraActions({
            text: planningTextWithAttachments,
            url: contextUrl,
            recentMessages: modelMessages,
            threadContext,
            imageUrls,
          });
        } catch {
          plan = null;
        }
      }

      if (plan?.mode === "clarify" && plan.clarifyingQuestion) {
        const assistantMsg = await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: plan.clarifyingQuestion,
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

        const prevCtx = threadContext;
        const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
          ? {
              ...(prevCtx as any),
              pendingPlan: plan,
              pendingPlanClarify: {
                at: now.toISOString(),
                question: String(plan.clarifyingQuestion || "").trim().slice(0, 800),
                originalUserText: String(effectivePlanningText || "").trim().slice(0, 4000),
              },
            }
          : {
              pendingPlan: plan,
              pendingPlanClarify: {
                at: now.toISOString(),
                question: String(plan.clarifyingQuestion || "").trim().slice(0, 800),
                originalUserText: String(effectivePlanningText || "").trim().slice(0, 4000),
              },
            };

        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
        await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: plan.clarifyingQuestion });
        return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null });
      }

      if (plan?.mode === "explain" && plan.explanation) {
        const assistantMsg = await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: plan.explanation,
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
        await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: plan.explanation });
        return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null });
      }

      if (plan?.mode === "execute" && Array.isArray(plan.steps) && plan.steps.length) {
        const confirmSpec = plan.steps.map((s: any) => getConfirmSpecForPortalAgentAction(s.key)).find(Boolean) || null;
        if (confirmSpec) {
          const resolvedSteps: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }> = [];

          for (const step of plan.steps.slice(0, 6)) {
            const argsRaw = step.args && typeof step.args === "object" && !Array.isArray(step.args) ? (step.args as Record<string, unknown>) : {};
            const resolved = await resolvePlanArgs({
              ownerId,
              stepKey: step.key,
              args: argsRaw,
              userHint: effectiveText,
              url: contextUrl,
              threadContext,
            });
            if (!resolved.ok) {
              const clarifyChoices = Array.isArray((resolved as any).choices) ? ((resolved as any).choices as any[]) : null;

              let clarifyText = String(resolved.clarifyQuestion || "").trim() || "I need one more detail to continue.";
              try {
                const system = [
                  "You are Pura, an AI assistant inside a business portal.",
                  "You are asking ONE clarifying question so you can run a tool/action.",
                  "Write a single short question.",
                  "Rules:",
                  "- Do not ask for internal IDs unless the user must paste one.",
                  "- If clickable choices are available, mention they can click one.",
                  "- If the user said to create something new, allow that option.",
                  "- No JSON.",
                ].join("\n");

                const user = [
                  "Latest user message:",
                  String(effectiveText || ""),
                  "\nMissing detail prompt (raw):",
                  clarifyText,
                  "\nChoices available:",
                  JSON.stringify((clarifyChoices || []).slice(0, 8)).slice(0, 1500),
                  "\nQuestion:",
                ].join("\n");

                const aiQ = String(await generateText({ system, user })).trim();
                if (aiQ) clarifyText = aiQ.slice(0, 600);
              } catch {
                // ignore and keep deterministic fallback
              }

              const assistantMsg = await (prisma as any).portalAiChatMessage.create({
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
              });

              const prevCtx = threadContext;
              const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
                ? { ...(prevCtx as any), pendingPlan: plan, pendingPlanClarify: { at: now.toISOString(), stepKey: step.key, question: clarifyText } }
                : { pendingPlan: plan, pendingPlanClarify: { at: now.toISOString(), stepKey: step.key, question: clarifyText } };
              await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
              return NextResponse.json({
                ok: true,
                userMessage: userMsg,
                assistantMessage: assistantMsg,
                assistantActions: [],
                autoActionMessage: null,
                canvasUrl: null,
                assistantChoices: clarifyChoices,
              });
            }

            const resolvedArgs = resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args)
              ? (resolved.args as Record<string, unknown>)
              : {};

            // Planner does not know the current threadId; inject it for schedule creation.
            const resolvedArgsWithThread = (() => {
              const withThread =
                step.key === "ai_chat.scheduled.create" && !String((resolvedArgs as any).threadId || "").trim()
                  ? ({ ...resolvedArgs, threadId } as Record<string, unknown>)
                  : resolvedArgs;
              return step.key === "ai_chat.scheduled.create" ? patchArgsForScheduledCreate(withThread, threadContext) : withThread;
            })();

            resolvedSteps.push({
              key: step.key,
              title: step.title,
              args: resolvedArgsWithThread,
              ...(step.openUrl ? { openUrl: step.openUrl } : {}),
            });
          }

          const token = crypto.randomUUID();
          const prevCtx = threadContext;
          const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
            ? { ...(prevCtx as any), pendingConfirm: { token, createdAt: now.toISOString(), workTitle: plan.workTitle ?? null, steps: resolvedSteps, confirm: confirmSpec } }
            : { pendingConfirm: { token, createdAt: now.toISOString(), workTitle: plan.workTitle ?? null, steps: resolvedSteps, confirm: confirmSpec } };
          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });

          const confirmText = [
            (typeof (confirmSpec as any)?.message === "string" && String((confirmSpec as any).message).trim())
              ? String((confirmSpec as any).message).trim()
              : "Ready to continue.",
            "Click Confirm to proceed (or Cancel to stop).",
          ]
            .filter(Boolean)
            .join("\n");

          const assistantMsg = await (prisma as any).portalAiChatMessage.create({
            data: {
              ownerId,
              threadId,
              role: "assistant",
              text: confirmText,
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

          await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: confirmText });
          return NextResponse.json({
            ok: true,
            userMessage: userMsg,
            assistantMessage: assistantMsg,
            assistantActions: [],
            autoActionMessage: null,
            canvasUrl: null,
            needsConfirm: { ...confirmSpec, token },
          });
        }

        const resolvedSteps: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }> = [];
        const contextPatches: Array<Record<string, unknown> | undefined> = [];
        const results: Array<{ ok: boolean; markdown?: string; linkUrl?: string | null; clientUiAction?: any | null }> = [];
        const clientUiActions: any[] = [];

        let localCtx: any = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? { ...(threadContext as any) } : {};
        let clarifyChoices: any[] | null = null;

        for (const step of plan.steps.slice(0, 6)) {
          const argsRaw = step.args && typeof step.args === "object" && !Array.isArray(step.args) ? (step.args as Record<string, unknown>) : {};

          const resolved = await resolvePlanArgs({
            ownerId,
            stepKey: step.key,
            args: argsRaw,
            userHint: effectiveText,
            url: contextUrl,
            threadContext: localCtx,
          });

          if (!resolved.ok) {
            clarifyChoices = Array.isArray((resolved as any).choices) ? ((resolved as any).choices as any[]) : null;

            let clarifyText = String(resolved.clarifyQuestion || "").trim() || "I need one more detail to continue.";
            try {
              const system = [
                "You are Pura, an AI assistant inside a business portal.",
                "You are asking ONE clarifying question so you can run a tool/action.",
                "Write a single short question.",
                "Rules:",
                "- Do not ask for internal IDs unless the user must paste one.",
                "- If clickable choices are available, mention they can click one.",
                "- If the user said to create something new, allow that option.",
                "- No JSON.",
              ].join("\n");

              const user = [
                "Latest user message:",
                String(effectiveText || ""),
                "\nMissing detail prompt (raw):",
                clarifyText,
                "\nChoices available:",
                JSON.stringify((clarifyChoices || []).slice(0, 8)).slice(0, 1500),
                "\nQuestion:",
              ].join("\n");

              const aiQ = String(await generateText({ system, user })).trim();
              if (aiQ) clarifyText = aiQ.slice(0, 600);
            } catch {
              // ignore and keep deterministic fallback
            }

            const assistantMsg = await (prisma as any).portalAiChatMessage.create({
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
            });

            const nextCtx = { ...localCtx, pendingPlan: plan, pendingPlanClarify: { at: now.toISOString(), stepKey: step.key, question: clarifyText } };
            await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
            await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: clarifyText });
            await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: clarifyText });
            return NextResponse.json({
              ok: true,
              userMessage: userMsg,
              assistantMessage: assistantMsg,
              assistantActions: [],
              autoActionMessage: null,
              canvasUrl: null,
              assistantChoices: clarifyChoices,
            });
          }

          const resolvedArgs = resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args)
            ? (resolved.args as Record<string, unknown>)
            : {};

          // Planner does not know the current threadId; inject it for schedule creation.
          const resolvedArgsWithThread = (() => {
            const withThread =
              step.key === "ai_chat.scheduled.create" && !String((resolvedArgs as any).threadId || "").trim()
                ? ({ ...resolvedArgs, threadId } as Record<string, unknown>)
                : resolvedArgs;
            return step.key === "ai_chat.scheduled.create" ? patchArgsForScheduledCreate(withThread, localCtx) : withThread;
          })();

          resolvedSteps.push({
            key: step.key,
            title: step.title,
            args: resolvedArgsWithThread,
            ...(step.openUrl ? { openUrl: step.openUrl } : {}),
          });
          contextPatches.push(resolved.contextPatch);

          if (resolved.contextPatch && typeof resolved.contextPatch === "object" && !Array.isArray(resolved.contextPatch)) {
            localCtx = { ...localCtx, ...(resolved.contextPatch as any) };
          }

          const exec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: step.key,
            args: resolvedArgsWithThread,
          });
          const cua = (exec as any).clientUiAction ?? null;
          results.push({ ok: Boolean(exec.ok), markdown: exec.markdown, linkUrl: exec.linkUrl ?? null, clientUiAction: cua });
          if (cua) clientUiActions.push(cua);

          const derivedPatch = deriveThreadContextPatchFromAction(step.key, resolvedArgsWithThread, (exec as any).result);
          if (derivedPatch && typeof derivedPatch === "object") {
            contextPatches.push(derivedPatch);
            localCtx = { ...localCtx, ...(derivedPatch as any) };
          }
        }

        const mappedCanvasUrl =
          (resolvedSteps
            .map((s) => portalCanvasUrlForAction(s.key, s.args))
            .filter(Boolean)
            .slice(-1)[0] as string | undefined) ||
          null;

        const canvasUrl =
          (results.filter((r) => r.ok).map((r) => r.linkUrl).filter(Boolean).slice(-1)[0] as string | undefined) ||
          resolvedSteps.map((s) => s.openUrl).filter(Boolean).slice(-1)[0] ||
          mappedCanvasUrl ||
          null;

        const assistantText = (() => {
          if (resolvedSteps.length === 1) {
            return String(results[0]?.markdown || "Done.").trim() || "Done.";
          }
          const allOk = results.every((r) => r.ok);
          const anyOk = results.some((r) => r.ok);
          const blocks = resolvedSteps.map((s, idx) => {
            const md = String(results[idx]?.markdown || (results[idx]?.ok ? "Done." : "Action failed.")).trim();
            return `#### ${s.title}\n${md}`;
          });
          const summary = allOk ? "Done." : anyOk ? "Some actions failed." : "Action failed.";
          return `${summary}\n\n${blocks.join("\n\n")}`;
        })();

        // AI-first: let the model decide what to say after tools run.
        // This keeps the chat feeling like ChatGPT while still using portal actions as tools.
        let assistantTextFinal = assistantText;
        try {
          const system = [
            "You are Pura, an AI assistant inside a business portal.",
            "You just ran portal tools/actions for the user.",
            "Write the assistant reply the user should see.",
            "Rules:",
            "- Be conversational and concise.",
            "- If something failed, say it plainly and ask ONE targeted question if needed.",
            "- If something succeeded, confirm what changed and what to do next.",
            "- Do not mention internal code, schemas, or JSON.",
            "- If there are multiple steps, summarize in 2-6 short lines.",
          ].join("\n");

          const user = [
            "Latest user message:",
            String(effectiveText || "").slice(0, 1200),
            "\nExecuted steps:",
            JSON.stringify(
              resolvedSteps.map((s, idx) => ({
                title: s.title,
                key: s.key,
                ok: Boolean(results[idx]?.ok),
                markdown: results[idx]?.markdown || null,
                linkUrl: results[idx]?.linkUrl || null,
              })),
            ).slice(0, 6000),
            "\nDraft summary (fallback):",
            assistantText,
            "\nReply:",
          ].join("\n");

          const aiReply = String(await generateText({ system, user })).trim();
          if (aiReply) assistantTextFinal = aiReply.slice(0, 4000);
        } catch {
          // ignore and keep deterministic fallback
        }

        const assistantMsg = await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: assistantTextFinal,
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

        const prevCtx = localCtx;
        const mergedPatch = Object.assign({}, ...contextPatches.filter(Boolean));

        const runTrace = {
          at: now.toISOString(),
          workTitle: plan.workTitle ?? null,
          steps: resolvedSteps.map((s, idx) => ({
            key: s.key,
            title: s.title,
            ok: Boolean(results[idx]?.ok),
            linkUrl: results[idx]?.linkUrl ?? null,
          })),
          canvasUrl,
        };

        const prevRuns =
          prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx) && Array.isArray((prevCtx as any).runs)
            ? ((prevCtx as any).runs as unknown[])
            : [];
        const runs = [...prevRuns.slice(-19), runTrace];

        const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
          ? { ...(prevCtx as any), ...mergedPatch, lastWorkTitle: plan.workTitle ?? null, lastCanvasUrl: canvasUrl, pendingPlan: null, pendingPlanClarify: null, runs }
          : { ...mergedPatch, lastWorkTitle: plan.workTitle ?? null, lastCanvasUrl: canvasUrl, pendingPlan: null, pendingPlanClarify: null, runs };

        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });

        await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: assistantTextFinal });

        const openScheduledTasks = resolvedSteps.some((s) => String((s as any)?.key || "").startsWith("ai_chat.scheduled."));
        return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl, assistantChoices: null, clientUiActions, openScheduledTasks });
      }
    } catch {
      // If planning fails, fall through to existing behavior.
    }

    // AI-first: if we didn't execute/clarify/explain above, fall back to a normal conversation.
    // BUT: if the user is issuing an imperative request, do not return a text-only reply here.
    // Instead, fall through to the deterministic/proposal flow below so we can execute actions.
    const wantsExecutionFallback =
      looksLikeWeekdaySmsSchedule(effectiveText) ||
      shouldAutoExecuteFromUserText(effectiveText) ||
      (/\b(list|show|view|see|what\s+(?:is|are|'s)|any)\b/i.test(effectiveText) &&
        /\b(scheduled|schedule)\b/i.test(effectiveText) &&
        /\b(tasks?|messages?|runs?|items?)\b/i.test(effectiveText)) ||
      /\b(do it|do that|handle it|take care of it|go ahead|just do|for me|please do)\b/i.test(effectiveText);
    if (!wantsExecutionFallback) {
      const reply = await runPortalSupportChat({
        message: promptMessage,
        url: contextUrl,
        recentMessages: modelMessages,
        threadContext: fallbackThreadContext,
      });

      const assistantMsg = await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "assistant",
          text: reply,
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
      return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null });
    }
  }

  // Fallback: execute the deterministic weekday SMS scheduler even when the support chat
  // (and thus agentic planning) is not configured. This prevents “Done.” with no rows created.
  const weekdaySmsFallbackPlan = buildDeterministicWeekdaySmsPlan({
    text: effectiveText,
    ownerTimeZone: String(getTimeZoneHint((thread as any).contextJson) || "").trim() || undefined,
  });
  if (weekdaySmsFallbackPlan?.mode === "execute" && Array.isArray(weekdaySmsFallbackPlan.steps) && weekdaySmsFallbackPlan.steps.length) {
    const results: Array<{ ok: boolean; markdown?: string; linkUrl?: string | null; clientUiAction?: any | null }> = [];
    const clientUiActions: any[] = [];

    for (const step of weekdaySmsFallbackPlan.steps.slice(0, 6)) {
      const argsRaw = step.args && typeof step.args === "object" && !Array.isArray(step.args) ? (step.args as Record<string, unknown>) : {};
      let argsPatched: Record<string, unknown> = { ...argsRaw };
      if (String(step.key || "").startsWith("ai_chat.") && !String((argsPatched as any).threadId || "").trim()) {
        (argsPatched as any).threadId = threadId;
      }
      if (step.key === "ai_chat.scheduled.create") {
        argsPatched = patchArgsForScheduledCreate(argsPatched, (thread as any).contextJson);
      }

      const exec = await executePortalAgentAction({
        ownerId,
        actorUserId: createdByUserId,
        action: step.key,
        args: argsPatched,
      });

      const cua = (exec as any).clientUiAction ?? null;
      results.push({ ok: Boolean(exec.ok), markdown: exec.markdown, linkUrl: exec.linkUrl ?? null, clientUiAction: cua });
      if (cua) clientUiActions.push(cua);
    }

    const assistantText = (() => {
      if (weekdaySmsFallbackPlan.steps.length === 1) {
        return String(results[0]?.markdown || "Done.").trim() || "Done.";
      }
      const allOk = results.every((r) => r.ok);
      const anyOk = results.some((r) => r.ok);
      const blocks = weekdaySmsFallbackPlan.steps.slice(0, 6).map((s: any, idx: number) => {
        const md = String(results[idx]?.markdown || (results[idx]?.ok ? "Done." : "Action failed.")).trim();
        return `#### ${String(s.title || s.key || "Step")}\n${md}`;
      });
      const summary = allOk ? "Scheduled." : anyOk ? "Some schedules failed." : "Scheduling failed.";
      return `${summary}\n\n${blocks.join("\n\n")}`;
    })();

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

    await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now } });

    return NextResponse.json({
      ok: true,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      assistantActions: [],
      autoActionMessage: null,
      canvasUrl: null,
      assistantChoices: null,
      clientUiActions,
      openScheduledTasks: true,
    });
  }

  // 1) Prefer deterministic action execution for common commands.
  const deterministicActions = detectDeterministicActionsFromText({ text: cleanText, attachments });
  if (deterministicActions.length) {
    const first = deterministicActions[0];

    // If a deterministic action needs confirmation, do not auto-execute it.
    // Instead, return it as an assistantAction so the user can confirm in the UI.
    const confirmSpec = getConfirmSpecForPortalAgentAction(first.key);
    if (confirmSpec) {
      const assistantMsg = await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "assistant",
          text: String(confirmSpec.message || "Confirm to continue.").slice(0, 12000),
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

      const argsPatched: Record<string, unknown> = { ...(first.args || {}) };
      if (String(first.key || "").startsWith("ai_chat.") && !String((argsPatched as any).threadId || "").trim()) {
        argsPatched.threadId = threadId;
      }

      const argsFinal = first.key === "ai_chat.scheduled.create" ? patchArgsForScheduledCreate(argsPatched, (thread as any).contextJson) : argsPatched;

      return NextResponse.json({
        ok: true,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        assistantActions: [{ key: first.key, title: first.title, args: argsFinal }],
        autoActionMessage: null,
        canvasUrl: null,
        assistantChoices: null,
        clientUiActions: [],
      });
    }

    let argsPatched: Record<string, unknown> = { ...(first.args || {}) };
    if (String(first.key || "").startsWith("ai_chat.") && !String((argsPatched as any).threadId || "").trim()) {
      argsPatched.threadId = threadId;
    }
    if (first.key === "ai_chat.scheduled.create") {
      argsPatched = patchArgsForScheduledCreate(argsPatched, (thread as any).contextJson);
    }

    const exec = await executePortalAgentActionForThread({
      ownerId,
      actorUserId: createdByUserId,
      threadId,
      action: first.key,
      args: argsPatched,
    });

    return NextResponse.json({
      ok: true,
      userMessage: userMsg,
      assistantMessage: exec.assistantMessage,
      assistantActions: [],
      autoActionMessage: null,
      canvasUrl: exec.ok ? exec.linkUrl || null : null,
      assistantChoices: Array.isArray((exec as any).assistantChoices) ? (exec as any).assistantChoices : null,
      clientUiActions: (exec as any).clientUiAction ? [(exec as any).clientUiAction] : [],
      openScheduledTasks: String(first.key || "").startsWith("ai_chat.scheduled."),
    });
  }

  // 2) Best-effort: propose actions the agent can execute.
  let assistantActions: Array<{ key: string; title: string; confirmLabel?: string; args: Record<string, unknown> }> = [];
  try {
    const system = [
      "You are an automation agent inside a business portal.",
      "Your job is to propose up to 2 concrete next actions that can be executed via whitelisted portal actions.",
      "Assume the system CAN execute whitelisted actions. Never refuse with statements like 'I can't do that'.",
      "Only propose actions when you have enough information from the conversation to fill required fields.",
      "Never invent IDs (automationId, userId, etc). If missing, propose no actions.",
      "Never propose ai_chat.* actions (those are internal plumbing; the user should never see them).",
      "If an action needs a slug (like funnel.create), derive it deterministically from the provided name.",
      "Output JSON only, in this exact shape: {\"actions\":[{\"key\":...,\"title\":...,\"confirmLabel\":...,\"args\":{...}}]}",
      "Do not include markdown fences unless needed.",
      "\n" + portalAgentActionsIndexText({ includeAiChat: false }),
    ].join("\n");

    const user = [
      "User message:",
      promptMessage,
      "\nCurrent page URL (if any):",
      parsed.data.url || "",
      "\nJSON:",
    ].join("\n");

    const raw = await generateText({ system, user });
    const obj = extractJsonObject(raw);
    const parsedActions = ActionProposalSchema.safeParse(obj);
    if (parsedActions.success) {
      assistantActions = parsedActions.data.actions.map((a) => ({
        key: a.key,
        title: a.title,
        confirmLabel: a.confirmLabel,
        args: a.args ?? {},
      }));
    }
  } catch {
    // ignore
  }

  // Defense-in-depth: never show internal chat plumbing actions.
  assistantActions = assistantActions.filter((a) => !String(a.key || "").startsWith("ai_chat."));

  // If the user is trying to apply/remove a tag, avoid suggesting "list tags" as a dead-end.
  // (But keep it available for actual "list tags" requests.)
  if (/(\badd\s+tag\b|\bapply\s+tag\b|\bremove\s+tag\b|\bdelete\s+tag\b|\buntag\b|\btag\s+[\s\S]{0,120}\b(as|with)\b)/i.test(cleanText || "")) {
    assistantActions = assistantActions.filter((a) => a.key !== "contact_tags.list");
  }

  // 3) Auto-execute when the user is clearly asking to do something.
  let autoActionMessage: any = null;
  if (shouldAutoExecuteFromUserText(effectiveText) && assistantActions.length) {
    const first = assistantActions[0];

    // Never auto-execute actions that require confirmation.
    const confirmSpec = getConfirmSpecForPortalAgentAction(first.key as PortalAgentActionKey);
    if (confirmSpec) {
      const assistantMsg = await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "assistant",
          text: String(confirmSpec.message || "Confirm to continue.").slice(0, 12000),
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
      return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions, autoActionMessage: null, canvasUrl: null });
    }

    try {
      const exec = await executePortalAgentActionForThread({
        ownerId,
        actorUserId: createdByUserId,
        threadId,
        action: first.key as PortalAgentActionKey,
        args: first.args || {},
      });
      if (exec.assistantMessage) {
        autoActionMessage = exec.assistantMessage;
        assistantActions = [];
      }
      if (Array.isArray((exec as any).assistantChoices) && (exec as any).assistantChoices.length) {
        return NextResponse.json({
          ok: true,
          userMessage: userMsg,
          assistantMessage: exec.assistantMessage,
          assistantActions: [],
          autoActionMessage: null,
          canvasUrl: null,
          assistantChoices: (exec as any).assistantChoices,
          clientUiActions: (exec as any).clientUiAction ? [(exec as any).clientUiAction] : [],
          openScheduledTasks: String(first.key || "").startsWith("ai_chat.scheduled."),
        });
      }
    } catch {
      // ignore
    }
  }

  // 4) If we auto-executed, return the action result as the assistant message.
  if (autoActionMessage) {
    return NextResponse.json({
      ok: true,
      userMessage: userMsg,
      assistantMessage: autoActionMessage,
      assistantActions,
      autoActionMessage: null,
      canvasUrl: null,
    });
  }

  // 5) Fall back to support-style chat when no action was executed.
  // If the user is issuing an imperative command but we couldn't safely execute anything,
  // ask for the missing info instead of giving step-by-step portal instructions.
  if (shouldAutoExecuteFromUserText(effectiveText) && !assistantActions.length) {
    try {
      const system = [
        "You are an automation agent inside a business portal.",
        "The user gave an imperative instruction, but the system is missing required specifics (like IDs).",
        "Ask ONE short clarifying question to get the missing info so you can execute the action.",
        "Do NOT give step-by-step instructions for how to do it manually in the UI.",
        "Be specific and action-oriented.",
      ].join("\n");

      const user = [
        "Conversation (most recent last):",
        recentMessages.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.text}`).join("\n") || "(none)",
        "\nLatest user message:",
        promptMessage,
        "\nQuestion:",
      ].join("\n");

      const q = String(await generateText({ system, user })).trim().slice(0, 600);
      if (q) {
        const assistantMsg = await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: q,
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

        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
        return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null });
      }
    } catch {
      // ignore
    }
  }

  const reply = await runPortalSupportChat({
    message: promptMessage,
    url: contextUrl,
    recentMessages: modelMessages,
    threadContext: fallbackThreadContext,
  });

  const assistantMsg = await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId,
      threadId,
      role: "assistant",
      text: reply,
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

  await (prisma as any).portalAiChatThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() },
  });

  await maybeUpdateThreadTitle({ thread, threadId, now, promptMessage, assistantText: reply });

  return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions, autoActionMessage: null, canvasUrl: null });
}

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  try {
    return await handlePostMessage(req, ctx);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[AI Chat POST Error]", { message, stack: err instanceof Error ? err.stack : undefined });
    return NextResponse.json(
      { ok: false, error: String(message && typeof message === "string" ? message : "Send failed").slice(0, 500) },
      { status: 500 },
    );
  }
}
