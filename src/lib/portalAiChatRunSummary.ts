import { prisma } from "@/lib/db";
import { normalizePortalAiChatFollowUpSuggestions, normalizePortalAiChatRunSteps } from "@/lib/portalAiChatRunLedger";
import { generatePuraText as generateText, isPuraAiConfigured } from "@/lib/puraAi";
import { normalizePuraAiProfile } from "@/lib/puraAiProfile";

function normalizeAiSummaryText(raw: unknown): string | null {
  const text = String(raw || "")
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^[\-*\d.)\s]+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
  return text || null;
}

async function generatePortalAiChatRunAiSummary(opts: {
  triggerKind?: string | null;
  status?: string | null;
  workTitle?: string | null;
  canvasUrl?: string | null;
  assistantText?: string | null;
  steps?: unknown;
  followUpSuggestions?: unknown;
  responseProfile?: unknown;
}) {
  if (!isPuraAiConfigured(opts.responseProfile)) return null;

  const steps = normalizePortalAiChatRunSteps(opts.steps);
  const followUpSuggestions = normalizePortalAiChatFollowUpSuggestions(opts.followUpSuggestions);
  const assistantText = String(opts.assistantText || "").trim().slice(0, 4000);
  const workTitle = String(opts.workTitle || "").trim().slice(0, 200);
  const status = String(opts.status || "completed").trim().toLowerCase().slice(0, 40);
  const triggerKind = String(opts.triggerKind || "chat").trim().toLowerCase().slice(0, 40);

  try {
    const raw = await generateText({
      profile: normalizePuraAiProfile(opts.responseProfile),
      temperature: 0.35,
      system: [
        "You write short activity summaries for Pura work runs inside a SaaS portal.",
        "Write a relaxed, human, helpful recap in first person as Pura.",
        "Return plain text only.",
        "Use 1 or 2 short sentences.",
        "Be specific about what changed, what finished, or what blocked the run.",
        "If the run failed or needs input, say that clearly without sounding robotic.",
        "Never use bullets, markdown, labels, or quotes.",
        "Keep it under 220 characters when possible.",
      ].join("\n"),
      user: JSON.stringify({
        triggerKind,
        status,
        workTitle: workTitle || null,
        canvasUrl: String(opts.canvasUrl || "").trim().slice(0, 1200) || null,
        assistantText: assistantText || null,
        steps: steps.map((step) => ({ key: step.key, title: step.title, ok: step.ok })),
        followUpSuggestions,
      }),
    });
    return normalizeAiSummaryText(raw);
  } catch {
    return null;
  }
}

export async function ensurePortalAiChatRunAiSummary(opts: {
  ownerId: string;
  threadId: string;
  runId?: string | null;
  assistantMessageId?: string | null;
  scheduledMessageId?: string | null;
  triggerKind?: string | null;
  responseProfile?: unknown;
}) {
  const ownerId = String(opts.ownerId || "").trim();
  const threadId = String(opts.threadId || "").trim();
  if (!ownerId || !threadId) return null;

  const where: Record<string, unknown> = { ownerId, threadId };
  const runId = String(opts.runId || "").trim();
  const assistantMessageId = String(opts.assistantMessageId || "").trim();
  const scheduledMessageId = String(opts.scheduledMessageId || "").trim();
  const triggerKind = String(opts.triggerKind || "").trim();

  if (runId) where.runId = runId;
  else if (assistantMessageId) where.assistantMessageId = assistantMessageId;
  else if (scheduledMessageId) where.scheduledMessageId = scheduledMessageId;
  if (triggerKind) where.triggerKind = triggerKind;

  const row = await (prisma as any).portalAiChatRun.findFirst({
    where,
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      triggerKind: true,
      status: true,
      workTitle: true,
      canvasUrl: true,
      summaryText: true,
      aiSummaryText: true,
      stepsJson: true,
      followUpSuggestionsJson: true,
    },
  }).catch(() => null);

  if (!row?.id) return null;
  if (typeof row.aiSummaryText === "string" && row.aiSummaryText.trim()) {
    return normalizeAiSummaryText(row.aiSummaryText);
  }

  const aiSummaryText = await generatePortalAiChatRunAiSummary({
    triggerKind: row.triggerKind,
    status: row.status,
    workTitle: row.workTitle,
    canvasUrl: row.canvasUrl,
    assistantText: row.summaryText,
    steps: row.stepsJson,
    followUpSuggestions: row.followUpSuggestionsJson,
    responseProfile: opts.responseProfile,
  });
  if (!aiSummaryText) return null;

  await (prisma as any).portalAiChatRun.update({
    where: { id: row.id },
    data: { aiSummaryText, aiSummaryGeneratedAt: new Date() },
  }).catch(() => null);

  return aiSummaryText;
}

export async function backfillPortalAiChatRunAiSummaries(opts: {
  ownerId: string;
  threadId: string;
  responseProfile?: unknown;
  limit?: number;
}) {
  const ownerId = String(opts.ownerId || "").trim();
  const threadId = String(opts.threadId || "").trim();
  if (!ownerId || !threadId) return;
  if (!isPuraAiConfigured(opts.responseProfile)) return;

  const rows = await (prisma as any).portalAiChatRun.findMany({
    where: { ownerId, threadId, aiSummaryText: null },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(1, Math.min(Number(opts.limit) || 10, 20)),
    select: {
      id: true,
      runId: true,
      assistantMessageId: true,
      scheduledMessageId: true,
      triggerKind: true,
    },
  }).catch(() => []);

  for (const row of Array.isArray(rows) ? rows : []) {
    await ensurePortalAiChatRunAiSummary({
      ownerId,
      threadId,
      runId: typeof row?.runId === "string" ? row.runId : null,
      assistantMessageId: typeof row?.assistantMessageId === "string" ? row.assistantMessageId : null,
      scheduledMessageId: typeof row?.scheduledMessageId === "string" ? row.scheduledMessageId : null,
      triggerKind: typeof row?.triggerKind === "string" ? row.triggerKind : null,
      responseProfile: opts.responseProfile,
    });
  }
}
