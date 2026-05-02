import { generateText } from "@/lib/ai";
import { stripDoubleAsterisks } from "@/lib/blog";

export type ClientBlogDraft = {
  title: string;
  excerpt: string;
  content: string;
  seoKeywords?: string[];
  coverImageAlt?: string;
};

function sanitizeMarkdownContent(input: string): string {
  const text = String(input || "");
  const noDashes = text.replace(/[\u2014\u2013]/g, "-");
  return noDashes
    .split(/\r?\n/)
    .map((line) => (line.trimStart().startsWith("# ") ? line.replace(/^\s*#\s+/, "## ") : line))
    .join("\n")
    .trim();
}

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

  const coverImageAlt = typeof v.coverImageAlt === "string" ? v.coverImageAlt.trim().slice(0, 180) : undefined;

  return {
    title: stripDoubleAsterisks(v.title.trim()).slice(0, 180),
    excerpt: stripDoubleAsterisks(v.excerpt.trim()).slice(0, 6000),
    content: sanitizeMarkdownContent(v.content).slice(0, 200000),
    seoKeywords,
    coverImageAlt,
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
  strictTopicOnly?: boolean;
  referenceAssets?: Array<{
    fileName?: string;
    mimeType?: string;
    tag?: string;
    url?: string;
    extractionKind?: string;
    extractedText?: string;
  }>;
};

export async function generateClientBlogDraft(ctx: ClientBlogGenerationContext): Promise<ClientBlogDraft> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;

  // Deterministic fallback so automation can still run in dev.
  if (!baseUrl || !apiKey) {
    const title = (ctx.topic || "Helpful tips to grow your business").slice(0, 180);
    const excerpt = "A quick, practical post generated without an AI provider configured.";
    const content = [
      title,
      "",
      "AI is not configured for this environment yet.",
      "",
      "What to do next:",
      "- Set AI_API_KEY and AI_BASE_URL in your environment",
      "- Then the scheduler will generate full drafts automatically",
      "",
      "Notes:",
      "- This placeholder exists so the pipeline still works end-to-end",
    ].join("\n");

    return { title, excerpt, content, seoKeywords: [] };
  }

  const instructions = [
    "Return ONLY valid JSON.",
    "Schema: { title: string, excerpt: string, content: string, seoKeywords?: string[], coverImageAlt?: string }.",
    "Write content in Markdown.",
    "No code fences, no extra commentary.",
    "Keep it practical, high-signal, and good enough to publish without sounding templated.",
    "If referenceAssets include extractedText, treat that extracted content as source material and use it directly where relevant.",
    "Do not ignore file-derived context when it provides concrete details, terminology, pricing, offers, FAQs, or product facts.",
    "When referenceAssets and the business profile differ, prefer the file-derived details for the specific offer or subject covered by those files.",
    "SEO: include 20-40 relevant, unique SEO keywords/phrases in seoKeywords (mix of short + long-tail).",
    "If the requested topic names a specific offer, niche, audience, or business model, keep the title, excerpt, content, and SEO keywords tightly aligned to that exact topic.",
    "Do not mix in unrelated industries, services, or customer scenarios from the business profile when the topic is more specific.",
    "SEO keywords must stay on-topic. Never include keywords for a different industry or service than the requested topic.",
    "If you propose a cover image concept, put the descriptive alt text in coverImageAlt (plain text, no Markdown).",
    "Never use placeholders, fake anecdotes, fake stats, or generic filler sections.",
    "The post should have a strong hook, concrete subheads, useful examples, and a short closing CTA with a real markdown link to [Purely Automation](https://purelyautomation.com).",
  ].join(" ");

  const business = ctx.strictTopicOnly
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
    business,
    topic: ctx.topic ?? "A helpful educational post for our customers",
    referenceAssets: Array.isArray(ctx.referenceAssets)
      ? ctx.referenceAssets
          .map((asset) => ({
            fileName: typeof asset?.fileName === "string" ? asset.fileName.trim().slice(0, 180) : undefined,
            mimeType: typeof asset?.mimeType === "string" ? asset.mimeType.trim().slice(0, 120) : undefined,
            tag: typeof asset?.tag === "string" ? asset.tag.trim().slice(0, 120) : undefined,
            url: typeof asset?.url === "string" ? asset.url.trim().slice(0, 1000) : undefined,
            extractionKind: typeof asset?.extractionKind === "string" ? asset.extractionKind.trim().slice(0, 40) : undefined,
            extractedText: typeof asset?.extractedText === "string" ? asset.extractedText.trim().slice(0, 6000) : undefined,
          }))
          .filter((asset) => asset.fileName || asset.tag || asset.url || asset.extractedText)
          .slice(0, 12)
      : undefined,
  };

  const text = await generateText({
    system:
      "You are an expert SEO blog writer. You write clear, high-quality posts for service businesses. You avoid clickbait, filler, and fake proof. Every section stays tightly grounded to the requested topic without blending in unrelated industries.",
    user: `${instructions}\n\nInput: ${JSON.stringify(prompt)}`,
  });

  const parsed = tryParseJson(text);
  return assertDraft(parsed);
}
