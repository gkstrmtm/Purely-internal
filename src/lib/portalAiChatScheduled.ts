import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { getConfirmSpecForPortalAgentAction, portalCanvasUrlForAction } from "@/lib/portalAgentActionMeta";
import { deriveThreadContextPatchFromAction, executePortalAgentAction } from "@/lib/portalAgentActionExecutor";
import type { PortalAgentActionKey } from "@/lib/portalAgentActions";
import { tryParseScheduledActionEnvelope } from "@/lib/portalAiChatScheduledActionEnvelope";
import { planPuraActions } from "@/lib/puraPlanner";
import { resolvePlanArgs } from "@/lib/puraResolver";
import { isPortalSupportChatConfigured } from "@/lib/portalSupportChat";

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

  for (const p of pending) {
    const ownerId = String(p.ownerId);
    const threadId = String(p.threadId);
    const actorUserId = String((p as any).createdByUserId || ownerId);
    const repeatEveryMinutes =
      typeof (p as any).repeatEveryMinutes === "number" && Number.isFinite((p as any).repeatEveryMinutes)
        ? Math.max(0, Math.floor((p as any).repeatEveryMinutes))
        : 0;
    const scheduledAt = (p as any).sendAt ? new Date((p as any).sendAt) : null;

    // Atomically claim the row first to avoid double-processing under overlapping cron runs.
    const claimedAt = new Date();
    const claim = await (prisma as any).portalAiChatMessage.updateMany({
      where: { id: p.id, sentAt: null },
      data: { sentAt: claimedAt },
    });
    if (!claim?.count) continue;

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
    const text = String((p as any).text || "").trim().slice(0, 4000);

    const envelope = tryParseScheduledActionEnvelope(text);

    let ownerTimeZone = ownerTimeZoneCache.get(ownerId) || "";
    if (!ownerTimeZone) {
      const tz =
        (await prisma.user.findUnique({ where: { id: ownerId }, select: { timeZone: true } }).catch(() => null))?.timeZone ||
        "";
      ownerTimeZone = tz ? String(tz).slice(0, 80) : "";
      if (ownerTimeZone) ownerTimeZoneCache.set(ownerId, ownerTimeZone);
    }

    const effectiveThreadContext = (() => {
      if (!ownerTimeZone) return threadContext;
      const prevCtx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext) ? (threadContext as any) : {};
      if (String(prevCtx.ownerTimeZone || "") === ownerTimeZone) return threadContext;
      return { ...prevCtx, ownerTimeZone };
    })();

    const plan = envelope
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
        })();

    const resolverUserHint = envelope
      ? String(envelope.workTitle || "").trim().slice(0, 200)
      : text;

    const shouldExecute = plan?.mode === "execute" && Array.isArray((plan as any).steps) && (plan as any).steps.length;

    if (!shouldExecute) {
      await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "assistant",
          text: envelope
            ? "Scheduled run processed (invalid scheduled action payload)."
            : !isPortalSupportChatConfigured()
              ? "Scheduled run skipped (Pura is not configured in this environment)."
              : "Scheduled run processed (no actions to execute).",
          attachmentsJson: null,
          createdByUserId: null,
          sendAt: null,
          sentAt: new Date(),
        },
        select: { id: true },
      });

      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
      processed += 1;
      continue;
    }

    const steps = (plan as any).steps as Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }>;
    const confirmSpec = steps.map((s) => getConfirmSpecForPortalAgentAction(s.key)).find(Boolean) || null;

    if (confirmSpec) {
      await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "assistant",
          text: "This scheduled run requires confirmation. Open this chat thread to review and confirm.",
          attachmentsJson: null,
          createdByUserId: null,
          sendAt: null,
          sentAt: new Date(),
        },
        select: { id: true },
      });
      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
      processed += 1;
      continue;
    }

    const resolvedSteps: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown>; openUrl?: string }> = [];
    const contextPatches: Array<Record<string, unknown> | undefined> = [];
    const results: Array<{ ok: boolean; markdown?: string; linkUrl?: string | null }> = [];

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
        const clarifyText = String(resolved.clarifyQuestion || "").trim() || "Scheduled run needs one more detail to continue.";

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

        const nextCtx = { ...localCtx, pendingPlan: plan, pendingPlanClarify: { at: now.toISOString(), stepKey: step.key, question: clarifyText } };
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

      const exec = await executePortalAgentAction({ ownerId, actorUserId, action: step.key, args: resolvedArgs });
      results.push({ ok: Boolean((exec as any).ok), markdown: (exec as any).markdown, linkUrl: (exec as any).linkUrl ?? null });

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

      const assistantText = (() => {
        const workTitle = String((plan as any)?.workTitle || "Scheduled task").trim() || "Scheduled task";
        if (resolvedSteps.length === 1) {
          const detail = String(results[0]?.markdown || (results[0]?.ok ? "Done." : "Action failed.")).trim() || "Done.";
          const lead = results[0]?.ok
            ? `I finished your scheduled task${workTitle ? `: ${workTitle}` : ""}.`
            : `I tried to run your scheduled task${workTitle ? `: ${workTitle}` : ""}, but it failed.`;
          return `${lead}\n\n${detail}`;
        }
        const allOk = results.every((r) => r.ok);
        const anyOk = results.some((r) => r.ok);
        const blocks = resolvedSteps.map((s, idx) => {
          const md = String(results[idx]?.markdown || (results[idx]?.ok ? "Done." : "Action failed.")).trim();
          return `#### ${s.title}\n${md}`;
        });
        const summary = allOk
          ? `I finished your scheduled task${workTitle ? `: ${workTitle}` : ""}.`
          : anyOk
            ? `I finished part of your scheduled task${workTitle ? `: ${workTitle}` : ""}, but some actions failed.`
            : `I tried to run your scheduled task${workTitle ? `: ${workTitle}` : ""}, but it failed.`;
        return `${summary}\n\n${blocks.join("\n\n")}`;
      })();

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
        ? { ...(prevCtx as any), ...mergedPatch, lastWorkTitle: (plan as any)?.workTitle ?? null, lastCanvasUrl: canvasUrl, pendingPlan: null, pendingPlanClarify: null, runs }
        : { ...mergedPatch, lastWorkTitle: (plan as any)?.workTitle ?? null, lastCanvasUrl: canvasUrl, pendingPlan: null, pendingPlanClarify: null, runs };

      await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date(), contextJson: nextCtx } });
    }

    // If this was a repeating scheduled message, enqueue the next run.
    if (repeatEveryMinutes > 0) {
      const base = scheduledAt && Number.isFinite(scheduledAt.getTime()) ? scheduledAt : now;
      const nextAt = new Date(base.getTime() + repeatEveryMinutes * 60_000);
      await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "user",
          text: String((p as any).text || "").slice(0, 4000),
          attachmentsJson: (p as any).attachmentsJson ?? null,
          createdByUserId: (p as any).createdByUserId ?? null,
          sendAt: nextAt,
          sentAt: null,
          repeatEveryMinutes,
        },
        select: { id: true },
      });
    }

    processed += 1;
  }

    return { ok: true as const, processed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false as const, error: msg };
  }
}
