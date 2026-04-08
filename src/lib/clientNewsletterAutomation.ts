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
  deliveryEmailHint?: string | null;
  deliverySmsHint?: string | null;
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
    "Make it publishable, specific, and conversion-aware - never generic or placeholder-ish.",
    "IMPORTANT: excerpt is the email message body. The system will append a hosted link after the excerpt. Do NOT include a URL in excerpt.",
    "If you include smsText, keep it under 240 characters and do NOT include a URL (the system appends the link).",
    "No em dashes. Use a normal hyphen '-' instead.",
    "Avoid top-level '# ' headings. Prefer '## ' subheadings and plain paragraphs.",
    "Never use placeholders such as [Your Name], TBD, lorem ipsum, coming soon, or generic 'monthly update' phrasing unless the user explicitly asks for that.",
    "Never invent fake links or fake metrics.",
    "If topicHint names a specific angle, outcome, audience, or workflow, keep the title, excerpt, content, and smsText tightly aligned to that exact topic.",
    "Do not drift into a different offer, service line, or customer scenario just because it appears in the business profile.",
    "External newsletters should feel like a polished customer send: sharp opener, concrete takeaways, 3-5 short sections, and a confident closing CTA.",
    "Internal newsletters should lead with priorities, blockers, and next actions instead of marketing copy.",
    "If the content mentions the website in the body, use a real markdown link to [Purely Automation](https://purelyautomation.com).",
  ].join(" ");

  const business = ctx.topicHint
    ? {
        businessName: ctx.businessName ?? undefined,
        websiteUrl: ctx.websiteUrl ?? undefined,
        brandVoice: ctx.brandVoice ?? undefined,
      }
    : {
        businessName: ctx.businessName ?? undefined,
        websiteUrl: ctx.websiteUrl ?? undefined,
        industry: ctx.industry ?? undefined,
        businessModel: ctx.businessModel ?? undefined,
        primaryGoals: ctx.primaryGoals ?? undefined,
        targetCustomer: ctx.targetCustomer ?? undefined,
        brandVoice: ctx.brandVoice ?? undefined,
      };

  const prompt = {
    kind: ctx.kind,
    business,
    guidedAnswers: ctx.promptAnswers ?? {},
    topicHint: ctx.topicHint ?? undefined,
    deliveryHints: {
      email: (ctx.deliveryEmailHint || "").trim() || undefined,
      sms: (ctx.deliverySmsHint || "").trim() || undefined,
    },
  };

  const system =
    ctx.kind === "INTERNAL"
      ? "You write high-quality internal team newsletters. You are direct, operational, crisp, and useful. Lead with priorities, blockers, and next steps. You never invent metrics or claims."
      : "You write polished external customer newsletters for a service business. You are specific, persuasive, and grounded in real business value. You never invent metrics, fake proof, or filler copy.";

  const text = await generateText({
    system,
    user: `${instructions}\n\nInput: ${JSON.stringify(prompt)}`,
  });

  const parsed = tryParseJson(text);
  return assertDraft(parsed);
}
