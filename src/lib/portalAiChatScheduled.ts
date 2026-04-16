import { prisma } from "@/lib/db";
import { persistPortalAiChatRun } from "@/lib/portalAiChatRunLedger";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { getConfirmSpecForPortalAgentAction, portalCanvasUrlForAction } from "@/lib/portalAgentActionMeta";
import { deriveThreadContextPatchFromAction, executePortalAgentAction } from "@/lib/portalAgentActionExecutor";
import type { PortalAgentActionKey } from "@/lib/portalAgentActions";
import { tryParseScheduledActionEnvelope } from "@/lib/portalAiChatScheduledActionEnvelope";
import { getScheduledRecurrenceTimeZone, withScheduledRecurrenceMetadata } from "@/lib/portalAiChatScheduledRecurrence";
import { getOwnerProfilePhoneE164 } from "@/lib/missedCallTextBack";
import { absolutizeAssistantTextLinks } from "@/lib/portalAssistantLinks";
import { sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { planPuraActions } from "@/lib/puraPlanner";
import { resolvePlanArgs } from "@/lib/puraResolver";
import { isPortalSupportChatConfigured } from "@/lib/portalSupportChat";
import { generatePuraText as generateText, runWithPuraAiProfile } from "@/lib/puraAi";
import { normalizePuraAiProfile } from "@/lib/puraAiProfile";

type PendingScheduleResumeState = {
  source: "scheduled";
  channel: "sms";
  awaitingReply: boolean;
  ownerPhoneE164: string;
  actorUserId: string | null;
  scheduledMessageId: string | null;
  repeatEveryMinutes: number;
  recurrenceTimeZone: string | null;
  workTitle: string | null;
  question: string | null;
  createdAt: string;
  notifiedAt: string | null;
  repliedAt: string | null;
};

function normalizePendingScheduleResumeState(raw: unknown): PendingScheduleResumeState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (String(rec.source || "") !== "scheduled" || String(rec.channel || "") !== "sms") return null;

  const ownerPhoneE164 = typeof rec.ownerPhoneE164 === "string" ? rec.ownerPhoneE164.trim().slice(0, 60) : "";
  if (!ownerPhoneE164) return null;

  const repeatEveryMinutes =
    typeof rec.repeatEveryMinutes === "number" && Number.isFinite(rec.repeatEveryMinutes)
      ? Math.max(0, Math.floor(rec.repeatEveryMinutes))
      : 0;

  return {
    source: "scheduled",
    channel: "sms",
    awaitingReply: rec.awaitingReply !== false,
    ownerPhoneE164,
    actorUserId: typeof rec.actorUserId === "string" && rec.actorUserId.trim() ? rec.actorUserId.trim().slice(0, 120) : null,
    scheduledMessageId: typeof rec.scheduledMessageId === "string" && rec.scheduledMessageId.trim() ? rec.scheduledMessageId.trim().slice(0, 120) : null,
    repeatEveryMinutes,
    recurrenceTimeZone: typeof rec.recurrenceTimeZone === "string" && rec.recurrenceTimeZone.trim() ? rec.recurrenceTimeZone.trim().slice(0, 80) : null,
    workTitle: typeof rec.workTitle === "string" && rec.workTitle.trim() ? rec.workTitle.trim().slice(0, 240) : null,
    question: typeof rec.question === "string" && rec.question.trim() ? rec.question.trim().slice(0, 800) : null,
    createdAt: typeof rec.createdAt === "string" && rec.createdAt.trim() ? rec.createdAt : new Date().toISOString(),
    notifiedAt: typeof rec.notifiedAt === "string" && rec.notifiedAt.trim() ? rec.notifiedAt : null,
    repliedAt: typeof rec.repliedAt === "string" && rec.repliedAt.trim() ? rec.repliedAt : null,
  };
}

async function enqueueNextRecurringScheduledMessage(opts: {
  ownerId: string;
  threadId: string;
  text: string;
  attachmentsJson: unknown;
  createdByUserId: string | null;
  scheduledAt: Date | null;
  repeatEveryMinutes: number;
  recurrenceTimeZone?: string | null;
}) {
  if (!(opts.repeatEveryMinutes > 0)) return;
  const nextAt = await computeNextRecurringRunAt({
    scheduledAt: opts.scheduledAt,
    repeatEveryMinutes: opts.repeatEveryMinutes,
    recurrenceTimeZone: opts.recurrenceTimeZone,
  });
  if (!nextAt) throw new Error("Unable to compute next recurring run time");
  await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId: opts.ownerId,
      threadId: opts.threadId,
      role: "user",
      text: String(opts.text || "").slice(0, 4000),
      attachmentsJson: opts.attachmentsJson ?? null,
      createdByUserId: opts.createdByUserId ?? null,
      sendAt: nextAt,
      sentAt: null,
      repeatEveryMinutes: opts.repeatEveryMinutes,
    },
    select: { id: true },
  });
}

async function maybeNotifyScheduledTaskNeedsInputBySms(opts: {
  ownerId: string;
  actorUserId: string | null;
  threadContext: unknown;
  scheduledMessageId: string;
  repeatEveryMinutes: number;
  recurrenceTimeZone?: string | null;
  workTitle?: string | null;
  question?: string | null;
}) {
  const existing =
    opts.threadContext && typeof opts.threadContext === "object" && !Array.isArray(opts.threadContext)
      ? normalizePendingScheduleResumeState((opts.threadContext as any).pendingScheduleResume)
      : null;

  if (existing?.awaitingReply) {
    return existing;
  }

  const ownerPhoneE164 = await getOwnerProfilePhoneE164(opts.ownerId).catch(() => null);
  if (!ownerPhoneE164) return null;

  const question = typeof opts.question === "string" && opts.question.trim() ? opts.question.trim().slice(0, 500) : "Reply with the missing detail so I can continue.";
  const workTitle = typeof opts.workTitle === "string" && opts.workTitle.trim() ? opts.workTitle.trim().slice(0, 160) : "your scheduled task";
  const smsBody = [
    `Pura needs your reply to continue ${workTitle}.`,
    question,
    "Reply here and I’ll continue it in the portal.",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 900);

  const sent = await sendOwnerTwilioSms({ ownerId: opts.ownerId, to: ownerPhoneE164, body: smsBody, logToInbox: false }).catch(() => null);
  if (!sent || !(sent as any).ok) return null;

  return {
    source: "scheduled",
    channel: "sms",
    awaitingReply: true,
    ownerPhoneE164,
    actorUserId: opts.actorUserId ?? null,
    scheduledMessageId: opts.scheduledMessageId,
    repeatEveryMinutes: Math.max(0, Math.floor(opts.repeatEveryMinutes || 0)),
    recurrenceTimeZone: opts.recurrenceTimeZone ? String(opts.recurrenceTimeZone).slice(0, 80) : null,
    workTitle: workTitle || null,
    question: question || null,
    createdAt: new Date().toISOString(),
    notifiedAt: new Date().toISOString(),
    repliedAt: null,
  } satisfies PendingScheduleResumeState;
}

export async function resumeScheduledPortalAiChatFromSms(opts: {
  ownerId: string;
  fromPhone: string;
  body: string;
}): Promise<{ matched: boolean; threadId?: string; replyText?: string }> {
  const fromPhone = String(opts.fromPhone || "").trim();
  const body = String(opts.body || "").trim().slice(0, 4000);
  if (!fromPhone || !body) return { matched: false };

  const threads = await (prisma as any).portalAiChatThread.findMany({
    where: { ownerId: opts.ownerId },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: { id: true, contextJson: true },
  });

  const match = (threads || []).find((thread: any) => {
    const ctx = thread?.contextJson && typeof thread.contextJson === "object" && !Array.isArray(thread.contextJson) ? thread.contextJson : null;
    const pending = normalizePendingScheduleResumeState(ctx ? (ctx as any).pendingScheduleResume : null);
    return Boolean(pending?.awaitingReply && pending.ownerPhoneE164 === fromPhone);
  });

  if (!match) return { matched: false };

  const ctx = match.contextJson && typeof match.contextJson === "object" && !Array.isArray(match.contextJson) ? (match.contextJson as any) : {};
  const pending = normalizePendingScheduleResumeState(ctx.pendingScheduleResume);
  if (!pending) return { matched: false };

  await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId: opts.ownerId,
      threadId: String(match.id),
      role: "user",
      text: body,
      attachmentsJson: { source: "scheduled_sms_reply" },
      createdByUserId: pending.actorUserId ?? null,
      sendAt: new Date(),
      sentAt: null,
    },
    select: { id: true },
  });

  await (prisma as any).portalAiChatThread.update({
    where: { id: String(match.id) },
    data: {
      lastMessageAt: new Date(),
      contextJson: {
        ...ctx,
        pendingScheduleResume: null,
      },
    },
  });

  await processDuePortalAiChatScheduledMessages({ ownerId: opts.ownerId, limit: 25 }).catch(() => null);

  return {
    matched: true,
    threadId: String(match.id),
    replyText: pending.workTitle
      ? `Got it - I'll continue ${pending.workTitle} and follow up in the portal.`
      : "Got it - I'll continue that scheduled task and follow up in the portal.",
  };
}

async function computeNextRecurringRunAt(opts: {
  scheduledAt: Date | null;
  repeatEveryMinutes: number;
  recurrenceTimeZone?: string | null;
}) {
  const repeatEveryMinutes = Number.isFinite(opts.repeatEveryMinutes)
    ? Math.max(0, Math.floor(opts.repeatEveryMinutes))
    : 0;
  if (!repeatEveryMinutes) return null;

  const fallbackBase = opts.scheduledAt && Number.isFinite(opts.scheduledAt.getTime()) ? opts.scheduledAt : new Date();
  const fallback = new Date(fallbackBase.getTime() + repeatEveryMinutes * 60_000);
  const recurrenceTimeZone = String(opts.recurrenceTimeZone || "").trim().slice(0, 80);
  if (!recurrenceTimeZone) return fallback;

  const { DateTime } = await import("luxon");
  const base = DateTime.fromJSDate(fallbackBase, { zone: recurrenceTimeZone });
  if (!base.isValid) return fallback;

  const next =
    repeatEveryMinutes % (60 * 24 * 7) === 0
      ? base.plus({ weeks: repeatEveryMinutes / (60 * 24 * 7) })
      : repeatEveryMinutes % (60 * 24) === 0
        ? base.plus({ days: repeatEveryMinutes / (60 * 24) })
        : repeatEveryMinutes % 60 === 0
          ? base.plus({ hours: repeatEveryMinutes / 60 })
          : base.plus({ minutes: repeatEveryMinutes });

  return next.isValid ? next.toJSDate() : fallback;
}

async function tryGenerateScheduledAssistantText(opts: { system: string; payload: unknown; maxLen?: number; profile?: unknown }): Promise<string> {
  try {
    const out = String(
      await generateText({
        system: opts.system,
        user: `Context (JSON):\n${JSON.stringify(opts.payload ?? null, null, 2)}`,
        profile: normalizePuraAiProfile(opts.profile),
      }),
    )
      .trim()
      .slice(0, typeof opts.maxLen === "number" && Number.isFinite(opts.maxLen) ? Math.max(1, Math.floor(opts.maxLen)) : 1200);
    return out;
  } catch {
    return "";
  }
}

export async function processDuePortalAiChatScheduledMessages(
  opts?: { limit?: number; ownerId?: string },
): Promise<{ ok: true; processed: number } | { ok: false; error: string }> {
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
  const ownerIdFilter = typeof opts?.ownerId === "string" && opts.ownerId.trim() ? opts.ownerId.trim() : "";

  try {
    await ensurePortalAiChatSchema();

  // Note: we support deterministic scheduled action envelopes that do NOT require portal support chat.

  const now = new Date();

  const pending = await (prisma as any).portalAiChatMessage.findMany({
    where: {
      role: "user",
      sentAt: null,
      sendAt: { lte: now },
      ...(ownerIdFilter ? { ownerId: ownerIdFilter } : {}),
    },
    orderBy: { sendAt: "asc" },
    take: limit,
    select: {
      id: true,
      ownerId: true,
      threadId: true,
      text: true,
      attachmentsJson: true,
      createdByUserId: true,
      sendAt: true,
      repeatEveryMinutes: true,
    },
  });

  let processed = 0;
  const ownerTimeZoneCache = new Map<string, string>();
  const actorTimeZoneCache = new Map<string, string>();

  for (const p of pending) {
    const ownerId = String(p.ownerId);
    const threadId = String(p.threadId);
    const actorUserId = String((p as any).createdByUserId || ownerId);
    const repeatEveryMinutes =
      typeof (p as any).repeatEveryMinutes === "number" && Number.isFinite((p as any).repeatEveryMinutes)
        ? Math.max(0, Math.floor((p as any).repeatEveryMinutes))
        : 0;
    const scheduledAt = (p as any).sendAt ? new Date((p as any).sendAt) : null;
    const recurrenceTimeZone = getScheduledRecurrenceTimeZone((p as any).attachmentsJson);
    let ownerTimeZone = ownerTimeZoneCache.get(ownerId) || "";
    if (!ownerTimeZone) {
      const tz =
        (await prisma.user.findUnique({ where: { id: ownerId }, select: { timeZone: true } }).catch(() => null))?.timeZone ||
        "";
      ownerTimeZone = tz ? String(tz).slice(0, 80) : "";
      if (ownerTimeZone) ownerTimeZoneCache.set(ownerId, ownerTimeZone);
    }
    let actorTimeZone = actorTimeZoneCache.get(actorUserId) || "";
    if (!actorTimeZone) {
      const tz =
        (await prisma.user.findUnique({ where: { id: actorUserId }, select: { timeZone: true } }).catch(() => null))?.timeZone ||
        "";
      actorTimeZone = tz ? String(tz).slice(0, 80) : "";
      if (actorTimeZone) actorTimeZoneCache.set(actorUserId, actorTimeZone);
    }
    const effectiveRecurrenceTimeZone = recurrenceTimeZone || actorTimeZone || ownerTimeZone;
    const normalizedAttachmentsJson = withScheduledRecurrenceMetadata({
      attachmentsJson: (p as any).attachmentsJson ?? null,
      repeatEveryMinutes,
      recurrenceTimeZone: effectiveRecurrenceTimeZone,
    });
    if (normalizedAttachmentsJson !== ((p as any).attachmentsJson ?? null)) {
      await (prisma as any).portalAiChatMessage.update({
        where: { id: p.id },
        data: { attachmentsJson: normalizedAttachmentsJson },
      }).catch(() => null);
    }

    // Atomically claim the row first to avoid double-processing under overlapping cron runs.
    const claimedAt = new Date();
    const claim = await (prisma as any).portalAiChatMessage.updateMany({
      where: { id: p.id, sentAt: null },
      data: { sentAt: claimedAt },
    });
    if (!claim?.count) continue;

    let responseProfile = normalizePuraAiProfile(undefined);

    try {

    const thread = await (prisma as any).portalAiChatThread.findFirst({
      where: { id: threadId, ownerId },
      select: { id: true, contextJson: true },
    });

    const recentRows = await (prisma as any).portalAiChatMessage.findMany({
      where: { ownerId, threadId },
      orderBy: { createdAt: "asc" },
      take: 400,
      select: { id: true, role: true, text: true },
    });

    const recentMessages: Array<{ role: "user" | "assistant"; text: string }> = recentRows
      .filter((m: any) => String(m.id) !== String(p.id))
      .map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        text: String(m.text || "").slice(0, 2000),
      }))
      .filter((m: any) => Boolean(String(m.text || "").trim()))
      .slice(-120);

    const threadContext = (thread as any)?.contextJson ?? null;
    responseProfile = normalizePuraAiProfile((threadContext as any)?.responseProfile);
    const text = String((p as any).text || "").trim().slice(0, 4000);
    const pendingScheduleResume =
      threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
        ? normalizePendingScheduleResumeState((threadContext as any).pendingScheduleResume)
        : null;

    if (pendingScheduleResume?.awaitingReply) {
      await enqueueNextRecurringScheduledMessage({
        ownerId,
        threadId,
        text: String((p as any).text || ""),
        attachmentsJson: normalizedAttachmentsJson,
        createdByUserId: (p as any).createdByUserId ?? null,
        scheduledAt,
        repeatEveryMinutes,
        recurrenceTimeZone: effectiveRecurrenceTimeZone,
      });
      processed += 1;
      continue;
    }

    const envelope = tryParseScheduledActionEnvelope(text);

    const effectiveThreadContext = (() => {
      if (!ownerTimeZone) return threadContext;
      const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
      if (String(prevCtx.ownerTimeZone || "") === ownerTimeZone) return threadContext;
      return { ...prevCtx, ownerTimeZone };
    })();

    const plan = await runWithPuraAiProfile(responseProfile, async () => envelope
      ? ({
          mode: "execute" as const,
          workTitle: envelope.workTitle || "Scheduled action",
          steps: envelope.steps.map((s) => ({
            key: s.key,
            title: String(s.title || "Scheduled action"),
            args: (s.args && typeof s.args === "object" && !Array.isArray(s.args) ? s.args : {}) as Record<string, unknown>,
          })),
        } as any)
      : await (async () => {
          if (!isPortalSupportChatConfigured()) {
            return null;
          }
          return planPuraActions({
            text,
            url: undefined,
            recentMessages,
            threadContext: effectiveThreadContext,
          });
        })());

    // For deterministic scheduled-action envelopes, each step already contains its own explicit ref hints.
    // Do NOT reuse `workTitle` as a resolver hint (it is often a generic schedule label like "Weekday SMS"
    // and can pollute entity resolution, e.g. contact hint becomes "Chester Weekday SMS").
    const resolverUserHint = envelope ? "" : text;

    const shouldExecute = plan?.mode === "execute" && Array.isArray((plan as any).steps) && (plan as any).steps.length;

    if (!shouldExecute) {
      const assistantText = await tryGenerateScheduledAssistantText({
        system: [
          "You are an assistant inside a SaaS portal.",
          "A scheduled run was processed but nothing was executed.",
          "Write a brief message (1-2 sentences) explaining why.",
          "Rules:",
          "- No JSON.",
          "- Do not mention internal implementation details.",
        ].join("\n"),
        payload: {
          hasEnvelope: Boolean(envelope),
          portalSupportChatConfigured: isPortalSupportChatConfigured(),
          workTitle: (plan as any)?.workTitle ?? envelope?.workTitle ?? null,
          reason: envelope
            ? "invalid_scheduled_action_payload"
            : !isPortalSupportChatConfigured()
              ? "assistant_not_configured"
              : "no_actions_to_execute",
        },
        maxLen: 800,
        profile: responseProfile,
      });

      if (assistantText) {
        await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: assistantText,
            attachmentsJson: null,
            createdByUserId: null,
            sendAt: null,
            sentAt: new Date(),
          },
          select: { id: true },
        });
      }

      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
      processed += 1;
      continue;
    }

    const steps = (plan as any).steps as Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }>;
    const confirmSpec = steps.map((s) => getConfirmSpecForPortalAgentAction(s.key)).find(Boolean) || null;

    if (confirmSpec) {
      const assistantText = await tryGenerateScheduledAssistantText({
        system: [
          "You are an assistant inside a SaaS portal.",
          "A scheduled run cannot proceed because the action requires manual confirmation.",
          "Write a short message (1-2 sentences) asking for confirmation in the portal chat.",
          "Rules:",
          "- Do not mention SMS, texting, phones, or any other channel.",
          "- Do not tell the user to reply here or open another thread.",
          "- No JSON.",
        ].join("\n"),
        payload: {
          workTitle: (plan as any)?.workTitle ?? null,
          requiresConfirmation: true,
        },
        maxLen: 600,
        profile: responseProfile,
      });

      if (assistantText) {
        await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: assistantText,
            attachmentsJson: null,
            createdByUserId: null,
            sendAt: null,
            sentAt: new Date(),
          },
          select: { id: true },
        });
      }
      const pendingScheduleResumeState = await maybeNotifyScheduledTaskNeedsInputBySms({
        ownerId,
        actorUserId,
        threadContext: effectiveThreadContext,
        scheduledMessageId: String(p.id),
        repeatEveryMinutes,
        recurrenceTimeZone: effectiveRecurrenceTimeZone,
        workTitle: (plan as any)?.workTitle ?? confirmSpec?.title ?? null,
        question: assistantText || `Please reply YES if you want me to continue ${(plan as any)?.workTitle ?? "this scheduled task"}.`,
      });
      const prevCtx = effectiveThreadContext && typeof effectiveThreadContext === "object" && !Array.isArray(effectiveThreadContext) ? (effectiveThreadContext as any) : {};
      await (prisma as any).portalAiChatThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date(), contextJson: { ...prevCtx, pendingScheduleResume: pendingScheduleResumeState ?? null } },
      });
      processed += 1;
      continue;
    }

    const resolvedSteps: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }> = [];
    const contextPatches: Array<Record<string, unknown> | undefined> = [];
    const results: Array<{
      ok: boolean;
      status: number;
      action: PortalAgentActionKey;
      args: Record<string, unknown>;
      result: any;
      assistantText?: string | null;
      linkUrl?: string | null;
    }> = [];

    let localCtx: any = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? { ...(threadContext as any) } : {};

    for (const step of steps.slice(0, 6)) {
      const argsRaw = step.args && typeof step.args === "object" && !Array.isArray(step.args) ? (step.args as Record<string, unknown>) : {};

      const resolved = await resolvePlanArgs({
        ownerId,
        stepKey: step.key,
        args: argsRaw,
        userHint: resolverUserHint,
        url: undefined,
        threadContext: localCtx,
      });

      if (!resolved.ok) {
        const rawClarifyPrompt = String(resolved.clarifyQuestion || "").trim();
        const clarifyText = await tryGenerateScheduledAssistantText({
          system: [
            "You are an assistant in a SaaS portal.",
            "A scheduled task cannot run because one required detail is missing.",
            "Ask ONE concise clarifying question so the user can provide the missing detail.",
            "Rules:",
            "- 1-2 sentences.",
            "- Do not mention SMS, texting, phones, or any other channel.",
            "- Do not tell the user to reply here or elsewhere.",
            "- Do not ask for internal IDs unless the user must paste one.",
            "- No JSON.",
          ].join("\n"),
          payload: {
            workTitle: (plan as any)?.workTitle ?? null,
            step,
            rawClarifyPrompt: rawClarifyPrompt || null,
          },
          maxLen: 600,
          profile: responseProfile,
        });

        if (!clarifyText) {
          const nextCtx = { ...localCtx, pendingPlan: plan, pendingPlanClarify: null };
          await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date(), contextJson: nextCtx } });
          resolvedSteps.length = 0;
          results.length = 0;
          break;
        }

        await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: clarifyText.slice(0, 600),
            attachmentsJson: null,
            createdByUserId: null,
            sendAt: null,
            sentAt: new Date(),
          },
          select: { id: true },
        });

        const pendingScheduleResumeState = await maybeNotifyScheduledTaskNeedsInputBySms({
          ownerId,
          actorUserId,
          threadContext: localCtx,
          scheduledMessageId: String(p.id),
          repeatEveryMinutes,
          recurrenceTimeZone: effectiveRecurrenceTimeZone,
          workTitle: (plan as any)?.workTitle ?? step.title ?? null,
          question: clarifyText || rawClarifyPrompt || null,
        });

        const nextCtx = {
          ...localCtx,
          pendingPlan: plan,
          pendingPlanClarify: { at: now.toISOString(), stepKey: step.key, question: clarifyText || null, rawClarifyPrompt: rawClarifyPrompt || null },
          pendingScheduleResume: pendingScheduleResumeState ?? null,
        };
        await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date(), contextJson: nextCtx } });

        // Stop on the first unresolved step.
        resolvedSteps.length = 0;
        results.length = 0;
        break;
      }

      const resolvedArgs = resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args)
        ? (resolved.args as Record<string, unknown>)
        : {};

      resolvedSteps.push({ key: step.key, title: step.title, args: resolvedArgs, ...(step.openUrl ? { openUrl: step.openUrl } : {}) });
      contextPatches.push(resolved.contextPatch);

      if (resolved.contextPatch && typeof resolved.contextPatch === "object" && !Array.isArray(resolved.contextPatch)) {
        localCtx = { ...localCtx, ...(resolved.contextPatch as any) };
      }

      const exec = await executePortalAgentAction({ ownerId, actorUserId, action: step.key, args: resolvedArgs, responseProfile });
      results.push({
        ok: Boolean((exec as any).ok),
        status: Number((exec as any).status) || 0,
        action: step.key,
        args: resolvedArgs,
        result: (exec as any).result,
        assistantText: typeof (exec as any).assistantText === "string" ? String((exec as any).assistantText) : null,
        linkUrl: (exec as any).linkUrl ?? null,
      });

      const derivedPatch = deriveThreadContextPatchFromAction(step.key, resolvedArgs, (exec as any).result);
      if (derivedPatch && typeof derivedPatch === "object") {
        contextPatches.push(derivedPatch as any);
        localCtx = { ...localCtx, ...(derivedPatch as any) };
      }
    }

    if (resolvedSteps.length) {
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

      let assistantText = "";
      try {
        assistantText = String(
          await generateText({
            system: [
              "You are Pura, a ChatGPT-style assistant inside a SaaS portal.",
              "You just executed a scheduled task composed of one or more portal actions.",
              "Write a normal chat reply (not a report).",
              "Formatting rules:",
              "- 1-3 short paragraphs.",
              "- NO headings, NO bullet lists, NO tables.",
              "- Do NOT print raw JSON or field dumps.",
              "- Do NOT use labels like 'Action:', 'Status:', 'Result:'.",
              "Content rules:",
              "- Say what you did and the outcome in plain language.",
              "- If something failed, say what failed and the next step.",
              "- If you need more info, ask ONE specific question.",
              "- Never output bare relative paths like /portal/app/... . If you mention a URL, always use the full https://purelyautomation.com/... absolute URL.",
            ].join("\n"),
            user: `Scheduled run results (JSON):\n${JSON.stringify(
              {
                workTitle: (plan as any)?.workTitle ?? null,
                steps: resolvedSteps,
                results,
                canvasUrl,
              },
              null,
              2,
            )}`,
            profile: responseProfile,
          }),
        ).trim();
      } catch {
        assistantText = "";
      }

      assistantText = absolutizeAssistantTextLinks(assistantText);

      if (assistantText.trim()) {
        await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: assistantText.slice(0, 4000),
            attachmentsJson: null,
            createdByUserId: null,
            sendAt: null,
            sentAt: new Date(),
          },
          select: { id: true },
        });
      }

      const mergedPatch = Object.assign({}, ...contextPatches.filter(Boolean));
      const prevCtx = localCtx;
      const prevRuns =
        prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx) && Array.isArray((prevCtx as any).runs)
          ? ((prevCtx as any).runs as unknown[])
          : [];
      const runTrace = {
        at: now.toISOString(),
        workTitle: (plan as any)?.workTitle ?? null,
        steps: resolvedSteps.map((s, idx) => ({
          key: s.key,
          title: s.title,
          ok: Boolean(results[idx]?.ok),
          linkUrl: results[idx]?.linkUrl ?? null,
        })),
        canvasUrl,
        scheduledMessageId: String(p.id),
      };
      const runs = [...prevRuns.slice(-19), runTrace];

      const nextCtx = prevCtx && typeof prevCtx === "object" && !Array.isArray(prevCtx)
        ? { ...(prevCtx as any), ...mergedPatch, lastWorkTitle: (plan as any)?.workTitle ?? null, lastCanvasUrl: canvasUrl, pendingPlan: null, pendingPlanClarify: null, pendingScheduleResume: null, runs }
        : { ...mergedPatch, lastWorkTitle: (plan as any)?.workTitle ?? null, lastCanvasUrl: canvasUrl, pendingPlan: null, pendingPlanClarify: null, pendingScheduleResume: null, runs };

      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date(), contextJson: nextCtx } });
      await persistPortalAiChatRun({
        ownerId,
        threadId,
        runTrace,
        triggerKind: "scheduled",
        status: results.some((result) => !Boolean(result?.ok)) ? (results.some((result) => Boolean(result?.ok)) ? "partial" : "failed") : "completed",
        summaryText: assistantText || null,
        completedAt: new Date(),
      });
    }

      // If this was a repeating scheduled message, enqueue the next run.
      await enqueueNextRecurringScheduledMessage({
        ownerId,
        threadId,
        text: String((p as any).text || ""),
        attachmentsJson: normalizedAttachmentsJson,
        createdByUserId: (p as any).createdByUserId ?? null,
        scheduledAt,
        repeatEveryMinutes,
        recurrenceTimeZone: effectiveRecurrenceTimeZone,
      });

      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      const assistantText = await tryGenerateScheduledAssistantText({
        system: [
          "You are an assistant inside a SaaS portal.",
          "A scheduled task attempted to run but failed.",
          "Write a short message (1-2 sentences) letting the user know it failed.",
          "Rules:",
          "- Say the exact failure reason in plain language when it is available.",
          "- If the failure looks temporary (timeout, rate limit, provider outage, network issue), say that clearly and tell them retrying later may help.",
          "- If the failure is due to something unsupported or not configured, say retrying later will not fix it until that limitation is addressed.",
          "- Do not include stack traces.",
          "- No JSON.",
        ].join("\n"),
        payload: {
          workTitle: null,
          scheduledMessageText: String((p as any).text || "").trim().slice(0, 800),
          errorMessage: String(message || "Unknown error").slice(0, 600),
          repeatEveryMinutes,
        },
        maxLen: 800,
      });

      if (assistantText) {
        await (prisma as any).portalAiChatMessage.create({
          data: {
            ownerId,
            threadId,
            role: "assistant",
            text: assistantText,
            attachmentsJson: null,
            createdByUserId: null,
            sendAt: null,
            sentAt: new Date(),
          },
          select: { id: true },
        }).catch(() => null);
      }

      await (prisma as any).portalAiChatThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date() },
      }).catch(() => null);

      await enqueueNextRecurringScheduledMessage({
        ownerId,
        threadId,
        text: String((p as any).text || ""),
        attachmentsJson: normalizedAttachmentsJson,
        createdByUserId: (p as any).createdByUserId ?? null,
        scheduledAt,
        repeatEveryMinutes,
        recurrenceTimeZone: effectiveRecurrenceTimeZone,
      }).catch(() => null);
    }
  }

    return { ok: true as const, processed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false as const, error: msg };
  }
}
