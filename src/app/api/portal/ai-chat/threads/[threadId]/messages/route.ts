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
import { executePortalAgentActionForThread } from "@/lib/portalAgentActionExecutor";
import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";

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
  })
  .refine(
    (d) => Boolean((d.text || "").trim()) || (Array.isArray(d.attachments) && d.attachments.length > 0),
    { message: "Text or attachments required" },
  );

function cleanSuggestedTitle(raw: string): string {
  const s = String(raw || "").trim().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  // Keep it short and UI-friendly.
  return s.replace(/^"|"$/g, "").replace(/^'|'$/g, "").slice(0, 60).trim();
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

  const verb = /\b(create|make|build|generate|run|start|trigger)\b/i.test(t);
  if (!verb) return false;

  return /\b(task|funnel|newsletter|blog|automation|calendar|booking|appointment|contacts?|text|sms|email|message|media|media library|folder|dashboard|reporting)\b/i.test(t);
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

function detectDeterministicActionsFromText(opts: {
  text: string;
  attachments: Array<{ id?: string | null; fileName?: string; url?: string }>;
}): Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown> }> {
  const t = String(opts.text || "").trim();
  const lower = t.toLowerCase();
  const attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
  if (!t && !attachments.length) return [];

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

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
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
    select: { id: true, title: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const now = new Date();

  const cleanText = (parsed.data.text || "").trim();
  const attachments = Array.isArray(parsed.data.attachments) ? parsed.data.attachments : [];
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

  const userMsg = await (prisma as any).portalAiChatMessage.create({
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

  await (prisma as any).portalAiChatThread.update({
    where: { id: threadId },
    data: { lastMessageAt: now },
  });

  if (!isPortalSupportChatConfigured()) {
    return NextResponse.json(
      { ok: false, error: "AI chat is not configured for this environment." },
      { status: 503 },
    );
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
      autoActionMessage: exec.assistantMessage,
    });
  }

  const recentRows = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "desc" },
    take: 13,
    select: { id: true, role: true, text: true },
  });

  const recentMessages = recentRows
    .filter((m: any) => m.id !== userMsg.id)
    .reverse()
    .slice(-12)
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: String(m.text || "").slice(0, 2000),
    }));

  // 2) Best-effort: propose actions the agent can execute.
  let assistantActions: Array<{ key: string; title: string; confirmLabel?: string; args: Record<string, unknown> }> = [];
  try {
    const system = [
      "You are an automation agent inside a business portal.",
      "Your job is to propose up to 2 concrete next actions that can be executed via whitelisted portal actions.",
      "Assume the system CAN execute whitelisted actions. Never refuse with statements like 'I can't do that'.",
      "Only propose actions when you have enough information from the conversation to fill required fields.",
      "Never invent IDs (automationId, userId, etc). If missing, propose no actions.",
      "If an action needs a slug (like funnel.create), derive it deterministically from the provided name.",
      "Output JSON only, in this exact shape: {\"actions\":[{\"key\":...,\"title\":...,\"confirmLabel\":...,\"args\":{...}}]}",
      "Do not include markdown fences unless needed.",
      "\n" + portalAgentActionsIndexText(),
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
    return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: autoActionMessage, assistantActions, autoActionMessage });
  }

  // 5) Fall back to support-style chat when no action was executed.
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
  // Only do this for untouched threads.
  try {
    const isDefaultTitle = String(thread.title || "").trim() === "New chat";
    if (isDefaultTitle && isPortalSupportChatConfigured()) {
      const titleSystem = [
        "You name chat threads in a business automation portal.",
        "Return a short, helpful title (2-6 words).",
        "No quotes. No trailing punctuation.",
      ].join("\n");

      const titleUser = [
        "Conversation:",
        `User: ${promptMessage}`,
        `Assistant: ${reply}`,
        "\nTitle:",
      ].join("\n");

      const proposed = cleanSuggestedTitle(await generateText({ system: titleSystem, user: titleUser }));
      if (proposed && proposed.length >= 3 && proposed.toLowerCase() !== "new chat") {
        await (prisma as any).portalAiChatThread.update({
          where: { id: threadId },
          data: { title: proposed },
        });
      }
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions, autoActionMessage: null });
}
