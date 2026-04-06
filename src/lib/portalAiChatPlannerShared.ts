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

  const allKeys = listAvailablePortalActionKeys();

  const groups = new Map<string, string[]>();
  for (const key of allKeys) {
    const ns = String(key).split(".")[0] || "other";
    const arr = groups.get(ns) || [];
    arr.push(String(key));
    groups.set(ns, arr);
  }

  const sortedNamespaces = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  for (const ns of sortedNamespaces) {
    (groups.get(ns) || []).sort((a, b) => a.localeCompare(b));
  }

  function wrapLine(prefix: string, items: string[], maxWidth: number): string[] {
    const out: string[] = [];
    let line = prefix;
    for (const item of items) {
      const next = line === prefix ? `${line}${item}` : `${line} | ${item}`;
      if (next.length > maxWidth && line !== prefix) {
        out.push(line);
        line = `${" ".repeat(prefix.length)}${item}`;
        continue;
      }
      line = next;
    }
    if (line.trim()) out.push(line);
    return out;
  }

  const lines: string[] = [];

  lines.push("TOOL-USE OUTPUT FORMAT (choose exactly one):");
  lines.push("A) To run portal tools, output JSON only:");
  lines.push('{"actions":[{"key":"<action_key>","title":"<short title>","args":{}}]}');
  lines.push("B) To respond normally (no tools), output a normal assistant message (no JSON).");
  lines.push("");

  lines.push("PROGRESS RULE (very important):");
  lines.push("- When the user tells you to DO something in the portal, keep making progress.");
  lines.push("- If an ID is missing, start with a safe discovery action (list/get/search) to find it.");
  lines.push("- Never output placeholder IDs/values like <...>, {{...}}, *_placeholder, or new_*_id.");
  lines.push("- Never output a multi-action plan that depends on IDs created earlier in the SAME response. If an ID will be created/discovered by a tool, output ONLY that one tool action, then stop (you will get another turn with the returned ID).");
  lines.push("- If a name is missing for a create action, pick a short sensible default name and proceed (do not use the whole user request as a name).");
  lines.push("- Ask at most ONE follow-up question, and only after doing any discovery you can.");
  lines.push("");

  lines.push("TOOL SELECTION (pick by domain):");
  lines.push("- Funnels/pages/website builder: funnel_builder.*");
  lines.push("- Booking calendars/availability/bookings: booking.*");
  lines.push("- Inbox messaging: inbox.*");
  lines.push("- Tasks/to-dos: tasks.*");
  lines.push("- Contacts/CRM: contacts.*");
  lines.push("");

  lines.push("DEFAULTS (use when user didn't specify):");
  if (isFunnelBuilder || /\bappointment booking funnel\b/.test(t)) {
    lines.push("- Funnel name: Appointment Booking Funnel");
    lines.push("- Pages: Booking, Thank You");
  }
  if (isBooking) {
    lines.push("- Calendar name: New Calendar");
    lines.push("- Availability: fully available (all days) unless told otherwise");
  }
  lines.push("");

  lines.push("AVAILABLE ACTION KEYS (use these exact strings):");
  for (const ns of sortedNamespaces) {
    const items = groups.get(ns) || [];
    lines.push(`${ns} (${items.length})`);
    lines.push(...wrapLine("  ", items, 140));
  }

  const maxLen = 24000;
  const full = lines.join("\n");
  if (full.length <= maxLen) return full;

  const truncated = full.slice(0, maxLen);
  return `${truncated}\n\n... (tool cheat sheet truncated: ${full.length - maxLen} chars omitted)`;
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
    "You are Pura, an assistant inside a SaaS portal.",
    "You can operate the portal by emitting tool actions.",
    "",
    "OUTPUT MODE (choose exactly one):",
    '1) TOOL MODE: JSON only in the shape {"actions":[{"key":string,"title":string,"args":object}] }',
    "2) CHAT MODE: normal assistant message (no JSON)",
    "",
    "WORK STYLE:",
    "- When the user asks you to do a portal task, use TOOL MODE to make progress.",
    "- Use discovery tools (list/get/search) first when IDs are unknown.",
    "- Never output placeholder IDs/values like <...>, {{...}}, *_placeholder, or new_*_id.",
    "- Never output a multi-action plan that depends on IDs created earlier in the SAME response. If an ID will be created/discovered by a tool, output ONLY that one tool action, then stop (you will get another turn with the returned ID).",
    "- Use short sensible defaults for missing names (calendar/funnel/page).",
    "- IMPORTANT: If prior tool results or context already contain real IDs, copy and reuse those exact IDs in later action args.",
    "- IMPORTANT: If recent results already show the target resource exists, do not recreate it. Reuse its returned ID and continue.",
    "- IMPORTANT: When generating page HTML with funnel_builder.pages.generate_html, include the exact funnelId, exact pageId, and a concrete prompt string every time.",
    "- If you still need something from the user after making progress, ask ONE specific follow-up question.",
    "- In CHAT MODE, summarize what you did and what you need next.",
    "",
    "TOOLING NOTES:",
    String(opts.cheatSheet || ""),
    opts.extraSystem ? String(opts.extraSystem) : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export type PlannerRecentMessage = { role: "user" | "assistant"; text: string };

function collectKnownIds(value: unknown, path: string, out: string[], seen: Set<string>, depth: number) {
  if (depth <= 0 || !value) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = `${path}=${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < Math.min(value.length, 8); index += 1) {
      collectKnownIds(value[index], `${path}[${index}]`, out, seen, depth - 1);
    }
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if ((key === "id" || key.endsWith("Id")) && typeof child === "string" && child.trim()) {
      const normalizedPath = key === "id" && path ? `${path}.id` : nextPath;
      collectKnownIds(child, normalizedPath, out, seen, depth - 1);
      continue;
    }
    if (typeof child === "object" && child) {
      collectKnownIds(child, nextPath, out, seen, depth - 1);
    }
  }
}

export function buildKnownPortalIdsSystemNote(opts: { threadContext?: unknown; lastRunSummary?: unknown }): string | null {
  const found: string[] = [];
  const seen = new Set<string>();

  if (opts.threadContext && typeof opts.threadContext === "object") {
    collectKnownIds(opts.threadContext, "threadContext", found, seen, 4);
  }

  if (opts.lastRunSummary && typeof opts.lastRunSummary === "object") {
    collectKnownIds(opts.lastRunSummary, "lastRunSummary", found, seen, 5);
  }

  const important = found
    .filter((item) => /funnelId|pageId|threadContext\.lastFunnel\.id|threadContext\.lastFunnelPage\.id/i.test(item))
    .slice(0, 20);
  const fallback = found.slice(0, 20);
  const ids = important.length ? important : fallback;
  if (!ids.length) return null;

  return [
    "KNOWN IDS FROM CONTEXT / RECENT RESULTS:",
    "- Reuse these exact IDs when they match the user's target. Copy them exactly into tool args.",
    "- If one of these IDs already represents the target resource, do not create a duplicate.",
    ...ids.map((item) => `- ${item}`),
  ].join("\n");
}

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
