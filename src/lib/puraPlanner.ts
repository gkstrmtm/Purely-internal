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
    $ref: z.enum(["contact", "contact_tag"]),
    hint: z.string().trim().max(200).optional(),
    name: z.string().trim().max(120).optional(),
    createIfMissing: z.boolean().optional(),
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

  // If it looks like a direct request, plan.
  if (/(^|\b)(create|make|build|generate|run|start|trigger|send|add|remove|update|edit|fix|tag|untag|label|replace|swap|use)\b/i.test(t)) {
    return true;
  }

  // Corrections / follow-ups.
  if (/\b(no,|actually|instead|undo|nevermind|then|do that|make one)\b/i.test(t)) return true;

  return false;
}

export async function planPuraActions(opts: {
  text: string;
  url?: string;
  recentMessages: Array<{ role: "user" | "assistant"; text: string }>;
  threadContext?: unknown;
}): Promise<PuraPlan | null> {
  const text = String(opts.text || "").trim();
  if (!shouldPlan(text)) return null;

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
    "- Never invent IDs. Use $ref objects for things you need resolved (contact, contact_tag).",
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
    const obj = extractJsonObject(raw);
    const parsed = PlannerOutputSchema.safeParse(obj);
    if (!parsed.success) return null;

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
