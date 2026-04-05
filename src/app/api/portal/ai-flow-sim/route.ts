import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { generateText } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { type PortalAgentActionKey } from "@/lib/portalAgentActions";
import {
  deriveThreadContextPatchFromAction,
  executePortalAgentAction,
} from "@/lib/portalAgentActionExecutor";
import {
  getConfirmSpecForPortalAgentAction,
  portalCanvasUrlForAction,
} from "@/lib/portalAgentActionMeta";
import { resolvePlanArgs } from "@/lib/puraResolver";

import {
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  getInteractiveConfirmSpecForPortalAgentAction,
  isImperativeRequest,
  listAvailablePortalActionKeys,
  looksLikeNonActionDeflection,
  looksLikePortalHowToInstructions,
  looksLikeProceedLoopMessage,
  parseChatWrapperDecision,
  stripEmptyAssistantBullets,
  toolCheatSheetForPrompt,
} from "@/lib/portalAiChatPlannerShared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SimRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    url: z.string().trim().max(2000).optional().nullable(),
    threadId: z.string().trim().min(1).max(200).optional().nullable(),
    execute: z.boolean().optional().default(false),
    maxRounds: z.number().int().min(1).max(4).optional().default(4),
    threadContext: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .strict();

type RecentMessage = { role: "user" | "assistant"; text: string };

export async function POST(req: Request) {
  const auth = await requireClientSession(req, {
    apiKeyPermission: "pura.chat",
  });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const actorUserId = (auth.session.user as any).memberId || ownerId;

  const body = await req.json().catch(() => null);
  const parsed = SimRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const now = new Date();
  const userText = parsed.data.text;
  const requestedUrl = parsed.data.url ? String(parsed.data.url) : "";
  const requestedThreadId = parsed.data.threadId
    ? String(parsed.data.threadId).trim()
    : "";
  const execute = Boolean(parsed.data.execute);
  const maxRounds = parsed.data.maxRounds;

  const overrideCtx: Record<string, unknown> =
    parsed.data.threadContext &&
    typeof parsed.data.threadContext === "object" &&
    !Array.isArray(parsed.data.threadContext)
      ? { ...(parsed.data.threadContext as any) }
      : {};

  const availableActionKeys = listAvailablePortalActionKeys();

  let loadedThreadContext: Record<string, unknown> = {};
  let recentMessages: RecentMessage[] = [];
  let contextUrl = requestedUrl;

  if (requestedThreadId) {
    const thread = await (prisma as any).portalAiChatThread.findFirst({
      where: { id: requestedThreadId, ownerId },
      select: {
        id: true,
        ownerId: true,
        createdByUserId: true,
        contextJson: true,
      },
    });

    if (!thread || !canAccessPortalAiChatThread({ thread, memberId: actorUserId })) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    loadedThreadContext =
      thread.contextJson &&
      typeof thread.contextJson === "object" &&
      !Array.isArray(thread.contextJson)
        ? { ...(thread.contextJson as any) }
        : {};

    const rows = await (prisma as any).portalAiChatMessage.findMany({
      where: { ownerId, threadId: requestedThreadId },
      orderBy: { createdAt: "asc" },
      take: 400,
      select: { role: true, text: true },
    });

    recentMessages = (rows || [])
      .map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        text: String(m.text || "").slice(0, 2000),
      }))
      .filter((m: any) => Boolean(String(m.text || "").trim()));

    if (!contextUrl) {
      const lastCanvasUrl =
        typeof (loadedThreadContext as any).lastCanvasUrl === "string"
          ? String((loadedThreadContext as any).lastCanvasUrl).trim()
          : "";
      if (lastCanvasUrl) contextUrl = lastCanvasUrl;
    }
  }

  let threadContext: Record<string, unknown> = {
    ...loadedThreadContext,
    ...overrideCtx,
  };

  const rounds: any[] = [];
  const allSteps: Array<{
    key: PortalAgentActionKey;
    title: string;
    args: Record<string, unknown>;
  }> = [];
  const allResults: any[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const cheatSheet = toolCheatSheetForPrompt(userText, contextUrl);
    const system = buildPlannerSystemPrompt({
      cheatSheet,
      extraSystem:
        round > 0
          ? "Continuation: keep going until the user request is DONE. Output the next actions now; do not ask for permission."
          : undefined,
    });

    const threadSummaryForPrompt =
      typeof (threadContext as any).threadSummary === "string"
        ? String((threadContext as any).threadSummary || "")
            .trim()
            .slice(0, 1200)
        : "";

    const lastRunSummary = allSteps.length
      ? {
          executedSteps: allSteps
            .slice(-12)
            .map((s) => ({ key: s.key, title: s.title })),
          lastResults: allResults
            .slice(-12)
            .map((r: any) => ({
              action: r.action,
              ok: r.ok,
              status: r.status,
              error: r.error || null,
            }))
            .slice(0, 12),
        }
      : null;

    const user = buildPlannerUserPrompt({
      contextUrl,
      threadSummary: threadSummaryForPrompt || null,
      lastRunSummary,
      recentMessages,
      userRequest: userText,
    });

    const modelText = String(
      await generateText({ system, user, temperature: 0.6 }),
    ).trim();

    let decision: any = parseChatWrapperDecision(modelText);
    let actions: Array<{
      key: PortalAgentActionKey;
      title?: string;
      args?: Record<string, unknown>;
    }> = Array.isArray(decision?.actions) ? decision.actions : [];

    const roundRecord: any = {
      round,
      at: now.toISOString(),
      sentToModel: { system, user, toolCheatSheet: cheatSheet },
      modelReturned: { rawText: modelText, parsedDecision: decision },
      resolved: [],
      executed: [],
    };

    if (!actions.length) {
      const assistantText = stripEmptyAssistantBullets(
        String(decision?.message || modelText || ""),
      );
      const shouldRetry = isImperativeRequest(userText) && round + 1 < maxRounds;

      if (shouldRetry && looksLikeProceedLoopMessage(assistantText)) {
        const system2 = buildPlannerSystemPrompt({
          cheatSheet,
          extraSystem:
            "The user already said to do it. Do not ask 'Would you like to proceed?' Output actions only, immediately.",
        });
        const modelText2 = String(
          await generateText({ system: system2, user, temperature: 0.3 }),
        ).trim();
        const decision2 = parseChatWrapperDecision(modelText2);
        const actions2 = Array.isArray((decision2 as any)?.actions)
          ? (decision2 as any).actions
          : [];
        roundRecord.sentToModelRetry = {
          system: system2,
          user,
          toolCheatSheet: cheatSheet,
        };
        roundRecord.modelReturnedRetry = {
          rawText: modelText2,
          parsedDecision: decision2,
        };
        if (actions2.length) {
          decision = decision2;
          roundRecord.modelReturned = {
            rawText: modelText2,
            parsedDecision: decision2,
            retryUsed: "proceed-loop",
          };
          actions = actions2;
        }
      }

      if (shouldRetry && !actions.length && looksLikePortalHowToInstructions(assistantText)) {
        const system2 = buildPlannerSystemPrompt({
          cheatSheet,
          extraSystem:
            "The user wants you to do the work in the portal. Do NOT provide how-to steps or instructions. Output JSON actions only.",
        });
        const modelText2 = String(
          await generateText({ system: system2, user, temperature: 0.25 }),
        ).trim();
        const decision2 = parseChatWrapperDecision(modelText2);
        const actions2 = Array.isArray((decision2 as any)?.actions)
          ? (decision2 as any).actions
          : [];
        roundRecord.sentToModelRetry2 = {
          system: system2,
          user,
          toolCheatSheet: cheatSheet,
        };
        roundRecord.modelReturnedRetry2 = {
          rawText: modelText2,
          parsedDecision: decision2,
        };
        if (actions2.length) {
          decision = decision2;
          roundRecord.modelReturned = {
            rawText: modelText2,
            parsedDecision: decision2,
            retryUsed: "how-to",
          };
          actions = actions2;
        }
      }

      if (shouldRetry && !actions.length && looksLikeNonActionDeflection(assistantText)) {
        const system2 = buildPlannerSystemPrompt({
          cheatSheet,
          extraSystem:
            "Stop deflecting. The user asked you to do it. Output JSON actions only. If unsure what to do next, start with a read-only discovery step (funnel_builder.pages.list or funnel_builder.funnels.list).",
        });
        const modelText2 = String(
          await generateText({ system: system2, user, temperature: 0.25 }),
        ).trim();
        const decision2 = parseChatWrapperDecision(modelText2);
        const actions2 = Array.isArray((decision2 as any)?.actions)
          ? (decision2 as any).actions
          : [];
        roundRecord.sentToModelRetry3 = {
          system: system2,
          user,
          toolCheatSheet: cheatSheet,
        };
        roundRecord.modelReturnedRetry3 = {
          rawText: modelText2,
          parsedDecision: decision2,
        };
        if (actions2.length) {
          decision = decision2;
          roundRecord.modelReturned = {
            rawText: modelText2,
            parsedDecision: decision2,
            retryUsed: "deflection",
          };
          actions = actions2;
        }
      }

      if (!actions.length && isImperativeRequest(userText)) {
        const hasLastFunnelId = Boolean(
          (threadContext as any)?.lastFunnel &&
            typeof (threadContext as any).lastFunnel?.id === "string" &&
            String((threadContext as any).lastFunnel.id).trim(),
        );

        actions = hasLastFunnelId
          ? ([
              {
                key: "funnel_builder.pages.list",
                title: "Find the funnel pages",
                args: {
                  funnelId: String((threadContext as any).lastFunnel.id)
                    .trim()
                    .slice(0, 120),
                },
              },
            ] as any)
          : ([
              {
                key: "funnel_builder.funnels.list",
                title: "Find the funnel",
                args: {},
              },
            ] as any);

        roundRecord.fallback = "imperative-no-actions";
      }
    }

    if (!actions.length) {
      rounds.push(roundRecord);
      break;
    }

    const confirmSpec =
      actions
        .map(
          (a) =>
            getInteractiveConfirmSpecForPortalAgentAction(a.key) ||
            getConfirmSpecForPortalAgentAction(a.key),
        )
        .find(Boolean) || null;

    if (confirmSpec) {
      roundRecord.needsConfirm = confirmSpec;
      rounds.push(roundRecord);
      break;
    }

    for (const a of actions.slice(0, 6)) {
      const key = a.key;
      const title = String(a.title || a.key).trim().slice(0, 160) || String(a.key);
      const argsRaw =
        a.args && typeof a.args === "object" && !Array.isArray(a.args)
          ? (a.args as Record<string, unknown>)
          : {};

      const resolved = await resolvePlanArgs({
        ownerId,
        stepKey: key,
        args: argsRaw,
        userHint: userText,
        url: contextUrl,
        threadContext,
      });

      if (!resolved.ok) {
        roundRecord.clarify = {
          question: resolved.clarifyQuestion || null,
          choices: (resolved as any).choices || null,
        };
        rounds.push(roundRecord);

        return NextResponse.json(
          {
            ok: true,
            request: {
              text: userText,
              url: contextUrl || null,
              threadId: requestedThreadId || null,
              execute,
              maxRounds,
              threadContext,
            },
            tools: { availableActionKeys },
            rounds,
            allSteps,
            allResults,
            finalContext: threadContext,
          },
          { status: 200 },
        );
      }

      const args =
        resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args)
          ? (resolved.args as Record<string, unknown>)
          : {};

      roundRecord.resolved.push({
        key,
        title,
        argsRaw,
        args,
        contextPatch: resolved.contextPatch || null,
      });
      allSteps.push({ key, title, args });

      if (
        resolved.contextPatch &&
        typeof resolved.contextPatch === "object" &&
        !Array.isArray(resolved.contextPatch)
      ) {
        threadContext = { ...threadContext, ...(resolved.contextPatch as any) };
      }

      if (execute) {
        const exec = await executePortalAgentAction({
          ownerId,
          actorUserId,
          action: key,
          args,
        });

        const derivedPatch = deriveThreadContextPatchFromAction(
          key,
          args,
          (exec as any).result,
        );
        if (
          derivedPatch &&
          typeof derivedPatch === "object" &&
          !Array.isArray(derivedPatch)
        ) {
          threadContext = { ...threadContext, ...(derivedPatch as any) };
        }

        const mappedCanvasUrl = portalCanvasUrlForAction(key, args);
        const record = {
          action: key,
          key,
          ok: Boolean((exec as any).ok),
          status: Number((exec as any).status) || 0,
          error: (exec as any).error || null,
          linkUrl: (exec as any).linkUrl || mappedCanvasUrl || null,
          result: (exec as any).result || null,
          contextAfter: threadContext,
        };
        roundRecord.executed.push(record);
        allResults.push(record);
      }
    }

    rounds.push(roundRecord);
  }

  return NextResponse.json(
    {
      ok: true,
      request: {
        text: userText,
        url: contextUrl || null,
        threadId: requestedThreadId || null,
        execute,
        maxRounds,
        threadContext,
      },
      tools: {
        // Explicitly surfaced so it's obvious what "tools" means.
        availableActionKeys,
      },
      rounds,
      allSteps,
      allResults,
      finalContext: threadContext,
    },
    { status: 200 },
  );
}
