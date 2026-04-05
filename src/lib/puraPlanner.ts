import { z } from "zod";

import { generateText, generateTextWithImages } from "@/lib/ai";
import {
  PortalAgentActionKeySchema,
  extractJsonObject,
  portalAgentActionsIndexText,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import { SCHEDULED_ACTION_PREFIX } from "@/lib/portalAiChatScheduledActionEnvelope";
import { looksLikeImperativeRequest } from "@/lib/puraIntent";

export type PuraPlannerMode = "execute" | "clarify" | "explain" | "noop";

export { getPuraIntentSignals } from "@/lib/puraIntent";

const RefSchema = z
  .object({
    $ref: z.enum([
      "contact",
      "contact_tag",
      "inbox_thread",
      "funnel",
      "automation",
      "booking",
      "blog_post",
      "newsletter",
      "media_folder",
      "media_item",
      "task",
      "review",
      "review_question",
      "nurture_campaign",
      "nurture_step",
      "scraped_lead",
      "credit_pull",
      "credit_dispute_letter",
      "credit_report",
      "credit_report_item",
      "user",
      "funnel_form",
      "funnel_page",
      "custom_domain",
      "ai_outbound_calls_campaign",
      "id", // Generic ID passthrough for domain-specific IDs (product, order, etc.)
    ]),
    hint: z.string().trim().max(200).optional(),
    name: z.string().trim().max(120).optional(),
    createIfMissing: z.boolean().optional(),
    channel: z.enum(["email", "sms"]).optional(),
    argKey: z.string().trim().max(80).optional(), // Which arg field this ID belongs to (e.g., "productId", "templateId")
  })
  .strict();

const ArgsValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(ArgsValueSchema),
    z.record(z.string(), ArgsValueSchema),
    RefSchema,
  ]),
);

const StepSchema = z
  .object({
    key: PortalAgentActionKeySchema,
    title: z.string().trim().min(1).max(120),
    args: z.record(z.string(), ArgsValueSchema).default({}),
    openUrl: z.string().trim().max(600).optional(),
  })
  .strict();

export const PlannerOutputSchema = z
  .object({
    mode: z.enum(["execute", "clarify", "explain", "noop"]),
    workTitle: z.string().trim().max(120).optional(),
    steps: z.array(StepSchema).max(6).default([]),
    clarifyingQuestion: z.string().trim().max(600).optional(),
    explanation: z.string().trim().max(4000).optional(),
  })
  .strict();

export type PuraPlanStep = z.infer<typeof StepSchema>;
export type PuraPlan = z.infer<typeof PlannerOutputSchema>;

function shouldPlan(textRaw: string): boolean {
  const t = String(textRaw || "").trim();
  if (!t) return false;

  // AI-first: always let the model decide whether to execute/clarify/explain/noop.
  // This makes the chat behave more like a normal conversation router.
  return true;
}

async function tryRepairPlannerJson(raw: string): Promise<unknown | null> {
  const text = String(raw || "").trim();
  if (!text) return null;

  const system = [
    "You repair JSON output for a strict schema.",
    "Return JSON only (no markdown).",
    "Do not add commentary.",
    "Ensure the output matches this schema exactly:",
    "{",
    "  \"mode\": \"execute\"|\"clarify\"|\"explain\"|\"noop\",",
    "  \"workTitle\"?: string,",
    "  \"steps\": [{ \"key\": actionKey, \"title\": string, \"args\": object, \"openUrl\"?: string }],",
    "  \"clarifyingQuestion\"?: string,",
    "  \"explanation\"?: string",
    "}",
    "If the input contains extra text, extract and fix the JSON object.",
    "If the input cannot be repaired, output {\"mode\":\"noop\",\"steps\":[] }",
  ].join("\n");

  const user = ["Input:", text, "\nRepaired JSON:"].join("\n");

  try {
    const repairedRaw = await generateText({ system, user });
    return extractJsonObject(repairedRaw);
  } catch {
    return null;
  }
}

function summarizeActiveThreadEntities(threadContext: unknown): string {
  const ctx = threadContext && typeof threadContext === "object" && !Array.isArray(threadContext)
    ? (threadContext as Record<string, unknown>)
    : null;
  if (!ctx) return "(none)";

  const rows: string[] = [];
  const add = (label: string, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const obj = value as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    const name =
      typeof obj.label === "string" ? obj.label.trim() :
      typeof obj.name === "string" ? obj.name.trim() :
      typeof obj.title === "string" ? obj.title.trim() :
      "";
    const funnelId = typeof obj.funnelId === "string" ? obj.funnelId.trim() : "";
    const extra = funnelId ? ` funnelId=${funnelId.slice(0, 24)}` : "";
    if (id || name) rows.push(`- ${label}: ${name || "(unnamed)"}${id ? ` [id=${id.slice(0, 24)}]` : ""}${extra}`);
  };

  add("funnel", ctx.lastFunnel);
  add("funnel page", ctx.lastFunnelPage);
  add("funnel form", ctx.lastFunnelForm);
  add("automation", ctx.lastAutomation);
  add("contact", (ctx as any).lastContact);
  add("booking", ctx.lastBooking);
  add("booking calendar", ctx.lastBookingCalendar);
  add("scraped lead", ctx.lastScrapedLead);
  add("AI outbound campaign", ctx.lastAiOutboundCallsCampaign);
  add("custom domain", ctx.lastCustomDomain);
  add("blog post", ctx.lastBlogPost);
  add("newsletter", ctx.lastNewsletter);
  add("media folder", ctx.lastMediaFolder);
  add("media item", ctx.lastMediaItem);
  add("task", ctx.lastTask);
  add("review", ctx.lastReview);
  add("review question", ctx.lastReviewQuestion);
  add("nurture campaign", ctx.lastNurtureCampaign);
  add("nurture step", ctx.lastNurtureStep);
  add("scheduled message", (ctx as any).lastInboxScheduledMessage);

  return rows.length ? rows.join("\n") : "(none)";
}

export async function planPuraActions(opts: {
  text: string;
  url?: string;
  recentMessages: Array<{ role: "user" | "assistant"; text: string }>;
  threadContext?: unknown;
  imageUrls?: string[];
}): Promise<PuraPlan | null> {
  const text = String(opts.text || "").trim();
  if (!shouldPlan(text)) return null;

  const ownerTimeZone =
    opts.threadContext && typeof opts.threadContext === "object" && !Array.isArray(opts.threadContext) && typeof (opts.threadContext as any).ownerTimeZone === "string"
      ? String((opts.threadContext as any).ownerTimeZone || "").trim().slice(0, 80)
      : "";

  const threadSummary =
    opts.threadContext && typeof opts.threadContext === "object" && !Array.isArray(opts.threadContext) && typeof (opts.threadContext as any).threadSummary === "string"
      ? String((opts.threadContext as any).threadSummary || "").trim().slice(0, 1200)
      : "";
  const activeEntities = summarizeActiveThreadEntities(opts.threadContext);

  const convo = (opts.recentMessages || [])
    .slice(-80)
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.text || "").slice(0, 800)}`)
    .join("\n");

  const baseSystem = [
    "You are Pura, an agent inside a business portal.",
    "Your job is to output a strict JSON plan for what to do next.",
    "Rules:",
    "- If the user asks HOW / for steps / what to click AND does NOT ask you to do it for them, output mode=explain.",
    "- If the user asks you to DO something (send/schedule/update/delete) OR says to do it for them (e.g. 'do it', 'for me', 'can you send...'), you MUST output mode=execute (not explain).",
    "- IMPORTANT: Treat this as an ongoing thread, not a stateless request.",
    "- If the user says things like 'it', 'that one', 'same one', 'use the one we just made', or gives a short follow-up, prefer the active entity from thread context.",
    "- For follow-up commands in the same thread, continue the current task/entity unless the user clearly switches topics.",
    "- Only output mode=clarify when there is NO plausible active entity in thread context and the missing detail is truly required.",
    "- If required specifics are missing or ambiguous, output mode=clarify with ONE short question.",
    "- IMPORTANT: For booking calendar selection, NEVER ask the user for a calendar ID.",
    "  If a step needs calendarId but it isn't known, still output mode=execute and omit calendarId;",
    "  the system will auto-pick on 'any/doesn't matter' or show clickable calendar choices.",
    "- Prefer using $ref hints that continue the active thread context instead of asking the user to restate the obvious.",
    "- Never output manual step-by-step portal instructions unless mode=explain.",
    "- IMPORTANT: Do NOT route non-booking SMS schedules to Booking Automation / Reminders / Follow-up. Use inbox.send_sms + AI chat scheduled runs.",
    "- Never invent IDs. Use $ref objects for things you need resolved (contact, contact_tag, inbox_thread, funnel, automation, booking, blog_post, newsletter, media_folder, media_item, task, review, review_question, nurture_campaign, nurture_step, scraped_lead, credit_pull, credit_dispute_letter, credit_report, credit_report_item, user, funnel_form, funnel_page, custom_domain, ai_outbound_calls_campaign, or generic 'id' for domain-specific IDs).",
    "- IMPORTANT: If the user says 'schedule' or describes a recurring time-based workflow (e.g., 'every weekday at 9am send a text'), do NOT create portal tasks.",
    "  Instead, create Scheduled chat runs (ai_chat.scheduled.create).",
    "  Notes for schedules:",
    "  - For weekdays-only schedules, create ONE scheduled item per weekday (Mon-Fri) with repeatEveryMinutes=10080 (7 days).",
    "  - Use ai_chat.scheduled.create with sendAtLocal={isoWeekday,timeLocal,timeZone?} instead of guessing an ISO timestamp.",
    "  - IMPORTANT: If the user asks to change/reschedule/pause/stop/remove an existing schedule, do NOT create a new schedule.",
    "    First call ai_chat.scheduled.list, identify the relevant scheduled message(s), then use ai_chat.scheduled.update or ai_chat.scheduled.delete.",
    "    (Weekday schedules often have 5 items; update/delete all matching weekdays unless the user specifies a single day.)",
    "  - If the user asks to shift MANY scheduled items to a new time-of-day (e.g. 'change all scheduled SMS tasks to 9am'), prefer ai_chat.scheduled.reschedule with channel=sms/email and timeLocal=\"HH:mm\".",
    "    - CRITICAL: For ai_chat.scheduled.reschedule you MUST include timeLocal as a valid 24-hour HH:mm string.",
    "      Convert natural language: 9am→\"09:00\", 9:30pm→\"21:30\", noon→\"12:00\", midnight→\"00:00\".",
    "      Never output blank/partial times (e.g. ':' or '9').",
    "  - Time zones: If the user does NOT specify a timezone, omit sendAtLocal.timeZone so it defaults to the user's timezone.",
    "    If the user explicitly specifies a timezone (e.g. PST, America/Los_Angeles), include sendAtLocal.timeZone.",
    "  - IMPORTANT: The scheduled item's text MUST be a deterministic scheduled-action envelope so it executes reliably when due.",
    "    Format: " + SCHEDULED_ACTION_PREFIX + " {\"workTitle\":\"...\",\"steps\":[{\"key\":\"inbox.send_sms\",\"title\":\"...\",\"args\":{...}}]}",
    "  - Put the real action(s) to run inside envelope.steps (usually inbox.send_sms).",
    "  - Do NOT include scheduling language like 'every weekday' inside the envelope (avoid rescheduling loops).",
    "  - If the user asks to 'trigger one now as a test', ALSO send an immediate inbox.send_sms now (do not give steps).",
    "  - Only create automations when the user explicitly asks for an Automation.",
    "- Only use tasks.create / tasks.create_for_all when the user explicitly wants an internal human to-do item in the Tasks service.",
    "- Output JSON only. No markdown.",
    "- You MAY propose ai_chat.scheduled.* actions (and ai_chat.cron.run for a test). Do NOT propose other ai_chat.* actions.",
    "",
    "Schema:",
    "{",
    "  \"mode\": \"execute\"|\"clarify\"|\"explain\"|\"noop\",",
    "  \"workTitle\"?: string,",
    "  \"steps\": [{ \"key\": actionKey, \"title\": string, \"args\": object, \"openUrl\"?: string }],",
    "  \"clarifyingQuestion\"?: string,",
    "  \"explanation\"?: string",
    "}",
    "",
    "References you may use in args:",
    "- {\"$ref\":\"contact\",\"hint\":\"Chester\"}",
    "- {\"$ref\":\"contact_tag\",\"name\":\"VIP\",\"createIfMissing\":true}",
    "- {\"$ref\":\"inbox_thread\",\"hint\":\"+15551231234\",\"channel\":\"sms\"}",
    "- {\"$ref\":\"funnel\",\"name\":\"Spring Promo\"}",
    "- {\"$ref\":\"automation\",\"name\":\"Missed call follow-up\"}",
    "- {\"$ref\":\"booking\",\"hint\":\"Chester\"}",
    "- {\"$ref\":\"blog_post\",\"name\":\"How to improve your credit\"}",
    "- {\"$ref\":\"newsletter\",\"name\":\"Weekly update\"}",
    "- {\"$ref\":\"media_folder\",\"name\":\"Logos\"}",
    "- {\"$ref\":\"media_item\",\"hint\":\"headshot.png\"}",
    "- {\"$ref\":\"task\",\"hint\":\"Call Acme\"}",
    "- {\"$ref\":\"review\",\"hint\":\"John 5 stars\"}",
    "- {\"$ref\":\"review_question\",\"hint\":\"How did you hear about us?\"}",
    "- {\"$ref\":\"nurture_campaign\",\"name\":\"Welcome campaign\"}",
    "- {\"$ref\":\"nurture_step\",\"hint\":\"step 2\"}",
    "- {\"$ref\":\"scraped_lead\",\"hint\":\"Acme Plumbing\"}",
    "- {\"$ref\":\"credit_pull\",\"hint\":\"latest\"}",
    "- {\"$ref\":\"credit_dispute_letter\",\"hint\":\"most recent draft\"}",
    "- {\"$ref\":\"credit_report\",\"hint\":\"latest for Chester\"}",
    "- {\"$ref\":\"credit_report_item\",\"hint\":\"Experian: Capital One\"}",
    "- {\"$ref\":\"user\",\"hint\":\"alex@company.com\"}",
    "- {\"$ref\":\"funnel_form\",\"hint\":\"lead capture form\"}",
    "- {\"$ref\":\"funnel_page\",\"hint\":\"/thank-you\"}",
    "- {\"$ref\":\"custom_domain\",\"hint\":\"www.example.com\"}",
    "- {\"$ref\":\"ai_outbound_calls_campaign\",\"name\":\"New Leads Outreach\"}",
    "- {\"$ref\":\"id\",\"hint\":\"ABC123\",\"argKey\":\"productId\"} (for domain-specific IDs)",
    "",
    portalAgentActionsIndexText({ includeAiChat: false }),
    "",
    "Scheduling-only AI chat actions (allowed):",
    "- ai_chat.scheduled.create: Create a scheduled user message (fields: threadId?, text, sendAtIso? OR sendAtLocal?, repeatEveryMinutes?)",
    "  - sendAtLocal: { isoWeekday: 1..7, timeLocal: \"HH:mm\", timeZone?: \"America/Chicago\" }",
    "- ai_chat.scheduled.list: List scheduled (unsent) messages",
    "- ai_chat.scheduled.reschedule: Bulk shift scheduled messages to a new time-of-day (fields: channel?, threadId?, messageIds?, timeLocal=\"HH:mm\", timeZone?)",
    "- ai_chat.scheduled.update: Update a scheduled message (fields: messageId, sendAtIso?, repeatEveryMinutes?)",
    "- ai_chat.scheduled.delete: Delete a scheduled message (fields: messageId)",
    "- ai_chat.cron.run: Run due scheduled messages (cron/test)",
  ].join("\n");

  const system = baseSystem;

  const user = [
    "Conversation (most recent last):",
    convo || "(none)",
    "\nThread summary (rolling, may include older context):",
    threadSummary || "(none)",
    "\nOwner time zone (if known):",
    ownerTimeZone || "(unknown)",
    "\nActive entities from thread context (prefer these for follow-ups):",
    activeEntities,
    "\nThread context JSON (may help with follow-ups):",
    JSON.stringify(opts.threadContext ?? null).slice(0, 4000),
    "\nCurrent page URL:",
    String(opts.url || "").slice(0, 1200),
    "\nLatest user message:",
    text,
    "\nJSON:",
  ].join("\n");

  const imageUrls = Array.isArray(opts.imageUrls)
    ? opts.imageUrls
        .map((u) => (typeof u === "string" ? u.trim() : ""))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const runModel = async (systemPrompt: string) => {
    return imageUrls.length
      ? generateTextWithImages({ system: systemPrompt, user, imageUrls })
      : generateText({ system: systemPrompt, user });
  };

  try {
    const raw = await runModel(system);
    let obj: unknown = null;
    try {
      obj = extractJsonObject(raw);
    } catch {
      obj = null;
    }

    let parsed = PlannerOutputSchema.safeParse(obj);
    if (!parsed.success) {
      const repaired = await tryRepairPlannerJson(raw);
      parsed = PlannerOutputSchema.safeParse(repaired);
      if (!parsed.success) return null;
    }

    // If the model incorrectly returned explain/noop for an imperative request, re-run with a hard constraint.
    if (parsed.success && (parsed.data.mode === "explain" || parsed.data.mode === "noop") && looksLikeImperativeRequest(text)) {
      const forceSystem = [
        baseSystem,
        "\nHARD OVERRIDE:",
        "- The user is asking you to DO it now. Output mode=execute.",
        "- Do not output mode=explain.",
        "- Do not output mode=noop.",
        "- If a detail is missing, use mode=clarify with ONE short question.",
      ].join("\n");

      const raw2 = await runModel(forceSystem);
      let obj2: unknown = null;
      try {
        obj2 = extractJsonObject(raw2);
      } catch {
        obj2 = null;
      }
      let parsed2 = PlannerOutputSchema.safeParse(obj2);
      if (!parsed2.success) {
        const repaired2 = await tryRepairPlannerJson(raw2);
        parsed2 = PlannerOutputSchema.safeParse(repaired2);
      }
      if (parsed2.success) parsed = parsed2;
    }

    // If the model emits scheduled items without deterministic envelopes, re-run with a hard constraint.
    const hasNonEnvelopeScheduledText = (parsed.data.steps || []).some((s) => {
      const key = String((s as any)?.key || "");
      if (key !== "ai_chat.scheduled.create") return false;
      const txt = String(((s as any)?.args as any)?.text || "").trim();
      return !txt.startsWith(SCHEDULED_ACTION_PREFIX);
    });

    if (hasNonEnvelopeScheduledText) {
      const forceSystem = [
        baseSystem,
        "\nHARD OVERRIDE:",
        `- Every ai_chat.scheduled.create.args.text MUST start with '${SCHEDULED_ACTION_PREFIX}' and contain a JSON envelope with steps to execute when due.`,
        "- The envelope.steps should contain the real action(s) (e.g. inbox.send_sms), not scheduling instructions.",
      ].join("\n");

      const raw2 = await runModel(forceSystem);
      let obj2: unknown = null;
      try {
        obj2 = extractJsonObject(raw2);
      } catch {
        obj2 = null;
      }
      let parsed2 = PlannerOutputSchema.safeParse(obj2);
      if (!parsed2.success) {
        const repaired2 = await tryRepairPlannerJson(raw2);
        parsed2 = PlannerOutputSchema.safeParse(repaired2);
      }
      if (parsed2.success) parsed = parsed2;
    }

    // Defense-in-depth: only allow the scheduling-related ai_chat actions.
    const steps = (parsed.data.steps || []).filter((s) => {
      const k = String((s as any)?.key || "");
      if (!k.startsWith("ai_chat.")) return true;
      return k.startsWith("ai_chat.scheduled.") || k === "ai_chat.cron.run";
    });
    const plan: PuraPlan = { ...parsed.data, steps };

    // If the model emits execute with no steps, treat as null.
    if (plan.mode === "execute" && !plan.steps.length) return null;
    if (plan.mode === "clarify" && !String(plan.clarifyingQuestion || "").trim()) return null;
    if (plan.mode === "explain" && !String(plan.explanation || "").trim()) return null;

    return plan;
  } catch {
    return null;
  }
}

export function isPuraRef(v: unknown): v is z.infer<typeof RefSchema> {
  return RefSchema.safeParse(v).success;
}

export type PuraRef = z.infer<typeof RefSchema>;

export function isPortalAgentActionKey(v: unknown): v is PortalAgentActionKey {
  return PortalAgentActionKeySchema.safeParse(v).success;
}
