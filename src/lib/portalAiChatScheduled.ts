import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { getConfirmSpecForPortalAgentAction, portalCanvasUrlForAction } from "@/lib/portalAgentActionMeta";
import { deriveThreadContextPatchFromAction, executePortalAgentAction } from "@/lib/portalAgentActionExecutor";
import type { PortalAgentActionKey } from "@/lib/portalAgentActions";
import { PortalAgentActionKeySchema, extractJsonObject } from "@/lib/portalAgentActions";
import { planPuraActions } from "@/lib/puraPlanner";
import { resolvePlanArgs } from "@/lib/puraResolver";
import { isPortalSupportChatConfigured } from "@/lib/portalSupportChat";

const SCHEDULED_ACTION_PREFIX = "__PURA_SCHEDULED_ACTION__";

type ScheduledActionEnvelope = {
  workTitle?: string | null;
  steps: Array<{ key: PortalAgentActionKey; title?: string | null; args?: Record<string, unknown> | null }>;
};

function tryParseScheduledActionEnvelope(textRaw: string): ScheduledActionEnvelope | null {
  const t = String(textRaw || "").trim();
  if (!t.startsWith(SCHEDULED_ACTION_PREFIX)) return null;

  const jsonText = t.slice(SCHEDULED_ACTION_PREFIX.length).trim();
  const extracted = extractJsonObject(jsonText);
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return null;

  const workTitle =
    typeof (extracted as any).workTitle === "string" && String((extracted as any).workTitle).trim()
      ? String((extracted as any).workTitle).trim().slice(0, 200)
      : null;

  const stepsRaw = Array.isArray((extracted as any).steps) ? ((extracted as any).steps as unknown[]) : [];
  if (!stepsRaw.length) return null;

  const steps: ScheduledActionEnvelope["steps"] = [];
  for (const s of stepsRaw.slice(0, 6)) {
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const keyRaw = (s as any).key;
    const parsedKey = PortalAgentActionKeySchema.safeParse(keyRaw);
    if (!parsedKey.success) continue;
    const args = (s as any).args;
    const argsObj = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
    const title = typeof (s as any).title === "string" && String((s as any).title).trim() ? String((s as any).title).trim().slice(0, 120) : null;
    steps.push({ key: parsedKey.data, title, args: argsObj });
  }

  if (!steps.length) return null;
  return { workTitle, steps };
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

  for (const p of pending) {
    const ownerId = String(p.ownerId);
    const threadId = String(p.threadId);
    const actorUserId = String((p as any).createdByUserId || ownerId);
    const repeatEveryMinutes =
      typeof (p as any).repeatEveryMinutes === "number" && Number.isFinite((p as any).repeatEveryMinutes)
        ? Math.max(0, Math.floor((p as any).repeatEveryMinutes))
        : 0;
    const scheduledAt = (p as any).sendAt ? new Date((p as any).sendAt) : null;

    // Mark as sent first to avoid double-processing.
    await (prisma as any).portalAiChatMessage.update({
      where: { id: p.id },
      data: { sentAt: new Date() },
    });

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
        userHint: text,
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
        if (resolvedSteps.length === 1) {
          return String(results[0]?.markdown || (results[0]?.ok ? "Done." : "Action failed.")).trim() || "Done.";
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
