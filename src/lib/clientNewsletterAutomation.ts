import { generateText } from "@/lib/ai";
import { stripDoubleAsterisks } from "@/lib/blog";

export type ClientNewsletterDraft = {
  title: string;
  excerpt: string;
  content: string;
  smsText?: string;
};

export type ClientNewsletterKind = "EXTERNAL" | "INTERNAL";

function sanitizeMarkdownContent(input: string): string {
  const text = String(input || "");
  const noDashes = text.replace(/[\u2014\u2013]/g, "-");
  // Convert top-level H1 markdown to H2 so public renderer doesn't show raw '#'.
  return noDashes
    .split(/\r?\n/)
    .map((line) => (line.trimStart().startsWith("# ") ? line.replace(/^\s*#\s+/, "## ") : line))
    .join("\n")
    .trim();
}

function sanitizePlain(input: string): string {
  return String(input || "").replace(/[\u2014\u2013]/g, "-").trim();
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

function assertDraft(value: unknown): ClientNewsletterDraft {
  if (!value || typeof value !== "object") throw new Error("AI returned invalid JSON");
  const v = value as Partial<ClientNewsletterDraft>;
  if (!v.title || typeof v.title !== "string") throw new Error("AI draft missing title");
  if (!v.excerpt || typeof v.excerpt !== "string") throw new Error("AI draft missing excerpt");
  if (!v.content || typeof v.content !== "string") throw new Error("AI draft missing content");

  const smsText = typeof v.smsText === "string" ? v.smsText.trim().slice(0, 240) : undefined;

  return {
    title: stripDoubleAsterisks(sanitizePlain(v.title)).slice(0, 180),
    excerpt: stripDoubleAsterisks(sanitizePlain(v.excerpt)).slice(0, 6000),
    content: sanitizeMarkdownContent(v.content).slice(0, 200000),
    ...(smsText ? { smsText: sanitizePlain(smsText).slice(0, 240) } : {}),
  };
}

export type ClientNewsletterGenerationContext = {
  kind: ClientNewsletterKind;
  businessName?: string | null;
  websiteUrl?: string | null;
  industry?: string | null;
  businessModel?: string | null;
  primaryGoals?: string[];
  targetCustomer?: string | null;
  brandVoice?: string | null;
  promptAnswers?: Record<string, string>;
  topicHint?: string;
};

export async function generateClientNewsletterDraft(ctx: ClientNewsletterGenerationContext): Promise<ClientNewsletterDraft> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;

  // Deterministic fallback so automation can still run in dev.
  if (!baseUrl || !apiKey) {
    const title = (ctx.topicHint || (ctx.kind === "INTERNAL" ? "Team update" : "Monthly update")).slice(0, 180);
    const excerpt = "A short newsletter generated without an AI provider configured.";
    const content = [
      title,
      "",
      "AI is not configured for this environment yet.",
      "",
      "What to do next:",
      "- Set AI_API_KEY and AI_BASE_URL in your environment",
      "- Then the scheduler will generate full newsletters automatically",
      "",
      "Notes:",
      "- This placeholder exists so the pipeline works end-to-end",
    ].join("\n");

    const smsText = ctx.kind === "INTERNAL" ? "Team update is ready." : "New newsletter is ready.";

    return { title, excerpt, content, smsText };
  }

  const instructions = [
    "Return ONLY valid JSON.",
    "Schema: { title: string, excerpt: string, content: string, smsText?: string }.",
    "Write content in Markdown.",
    "No code fences, no extra commentary.",
    "Keep it clear, concise, and non-fluffy.",
    "If you include smsText, keep it under 240 characters and do NOT include a URL.",
    "No em dashes (—). Use a normal hyphen '-' instead.",
    "Avoid top-level '# ' headings. Prefer '## ' subheadings and plain paragraphs.",
  ].join(" ");

  const prompt = {
    kind: ctx.kind,
    business: {
      businessName: ctx.businessName ?? undefined,
      websiteUrl: ctx.websiteUrl ?? undefined,
      industry: ctx.industry ?? undefined,
      businessModel: ctx.businessModel ?? undefined,
      primaryGoals: ctx.primaryGoals ?? undefined,
      targetCustomer: ctx.targetCustomer ?? undefined,
      brandVoice: ctx.brandVoice ?? undefined,
    },
    guidedAnswers: ctx.promptAnswers ?? {},
    topicHint: ctx.topicHint ?? undefined,
  };

  const system =
    ctx.kind === "INTERNAL"
      ? "You write internal team newsletters. You are direct, operational, and avoid marketing fluff. You never invent metrics or claims."
      : "You write external customer newsletters for a service business. You are helpful, friendly, and specific. You never invent metrics or claims.";

  const text = await generateText({
    system,
    user: `${instructions}\n\nInput: ${JSON.stringify(prompt)}`,
  });

  const parsed = tryParseJson(text);
  return assertDraft(parsed);
}
