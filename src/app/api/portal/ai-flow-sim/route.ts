import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { generateText } from "@/lib/ai";
import {
  PortalAgentActionKeySchema,
  extractJsonObject,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import {
  deriveThreadContextPatchFromAction,
  executePortalAgentAction,
} from "@/lib/portalAgentActionExecutor";
import {
  getConfirmSpecForPortalAgentAction,
  portalCanvasUrlForAction,
} from "@/lib/portalAgentActionMeta";
import { resolvePlanArgs } from "@/lib/puraResolver";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SimRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    url: z.string().trim().max(2000).optional().nullable(),
    execute: z.boolean().optional().default(false),
    maxRounds: z.number().int().min(1).max(6).optional().default(3),
    threadContext: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .strict();

const ChatWrapperActionSchema = z
  .object({
    key: PortalAgentActionKeySchema,
    title: z.string().trim().max(160).optional(),
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const ChatWrapperDecisionSchema = z
  .object({
    actions: z.array(ChatWrapperActionSchema).max(6).optional(),
    message: z.string().trim().max(12_000).optional(),
  })
  .strict();

function parseChatWrapperDecision(modelTextRaw: unknown): z.infer<typeof ChatWrapperDecisionSchema> | null {
  const modelText = String(modelTextRaw || "").trim();
  if (!modelText) return null;

  const obj = extractJsonObject(modelText);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const parsed = ChatWrapperDecisionSchema.safeParse(obj);
  if (!parsed.success) return null;

  const actions = Array.isArray(parsed.data.actions) ? parsed.data.actions : [];
  const message = typeof parsed.data.message === "string" ? parsed.data.message.trim() : "";

  if (!actions.length && !message) return null;
  return {
    ...(actions.length ? { actions } : {}),
    ...(message ? { message } : {}),
  };
}

function toolCheatSheetForPrompt(textRaw: string, urlRaw?: string): string {
  const t = String(textRaw || "").toLowerCase();
  const u = String(urlRaw || "").toLowerCase();
  const isFunnelBuilder =
    /\b(funnel|funnels|landing page|landing|thank you|thank-you|opt[-\s]?in|upsell|downsell|checkout|page builder|website|site)\b/.test(t) ||
    u.includes("/funnels") ||
    u.includes("/funnel") ||
    u.includes("/website") ||
    u.includes("/sites") ||
    u.includes("/page") ||
    u.includes("/builder");
  const isBooking = /\b(book|booking|calendar|appointment|availability|schedule)\b/.test(t) || u.includes("/booking");
  const isInbox = /\b(inbox|sms|text|email|reply|message)\b/.test(t) || u.includes("/inbox");

  const lines: string[] = [];
  lines.push("When you need to run portal actions, respond with JSON ONLY:");
  if (isFunnelBuilder) {
    lines.push('{"actions":[{"key":"funnel_builder.pages.update","args":{},"title":"Update funnel page"}]}');
  } else if (isInbox) {
    lines.push('{"actions":[{"key":"inbox.threads.list","args":{},"title":"List inbox threads"}]}');
  } else if (isBooking) {
    lines.push('{"actions":[{"key":"booking.settings.get","args":{},"title":"Fetch booking settings"}]}');
  } else {
    lines.push('{"actions":[{"key":"tasks.list","args":{},"title":"List tasks"}]}');
  }
  lines.push("Otherwise, respond normally (no JSON).\n");

  lines.push("Common action keys:");
  if (isFunnelBuilder) {
    lines.push("- funnel_builder.funnels.list / funnel_builder.funnels.get / funnel_builder.funnels.update");
    lines.push("- funnel_builder.pages.list / funnel_builder.pages.create / funnel_builder.pages.update / funnel_builder.pages.delete");
    lines.push("- funnel_builder.pages.generate_html / funnel_builder.pages.export_custom_html");
    lines.push("Tool selection rule: If the user is working on a funnel/page/website, prefer funnel_builder.* actions.");
  }
  if (!isFunnelBuilder && isBooking) {
    lines.push("- booking.settings.get / booking.settings.update");
    lines.push("- booking.calendars.get / booking.calendars.update");
    lines.push("- booking.form.get / booking.form.update");
    lines.push("- booking.availability.set_daily");
  }
  if (!isFunnelBuilder && isInbox) {
    lines.push("- inbox.threads.list / inbox.thread.get / inbox.send_sms / inbox.send_email");
  }
  return lines.join("\n").slice(0, 1600);
}

function getInteractiveConfirmSpecForPortalAgentAction(actionRaw: unknown): { title: string; message: string } | null {
  const action = String(actionRaw || "").trim();
  if (!action) return null;

  // Match the interactive chat UI behavior: always confirm before sending real outbound messages.
  if (action === "inbox.send" || action === "inbox.send_sms" || action === "inbox.send_email") {
    return {
      title: "Confirm",
      message: "This will send a real message to a contact. Continue?",
    };
  }

  return null;
}

export async function POST(req: Request) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const actorUserId = (auth.session.user as any).memberId || ownerId;

  const body = await req.json().catch(() => null);
  const parsed = SimRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const now = new Date();
  const userText = parsed.data.text;
  const contextUrl = parsed.data.url ? String(parsed.data.url) : "";
  const execute = Boolean(parsed.data.execute);
  const maxRounds = parsed.data.maxRounds;

  let localCtx: Record<string, unknown> =
    parsed.data.threadContext && typeof parsed.data.threadContext === "object" && !Array.isArray(parsed.data.threadContext)
      ? { ...(parsed.data.threadContext as any) }
      : {};

  const rounds: any[] = [];
  const allSteps: Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown> }> = [];
  const allResults: any[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const cheat = toolCheatSheetForPrompt(userText, contextUrl);
    const system = [
      "You are Pura, a ChatGPT-style assistant inside a SaaS portal.",
      "You have access to portal actions (tools).",
      "If you need to run actions, output JSON ONLY in the shape {\"actions\":[{\"key\":string,\"args\":object,\"title\":string}] }.",
      "If you do NOT need to run actions, output a normal assistant reply (no JSON).",
      "If the user asked you to do something, do NOT give step-by-step portal instructions. Use actions.",
      "Do not ask 'Would you like to proceed?' for non-destructive actions.",
      "Do not output both text and JSON.",
      "\nTooling notes:\n" + cheat,
    ].join("\n");

    const user = [
      contextUrl ? `Context URL: ${contextUrl.slice(0, 1200)}` : null,
      `Thread context (JSON):\n${JSON.stringify(localCtx, null, 2).slice(0, 3500)}`,
      "\nUser request:",
      userText,
    ]
      .filter(Boolean)
      .join("\n");

    const modelText = String(await generateText({ system, user, temperature: 0.4 })).trim();
    const decision = parseChatWrapperDecision(modelText);
    const actions = Array.isArray(decision?.actions) ? decision!.actions! : [];

    const roundRecord: any = {
      round,
      at: now.toISOString(),
      aiCall: { system, user, cheat },
      model: { rawText: modelText, parsedDecision: decision },
      resolved: [],
      executed: [],
    };

    if (!actions.length) {
      rounds.push(roundRecord);
      break;
    }

    const confirmSpec =
      actions
        .map((a) => getInteractiveConfirmSpecForPortalAgentAction(a.key) || getConfirmSpecForPortalAgentAction(a.key))
        .find(Boolean) || null;

    if (confirmSpec) {
      roundRecord.needsConfirm = confirmSpec;
      rounds.push(roundRecord);
      break;
    }

    for (const a of actions.slice(0, 6)) {
      const key = a.key;
      const title = String(a.title || a.key).trim().slice(0, 160) || String(a.key);
      const argsRaw = a.args && typeof a.args === "object" && !Array.isArray(a.args) ? (a.args as Record<string, unknown>) : {};

      const resolved = await resolvePlanArgs({ ownerId, stepKey: key, args: argsRaw, userHint: userText, url: contextUrl, threadContext: localCtx });
      if (!resolved.ok) {
        roundRecord.clarify = {
          question: resolved.clarifyQuestion || null,
          choices: (resolved as any).choices || null,
        };
        rounds.push(roundRecord);
        return NextResponse.json({ ok: true, rounds, allSteps, allResults, finalContext: localCtx }, { status: 200 });
      }

      const args = resolved.args && typeof resolved.args === "object" && !Array.isArray(resolved.args) ? (resolved.args as Record<string, unknown>) : {};
      roundRecord.resolved.push({ key, title, argsRaw, args, contextPatch: resolved.contextPatch || null });
      allSteps.push({ key, title, args });

      if (resolved.contextPatch && typeof resolved.contextPatch === "object" && !Array.isArray(resolved.contextPatch)) {
        localCtx = { ...localCtx, ...(resolved.contextPatch as any) };
      }

      if (execute) {
        const exec = await executePortalAgentAction({ ownerId, actorUserId, action: key, args });
        const derivedPatch = deriveThreadContextPatchFromAction(key, args, (exec as any).result);
        if (derivedPatch && typeof derivedPatch === "object" && !Array.isArray(derivedPatch)) {
          localCtx = { ...localCtx, ...(derivedPatch as any) };
        }

        const mappedCanvasUrl = portalCanvasUrlForAction(key, args);
        roundRecord.executed.push({
          key,
          ok: Boolean((exec as any).ok),
          status: Number((exec as any).status) || 0,
          error: (exec as any).error || null,
          linkUrl: (exec as any).linkUrl || mappedCanvasUrl || null,
          result: (exec as any).result || null,
          contextAfter: localCtx,
        });
        allResults.push(roundRecord.executed[roundRecord.executed.length - 1]);
      }
    }

    rounds.push(roundRecord);
  }

  return NextResponse.json({ ok: true, rounds, allSteps, allResults, finalContext: localCtx }, { status: 200 });
}
