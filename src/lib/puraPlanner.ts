import { z } from "zod";

import { generateText } from "@/lib/ai";
import {
  PortalAgentActionKeySchema,
  extractJsonObject,
  portalAgentActionsIndexText,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";

export type PuraPlannerMode = "execute" | "clarify" | "explain" | "noop";

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

function shouldPlan(textRaw: string, threadContext?: unknown): boolean {
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

export async function planPuraActions(opts: {
  text: string;
  url?: string;
  recentMessages: Array<{ role: "user" | "assistant"; text: string }>;
  threadContext?: unknown;
}): Promise<PuraPlan | null> {
  const text = String(opts.text || "").trim();
  if (!shouldPlan(text, opts.threadContext)) return null;

  const convo = (opts.recentMessages || [])
    .slice(-10)
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.text || "").slice(0, 800)}`)
    .join("\n");

  const system = [
    "You are Pura, an agent inside a business portal.",
    "Your job is to output a strict JSON plan for what to do next.",
    "Rules:",
    "- If the user asks HOW, output mode=explain.",
    "- If the user gives an imperative instruction, prefer mode=execute.",
    "- If required specifics are missing or ambiguous, output mode=clarify with ONE short question.",
    "- Never output manual step-by-step portal instructions unless mode=explain.",
    "- Never invent IDs. Use $ref objects for things you need resolved (contact, contact_tag, inbox_thread, funnel, automation, booking, blog_post, newsletter, media_folder, media_item, task, review, review_question, nurture_campaign, nurture_step, scraped_lead, credit_pull, credit_dispute_letter, credit_report, credit_report_item, user, funnel_form, funnel_page, custom_domain, ai_outbound_calls_campaign, or generic 'id' for domain-specific IDs).",
    "- Output JSON only. No markdown.",
    "- Never propose ai_chat.* actions.",
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
  ].join("\n");

  const user = [
    "Conversation (most recent last):",
    convo || "(none)",
    "\nThread context JSON (may help with follow-ups):",
    JSON.stringify(opts.threadContext ?? null).slice(0, 4000),
    "\nCurrent page URL:",
    String(opts.url || "").slice(0, 1200),
    "\nLatest user message:",
    text,
    "\nJSON:",
  ].join("\n");

  try {
    const raw = await generateText({ system, user });
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

    // Defense-in-depth.
    const steps = (parsed.data.steps || []).filter((s) => !String(s.key).startsWith("ai_chat."));
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
