import { generatePuraText as generateText } from "@/lib/puraAi";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { getDefaultHostedPagePrompt, getHostedPageDocument, updateHostedPageDocument } from "@/lib/hostedPageDocuments";

type HostedPageAiAttachment = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

function clampText(value: string, maxLen: number) {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}\n<!-- truncated -->`;
}

function extractHtml(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const fenced = text.match(/```html\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const anyFence = text.match(/```\s*([\s\S]*?)\s*```/);
  if (anyFence?.[1]) return anyFence[1].trim();

  return text;
}

function extractJson(raw: string): unknown {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ? fenced[1].trim() : "";
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function extractAiQuestion(raw: string): string | null {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const question = typeof (parsed as any).question === "string" ? String((parsed as any).question).trim() : "";
  if (!question) return null;
  return question.slice(0, 800);
}

function sanitizeGeneratedHtmlLinks(html: string): string {
  let out = String(html || "");
  if (!out) return out;

  out = out
    .replace(/https?:\/\/(?:www\.)?(?:example\.com|yourdomain\.com|placeholder\.com|test\.com)([^"'\s>]*)/gi, "https://purelyautomation.com$1")
    .replace(/href=(['"])\s*javascript:[^'"]*\1/gi, 'href="https://purelyautomation.com"')
    .replace(/href=(['"])\s*(?:#|)\s*\1/gi, 'href="https://purelyautomation.com"');

  return out;
}

function coerceAttachments(raw: unknown): HostedPageAiAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: HostedPageAiAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url = typeof (item as any).url === "string" ? (item as any).url.trim() : "";
    if (!url) continue;
    const fileName = typeof (item as any).fileName === "string" ? (item as any).fileName.trim() : undefined;
    const mimeType = typeof (item as any).mimeType === "string" ? (item as any).mimeType.trim() : undefined;
    out.push({ url, fileName, mimeType });
    if (out.length >= 12) break;
  }
  return out;
}

function toAbsoluteUrl(origin: string | null | undefined, url: string): string {
  const clean = String(url || "").trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (!origin) return clean;
  try {
    return new URL(clean, origin).toString();
  } catch {
    return clean;
  }
}

function extractExplicitAudienceOverride(promptRaw: string): string | null {
  const prompt = String(promptRaw || "").trim();
  if (!prompt) return null;
  const patterns = [
    /\bfor\s+(.+?)(?:,|\.|\band keep\b|\bkeep\b|\band tell\b|\btell\b|\bdo not\b|\bwithout\b|$)/i,
    /\bspeaks? directly to\s+(.+?)(?:,|\.|\band\b|$)/i,
    /\btarget(?:ed)?\s+at\s+(.+?)(?:,|\.|\band\b|$)/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const value = match?.[1] ? String(match[1]).replace(/\s+/g, " ").trim() : "";
    if (value && value.length >= 3) return value.slice(0, 140);
  }
  return null;
}

export async function generateHostedPageHtml(opts: {
  ownerId: string;
  documentId: string;
  prompt: string;
  currentHtml?: string | null;
  attachments?: unknown;
  requestOrigin?: string | null;
}) {
  const ownerId = String(opts.ownerId || "").trim();
  const documentId = String(opts.documentId || "").trim();
  const prompt = String(opts.prompt || "").trim();
  if (!ownerId || !documentId || !prompt) return null;

  const document = await getHostedPageDocument(ownerId, documentId);
  if (!document) return null;

  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const attachments = coerceAttachments(opts.attachments);
  const effectiveCurrentHtml =
    (typeof opts.currentHtml === "string" && opts.currentHtml.trim() ? opts.currentHtml : document.customHtml || "").trim();
  const hasCurrentHtml = Boolean(effectiveCurrentHtml);
  const generatorPrompt = getDefaultHostedPagePrompt(document.service, document);
  const explicitAudienceOverride = extractExplicitAudienceOverride(prompt);

  const system = [
    "You generate a single self-contained HTML document for a hosted business page inside Purely Automation.",
    "If the request is ambiguous or missing key details, ask ONE concise follow-up question instead of guessing.",
    "If the user explicitly gives a target audience, industry, offer, tone, or style direction, treat that as authoritative and proceed without asking them to reconfirm the same change.",
    "Do not ask whether the business context should remain the same when the prompt already clearly says what audience or style to write for.",
    "Return EITHER:",
    "- A single ```html fenced block containing the full HTML document, OR",
    '- A single ```json fenced block: { "question": "..." }',
    "Do NOT output anything else.",
    "Constraints:",
    "- Use plain HTML + inline <style>. No external JS/CSS, no frameworks.",
    "- Mobile-first, polished, premium styling with clean spacing and clear hierarchy.",
    "- Use real, usable href values. Never output javascript: links, empty hrefs, placeholder domains, or # buttons.",
    "- Prefer content tailored to the business context and service rather than generic filler copy.",
    "- Keep the page compatible with hosted business pages for reviews, booking, newsletter, and blogs.",
    hasCurrentHtml
      ? "Editing mode: You will be given CURRENT_HTML. Apply the user instruction and return the FULL updated HTML document."
      : "Generation mode: Create a new HTML document from the instruction.",
    "Hosted page brief:",
    generatorPrompt,
  ].join("\n");

  const attachmentsBlock = attachments.length
    ? [
        "",
        "ATTACHMENTS:",
        ...attachments.map((attachment) => {
          const name = attachment.fileName ? ` ${attachment.fileName}` : "";
          const mime = attachment.mimeType ? ` (${attachment.mimeType})` : "";
          const url = toAbsoluteUrl(opts.requestOrigin, attachment.url);
          return `- ${name}${mime}: ${url}`.trim();
        }),
        "",
      ].join("\n")
    : "";

  const user = [
    businessContext ? businessContext : "",
    `Hosted page service: ${document.service}`,
    `Document title: ${document.title}`,
    `Document key: ${document.pageKey}`,
    `Current editor mode: ${document.editorMode}`,
    explicitAudienceOverride
      ? `EXPLICIT USER OVERRIDE: Target the page toward ${explicitAudienceOverride}. Treat this as the new audience/context for this request and do not ask the user to reconfirm it.`
      : "",
    hasCurrentHtml ? ["CURRENT_HTML:", "```html", clampText(effectiveCurrentHtml, 24000), "```", ""].join("\n") : "",
    prompt,
    attachmentsBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const aiRaw = String(await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4" })).trim();
  const question = extractAiQuestion(aiRaw);

  const prevChat = Array.isArray(document.customChatJson) ? (document.customChatJson as any[]) : [];
  const userMsg = { role: "user", content: prompt, at: new Date().toISOString() };

  if (question) {
    const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
    const updated = await updateHostedPageDocument(ownerId, documentId, {
      customChatJson: [...prevChat, userMsg, assistantMsg].slice(-40),
    });

    return {
      ok: true as const,
      question,
      document: updated ?? document,
      generatorPrompt,
    };
  }

  const html = sanitizeGeneratedHtmlLinks(extractHtml(aiRaw));
  const assistantMsg = {
    role: "assistant",
    content: "Done. I generated updated hosted-page HTML you can preview, refine, or publish next.",
    at: new Date().toISOString(),
  };

  const updated = await updateHostedPageDocument(ownerId, documentId, {
    customHtml: html,
    editorMode: "CUSTOM_HTML",
    customChatJson: [...prevChat, userMsg, assistantMsg].slice(-40),
  });

  return {
    ok: true as const,
    html,
    document: updated ?? document,
    generatorPrompt,
    question: null,
  };
}
