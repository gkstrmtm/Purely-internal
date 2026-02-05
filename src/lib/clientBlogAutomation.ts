import { generateText } from "@/lib/ai";
import { stripDoubleAsterisks } from "@/lib/blog";

export type ClientBlogDraft = {
  title: string;
  excerpt: string;
  content: string;
  seoKeywords?: string[];
};

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

function assertDraft(value: unknown): ClientBlogDraft {
  if (!value || typeof value !== "object") throw new Error("AI returned invalid JSON");
  const v = value as Partial<ClientBlogDraft>;
  if (!v.title || typeof v.title !== "string") throw new Error("AI draft missing title");
  if (!v.excerpt || typeof v.excerpt !== "string") throw new Error("AI draft missing excerpt");
  if (!v.content || typeof v.content !== "string") throw new Error("AI draft missing content");

  const seoKeywords = Array.isArray(v.seoKeywords)
    ? v.seoKeywords.filter((k) => typeof k === "string").map((k) => k.trim()).filter(Boolean).slice(0, 50)
    : undefined;

  return {
    title: stripDoubleAsterisks(v.title.trim()).slice(0, 180),
    excerpt: stripDoubleAsterisks(v.excerpt.trim()).slice(0, 6000),
    content: stripDoubleAsterisks(v.content.trim()).slice(0, 200000),
    seoKeywords,
  };
}

export type ClientBlogGenerationContext = {
  businessName?: string | null;
  websiteUrl?: string | null;
  industry?: string | null;
  businessModel?: string | null;
  primaryGoals?: string[];
  targetCustomer?: string | null;
  brandVoice?: string | null;
  topic?: string;
};

export async function generateClientBlogDraft(ctx: ClientBlogGenerationContext): Promise<ClientBlogDraft> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;

  // Deterministic fallback so automation can still run in dev.
  if (!baseUrl || !apiKey) {
    const title = (ctx.topic || "Helpful tips to grow your business").slice(0, 180);
    const excerpt = "A quick, practical post generated without an AI provider configured.";
    const content = [
      `# ${title}`,
      "",
      "AI is not configured for this environment yet.",
      "",
      "## What to do next",
      "- Set `AI_API_KEY` and `AI_BASE_URL` in your environment",
      "- Then the scheduler will generate full drafts automatically",
      "",
      "## Notes",
      "- This placeholder exists so the pipeline still works end-to-end",
    ].join("\n");

    return { title, excerpt, content, seoKeywords: [] };
  }

  const instructions = [
    "Return ONLY valid JSON.",
    "Schema: { title: string, excerpt: string, content: string, seoKeywords?: string[] }.",
    "Write content in Markdown.",
    "No code fences, no extra commentary.",
    "Keep it practical for a small service business.",
  ].join(" ");

  const prompt = {
    business: {
      businessName: ctx.businessName ?? undefined,
      websiteUrl: ctx.websiteUrl ?? undefined,
      industry: ctx.industry ?? undefined,
      businessModel: ctx.businessModel ?? undefined,
      primaryGoals: ctx.primaryGoals ?? undefined,
      targetCustomer: ctx.targetCustomer ?? undefined,
      brandVoice: ctx.brandVoice ?? undefined,
    },
    topic: ctx.topic ?? "A helpful educational post for our customers",
  };

  const text = await generateText({
    system:
      "You are an expert SEO blog writer. You write clear, non-fluffy posts for service businesses. You avoid clickbait and you never invent false claims.",
    user: `${instructions}\n\nInput: ${JSON.stringify(prompt)}`,
  });

  const parsed = tryParseJson(text);
  return assertDraft(parsed);
}
