import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { generateText } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { PortalAgentActionKeySchema, extractJsonObject, portalAgentActionsIndexText } from "@/lib/portalAgentActions";
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

  // Best-effort: propose actions the user can click to execute.
  // IMPORTANT: we only PROPOSE actions; execution requires an explicit user click.
  let assistantActions: Array<{ key: string; title: string; confirmLabel?: string; args: Record<string, unknown> }> = [];
  try {
    const system = [
      "You are an automation agent inside a business portal.",
      "Propose up to 2 concrete next actions that can be executed via whitelisted APIs.",
      "Only propose actions when you have enough information from the conversation to fill required fields.",
      "Never invent IDs (automationId, userId, etc). If missing, propose no actions.",
      "Output JSON only, in this exact shape: {\"actions\":[{\"key\":...,\"title\":...,\"confirmLabel\":...,\"args\":{...}}]}",
      "Do not include markdown fences unless needed.",
      "\n" + portalAgentActionsIndexText(),
    ].join("\n");

    const user = [
      "User message:",
      promptMessage,
      "\nAssistant reply:",
      reply,
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

  return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions });
}
