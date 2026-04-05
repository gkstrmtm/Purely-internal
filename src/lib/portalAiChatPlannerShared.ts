import { z } from "zod";

import {
  PortalAgentActionKeySchema,
  extractJsonObject,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";

export const ChatWrapperActionSchema = z
  .object({
    key: PortalAgentActionKeySchema,
    title: z.string().trim().max(160).optional(),
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const ChatWrapperDecisionSchema = z
  .object({
    actions: z.array(ChatWrapperActionSchema).max(6).optional(),
    message: z.string().trim().max(12_000).optional(),
  })
  .strict();

export type ChatWrapperDecision = z.infer<typeof ChatWrapperDecisionSchema>;
export type ChatWrapperAction = z.infer<typeof ChatWrapperActionSchema>;

export function parseChatWrapperDecision(modelTextRaw: unknown): ChatWrapperDecision | null {
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

export function toolCheatSheetForPrompt(textRaw: string, urlRaw?: string): string {
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
  const isTasks = /\b(task|todo|to-do|to do|assign)\b/.test(t);

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
    lines.push("- funnel_builder.forms.list / funnel_builder.forms.get / funnel_builder.forms.update");
    lines.push("- funnel_builder.domains.list / funnel_builder.domains.create / funnel_builder.domains.verify");
    lines.push(
      "Tool selection rule: If the user is working on a funnel/page/website, prefer funnel_builder.* actions. Do NOT use booking.* unless the user explicitly asked about booking settings/calendars.",
    );
    lines.push(
      "If the user asks to build a funnel and pages are missing, you should (1) list funnels/pages, then (2) create missing pages, then (3) update page content.",
    );
  }
  if (!isFunnelBuilder && isBooking) {
    lines.push("- booking.settings.get / booking.settings.update");
    lines.push("- booking.calendars.get / booking.calendars.update");
    lines.push("- booking.form.get / booking.form.update");
    lines.push("- booking.availability.set_daily");
    lines.push("- booking.bookings.list / booking.cancel / booking.reschedule / booking.contact");
  }
  if (!isFunnelBuilder && isInbox) {
    lines.push("- inbox.threads.list / inbox.thread.get / inbox.send / inbox.send_sms / inbox.send_email");
  }
  if (!isFunnelBuilder && isTasks) {
    lines.push("- tasks.list / tasks.create / tasks.update");
  }
  if (!isFunnelBuilder && !isBooking && !isInbox && !isTasks) {
    lines.push("- tasks.list / tasks.create / tasks.update");
    lines.push("- contacts.search / contacts.get / contacts.update");
    lines.push("- booking.settings.get / booking.calendars.get / booking.form.get");
  }

  return lines.join("\n").slice(0, 1600);
}

export function getInteractiveConfirmSpecForPortalAgentAction(actionRaw: unknown): { title: string; message: string } | null {
  const action = String(actionRaw || "").trim();
  if (!action) return null;

  // In the interactive chat UI, always confirm before sending real outbound messages.
  // (Scheduled runs should not use this helper.)
  if (action === "inbox.send" || action === "inbox.send_sms" || action === "inbox.send_email") {
    return {
      title: "Confirm",
      message: "This will send a real message to a contact. Continue?",
    };
  }

  return null;
}

export function stripEmptyAssistantBullets(raw: string): string {
  const lines = String(raw || "").split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const t = line.trimEnd();
    const bullet = /^\s*([-*])\s+/.exec(t);
    if (!bullet) {
      kept.push(line);
      continue;
    }

    const content = t.replace(/^\s*[-*]\s+/, "").trim();
    if (!content) continue;

    // Drop lines like "- Details:" or "- **Details:**" (no value).
    const normalized = content
      .replace(/^\*\*(.+?)\*\*\s*:?\s*$/g, "$1")
      .trim();
    if (/^(details|detail|error\s*details)\s*:\s*$/i.test(content)) continue;
    if (/^(details|detail|error\s*details)\s*:?\s*$/i.test(normalized)) continue;

    kept.push(line);
  }

  // Clean up excessive blank lines.
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksLikeProceedLoopMessage(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(would\s+you\s+like\s+to\s+proceed|should\s+i\s+proceed|do\s+you\s+want\s+me\s+to\s+proceed|do\s+you\s+want\s+me\s+to\s+continue|want\s+me\s+to\s+continue|would\s+you\s+like\s+me\s+to\s+continue|would\s+you\s+like\s+me\s+to\s+do\s+that)\b/.test(
      t,
    ) ||
    /\b(confirm\s+if\s+you'?d\s+like\s+me\s+to\s+(try\s+again|retry|continue)|could\s+you\s+please\s+confirm|do\s+you\s+want\s+me\s+to\s+(try\s+again|retry)|would\s+you\s+like\s+me\s+to\s+(try\s+again|retry)|should\s+i\s+(try\s+again|retry))\b/.test(
      t,
    ) ||
    (t.includes("next step") && /\b(proceed|continue)\b/.test(t))
  );
}

export function looksLikePortalHowToInstructions(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  const hasHowToPhrases =
    /\b(follow\s+these\s+steps|here\s*(are|'re)\s+the\s+steps|to\s+create\s+.*follow\s+these\s+steps|step\s*\d+|open\s+the\s+.*builder|click\s+on|select\s+.*from\s+the\s+options|drag\s+and\s+drop|save\s+and\s+preview)\b/i.test(
      t,
    );
  const numberedLines = (t.match(/^\s*\d+\./gm) || []).length;
  const bulletLines = (t.match(/^\s*[-*]\s+/gm) || []).length;
  const clickMentions = (lower.match(/\bclick\b/g) || []).length;
  const lengthLooksLikeGuide = t.length > 140 && (numberedLines + bulletLines >= 2 || clickMentions >= 2);
  return Boolean(hasHowToPhrases && lengthLooksLikeGuide);
}

export function looksLikeNonActionDeflection(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  // Common patterns when the model refuses to take action even though tools exist.
  return (
    /\b(let\s+me\s+know|tell\s+me\s+what\s+you'?d\s+like|what\s+would\s+you\s+like\s+me\s+to\s+do\s+next|if\s+you\s+need\s+help\s+with|please\s+let\s+me\s+know\s+what\s+changes|please\s+provide\s+more\s+details)\b/.test(
      t,
    ) || /\b(i\s+can\s+help\s+with|i\s+can\s+do\s+that\s+for\s+you)\b/.test(t)
  );
}

export function isImperativeRequest(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  const hasDo = /\b(go\s+ahead|do\s+it|do\s+that|make\s+it|build\s+it|create|generate|set\s+up|fix|handle\s+it|just\s+do)\b/.test(t);
  const looksLikeQuestionOnly = /\?\s*$/.test(t) && !/\b(go\s+ahead|please|do\s+it)\b/.test(t);
  return hasDo && !looksLikeQuestionOnly;
}

export function buildPlannerSystemPrompt(opts: { cheatSheet: string; extraSystem?: string | undefined | null }): string {
  return [
    "You are Pura, a ChatGPT-style assistant inside a SaaS portal.",
    "You have access to portal actions (tools).",
    'If you need to run actions, output JSON ONLY in the shape {"actions":[{"key":string,"args":object,"title":string}] }.',
    "If you do NOT need to run actions, output a normal assistant reply (no JSON).",
    "If you need more information to proceed, ask ONE specific question.",
    "Never claim you completed changes in the portal unless the server actually ran an action.",
    "Do NOT tell the user to do portal steps themselves when you can run actions.",
    "If the user asked you to do something, do not ask 'Would you like to proceed?' - run the actions now.",
    "When replying normally, avoid report-style formatting (no headings/bullet dumps) unless the user explicitly asked for a list.",
    "Do not output both text and JSON in the same response.",
    "\nTooling notes:\n" + String(opts.cheatSheet || ""),
    opts.extraSystem ? `\n${String(opts.extraSystem)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export type PlannerRecentMessage = { role: "user" | "assistant"; text: string };

export function buildPlannerUserPrompt(opts: {
  contextUrl?: string | undefined | null;
  threadSummary?: string | undefined | null;
  lastRunSummary?: any;
  recentMessages: PlannerRecentMessage[];
  userRequest: string;
}): string {
  const contextUrl = String(opts.contextUrl || "").trim();
  const summary = String(opts.threadSummary || "").trim();

  return [
    contextUrl ? `Context URL: ${contextUrl.slice(0, 1200)}` : null,
    summary ? `Thread summary: ${summary.slice(0, 1200)}` : null,
    opts.lastRunSummary ? `Last run summary (JSON):\n${JSON.stringify(opts.lastRunSummary, null, 2).slice(0, 3500)}` : null,
    "Recent messages:",
    JSON.stringify((opts.recentMessages || []).slice(-28), null, 2).slice(0, 4000),
    "\nUser request:",
    String(opts.userRequest || "").slice(0, 8000),
  ]
    .filter(Boolean)
    .join("\n");
}

export function listAvailablePortalActionKeys(): PortalAgentActionKey[] {
  return (PortalAgentActionKeySchema.options as unknown as PortalAgentActionKey[]) || [];
}
