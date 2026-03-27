import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { generateText } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import {
  PortalAgentActionKeySchema,
  extractJsonObject,
  portalAgentActionsIndexText,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import { executePortalAgentAction, executePortalAgentActionForThread } from "@/lib/portalAgentActionExecutor";
import { getConfirmSpecForPortalAgentAction, portalCanvasUrlForAction, portalContactUiUrl } from "@/lib/portalAgentActionMeta";
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

const SendMessageSchema = z
  .object({
    text: z.string().trim().max(4000).optional(),
    url: z.string().trim().optional(),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    confirmToken: z.string().trim().min(1).max(200).optional(),
  })
  .refine(
    (d) =>
      Boolean(String((d as any).confirmToken || "").trim()) ||
      Boolean((d.text || "").trim()) ||
      (Array.isArray(d.attachments) && d.attachments.length > 0),
    { message: "Text or attachments required" },
  );

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

  // Avoid auto-executing on obvious questions.
  if (/\b(how|why|what|can you|could you|should i|help me|explain)\b/i.test(t)) return false;

  const verb = /\b(create|make|build|generate|run|start|trigger|send|text|sms|email|reply|respond|reset|optimize|add|remove|move|import|upload|activate|pause|enroll|apply|tag|untag|label)\b/i.test(
    t,
  );
  if (!verb) return false;

  return /\b(task|funnel|newsletter|blog|automation|calendar|booking|appointment|contacts?|people|review|reviews|text|sms|email|message|media|media library|folder|dashboard|reporting|nurture|campaign|tag|tags|label)\b/i.test(
    t,
  );
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
  | { ok: false; assistantMessage: any; canvasUrl: string | null }
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
    const lines = ambiguous
      .slice(0, 5)
      .map((c) => {
        const bits = [c.email ? `email: ${c.email}` : null, c.phone ? `phone: ${c.phone}` : null].filter(Boolean).join(" · ");
        return `- ${c.name}${bits ? ` (${bits})` : ""}`;
      })
      .join("\n");
    const msg = await createAssistantMessage(
      `I found multiple matches for “${plan.contactHint}”. Reply with the contact’s email or phone number so I can update tags.\n\n${lines}`,
    );
    return { ok: false, assistantMessage: msg, canvasUrl: null };
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

function detectDeterministicActionsFromText(opts: {
  text: string;
  attachments: Array<{ id?: string | null; fileName?: string; url?: string }>;
}): Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown> }> {
  const t = String(opts.text || "").trim();
  const lower = t.toLowerCase();
  const attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
  if (!t && !attachments.length) return [];

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
    return [{ key: "automations.create", title: "Create an automation", args: { name } }];
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
  const { threadId } = await ctx.params;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

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

  return NextResponse.json({ ok: true, messages });
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
  const { threadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = SendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, title: true, contextJson: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const now = new Date();

  const confirmToken = typeof (parsed.data as any).confirmToken === "string" ? String((parsed.data as any).confirmToken).trim().slice(0, 200) : "";
  const cleanText = (parsed.data.text || "").trim();
  const attachments = Array.isArray(parsed.data.attachments) ? parsed.data.attachments : [];
  const isConfirmOnly = Boolean(confirmToken) && !cleanText && !attachments.length;

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

    const results: Array<{ ok: boolean; markdown?: string; linkUrl?: string | null }> = [];
    for (const step of confirmedSteps) {
      const exec = await executePortalAgentAction({
        ownerId,
        actorUserId: createdByUserId,
        action: step.key,
        args: step.args,
      });
      results.push({ ok: Boolean(exec.ok), markdown: exec.markdown, linkUrl: exec.linkUrl ?? null });
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

    return NextResponse.json({ ok: true, userMessage: null, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl });
  }

  const attachmentLines = attachments
    .map((a) => {
      const name = String(a.fileName || "Attachment").slice(0, 200);
      const url = String(a.url || "").slice(0, 500);
      return url ? `- ${name}: ${url}` : `- ${name}`;
    })
    .join("\n");

  const promptMessage = [
    cleanText || "Please review the attachments.",
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
          text: cleanText,
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
  }

  // 0) Deterministic workflows that can resolve IDs for the user.
  // (Example: add/remove a contact tag by name + email/phone/contact name.)
  const recentRows = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "desc" },
    take: 13,
    select: { id: true, role: true, text: true },
  });

  const recentMessages: Array<{ role: "user" | "assistant"; text: string }> = recentRows
    .filter((m: any) => (userMsg ? m.id !== (userMsg as any).id : true))
    .reverse()
    .slice(-12)
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: String(m.text || "").slice(0, 2000),
    }));

  const tagWorkflow = await tryExecuteContactTagCommand({
    ownerId,
    threadId,
    now,
    text: cleanText,
    recentMessages,
  });
  if (tagWorkflow?.assistantMessage) {
    return NextResponse.json({
      ok: true,
      userMessage: userMsg,
      assistantMessage: tagWorkflow.assistantMessage,
      assistantActions: [],
      autoActionMessage: null,
      canvasUrl: tagWorkflow.canvasUrl || null,
    });
  }

  // 0.5) Agentic planning + deterministic resolution (multi-step, no IDs required).
  // This runs before the legacy action-proposal flow, and it executes immediately for imperative requests.
  if (isPortalSupportChatConfigured()) {
    try {
      const threadContext = (thread as any).contextJson ?? null;

      const pendingConfirm =
        threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
          ? (threadContext as any).pendingConfirm
          : null;

      const pendingPlan =
        threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
          ? (threadContext as any).pendingPlan
          : null;

      // Any new user message clears stale confirmations.
      if (pendingConfirm && !isConfirmOnly) {
        const prevCtx = threadContext;
        const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
          ? { ...(prevCtx as any), pendingConfirm: null }
          : { pendingConfirm: null };
        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
      }

      // If we previously asked a clarifying question, treat the user's reply as completing that plan.
      const isLikelyFollowUpAnswer = Boolean(pendingPlan) && !shouldAutoExecuteFromUserText(cleanText);

      const plan = isLikelyFollowUpAnswer
        ? (pendingPlan as any)
        : await planPuraActions({
            text: cleanText,
            url: parsed.data.url,
            recentMessages,
            threadContext,
          });

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

        const prevCtx = (thread as any).contextJson;
        const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
          ? { ...(prevCtx as any), pendingPlan: plan }
          : { pendingPlan: plan };

        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
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
        return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null });
      }

      if (plan?.mode === "execute" && Array.isArray(plan.steps) && plan.steps.length) {
        const resolvedSteps: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }> = [];
        const contextPatches: Array<Record<string, unknown> | undefined> = [];

        for (const step of plan.steps.slice(0, 6)) {
          const argsRaw = step.args && typeof step.args === "object" && !Array.isArray(step.args) ? (step.args as Record<string, unknown>) : {};
          const resolved = await resolvePlanArgs({
            ownerId,
            stepKey: step.key,
            args: argsRaw,
            userHint: cleanText,
            url: parsed.data.url,
            threadContext,
          });
          if (!resolved.ok) {
            const assistantMsg = await (prisma as any).portalAiChatMessage.create({
              data: {
                ownerId,
                threadId,
                role: "assistant",
                text: resolved.clarifyQuestion,
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
              ? { ...(prevCtx as any), pendingPlan: plan }
              : { pendingPlan: plan };
            await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });
            return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl: null });
          }

          const resolvedArgs = resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args)
            ? (resolved.args as Record<string, unknown>)
            : {};

          resolvedSteps.push({ key: step.key, title: step.title, args: resolvedArgs, ...(step.openUrl ? { openUrl: step.openUrl } : {}) });
          contextPatches.push(resolved.contextPatch);
        }

        const confirmSpec = resolvedSteps.map((s) => getConfirmSpecForPortalAgentAction(s.key)).find(Boolean) || null;
        if (confirmSpec) {
          const token = crypto.randomUUID();
          const prevCtx = threadContext;
          const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
            ? { ...(prevCtx as any), pendingConfirm: { token, createdAt: now.toISOString(), workTitle: plan.workTitle ?? null, steps: resolvedSteps, confirm: confirmSpec } }
            : { pendingConfirm: { token, createdAt: now.toISOString(), workTitle: plan.workTitle ?? null, steps: resolvedSteps, confirm: confirmSpec } };
          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });

          return NextResponse.json({
            ok: true,
            userMessage: userMsg,
            assistantMessage: null,
            assistantActions: [],
            autoActionMessage: null,
            canvasUrl: null,
            needsConfirm: { ...confirmSpec, token },
          });
        }

        const results: Array<{ ok: boolean; markdown?: string; linkUrl?: string | null }> = [];
        for (const step of resolvedSteps) {
          const exec = await executePortalAgentAction({
            ownerId,
            actorUserId: createdByUserId,
            action: step.key,
            args: step.args,
          });
          results.push({ ok: Boolean(exec.ok), markdown: exec.markdown, linkUrl: exec.linkUrl ?? null });
        }

        const mappedCanvasUrl =
          (resolvedSteps
            .map((s) => portalCanvasUrlForAction(s.key, s.args))
            .filter(Boolean)
            .slice(-1)[0] as string | undefined) ||
          null;

        const canvasUrl =
          (results.map((r) => r.linkUrl).filter(Boolean).slice(-1)[0] as string | undefined) ||
          resolvedSteps.map((s) => s.openUrl).filter(Boolean).slice(-1)[0] ||
          mappedCanvasUrl ||
          null;

        const assistantText = (() => {
          if (resolvedSteps.length === 1) {
            return String(results[0]?.markdown || "Done.").trim() || "Done.";
          }
          const blocks = resolvedSteps.map((s, idx) => {
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
          ? { ...(prevCtx as any), ...mergedPatch, lastWorkTitle: plan.workTitle ?? null, lastCanvasUrl: canvasUrl, pendingPlan: null, runs }
          : { ...mergedPatch, lastWorkTitle: plan.workTitle ?? null, lastCanvasUrl: canvasUrl, pendingPlan: null, runs };

        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now, contextJson: nextCtx } });

        return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions: [], autoActionMessage: null, canvasUrl });
      }
    } catch {
      // If planning fails, fall through to existing behavior.
    }
  }

  // 1) Prefer deterministic action execution for common commands.
  const deterministicActions = detectDeterministicActionsFromText({ text: cleanText, attachments });
  if (deterministicActions.length) {
    const first = deterministicActions[0];
    const exec = await executePortalAgentActionForThread({
      ownerId,
      actorUserId: createdByUserId,
      threadId,
      action: first.key,
      args: first.args,
    });

    return NextResponse.json({
      ok: true,
      userMessage: userMsg,
      assistantMessage: exec.assistantMessage,
      assistantActions: [],
      autoActionMessage: null,
      canvasUrl: exec.linkUrl || null,
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
  if (shouldAutoExecuteFromUserText(cleanText) && assistantActions.length) {
    const first = assistantActions[0];
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
  if (shouldAutoExecuteFromUserText(cleanText) && !assistantActions.length) {
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
    url: parsed.data.url,
    recentMessages,
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

  // AI-generated thread title (not just the first message).
  // Only do this for untouched threads or threads with generic names.
  try {
    const currentTitle = String(thread.title || "").trim();
    const isDefaultTitle = currentTitle === "New chat" || !currentTitle || currentTitle.toLowerCase() === "new chat";
    const threadAgeMs = now.getTime() - new Date((thread as any).createdAt).getTime();
    const isRecent = threadAgeMs < 5 * 60 * 1000; // less than 5 min old

    if (isDefaultTitle || isRecent) {
      const titleSystem = [
        "You name chat threads in a business automation portal.",
        "Return a short, helpful title (2-6 words).",
        "No quotes. No trailing punctuation.",
        "Make it action-oriented and descriptive.",
      ].join("\n");

      const titleUser = [
        "Conversation:",
        `User: ${promptMessage}`,
        `Assistant: ${reply}`,
        "\nTitle:",
      ].join("\n");

      const proposed = isPortalSupportChatConfigured()
        ? cleanSuggestedTitle(await generateText({ system: titleSystem, user: titleUser }))
        : heuristicThreadTitleFromUserText(promptMessage);
      if (proposed && proposed.length >= 3 && proposed.toLowerCase() !== "new chat") {
        await (prisma as any).portalAiChatThread.update({
          where: { id: threadId },
          data: { title: proposed },
        });
      } else if (isDefaultTitle) {
        // Fallback: use first message text as title if nothing else
        const firstMsg = await prisma.portalAiChatMessage.findFirst({
          where: { threadId },
          orderBy: { createdAt: "asc" },
        });
        if (firstMsg && firstMsg.text && firstMsg.text.length > 3) {
          await prisma.portalAiChatThread.update({
            where: { id: threadId },
            data: { title: firstMsg.text.slice(0, 120) },
          });
        }
      }
    }
  } catch {
    // best-effort
  }

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
