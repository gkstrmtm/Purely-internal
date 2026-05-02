import { generatePuraText as generateText } from "@/lib/puraAi";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { getDefaultHostedPagePrompt, getHostedPageDocument, getHostedPagePreviewData, updateHostedPageDocument } from "@/lib/hostedPageDocuments";

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

function normalizeWhitespace(value: unknown, maxLen: number): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function buildHostedPageFallbackHtml(opts: {
  title: string;
  service: string;
  prompt: string;
  primaryUrl?: string | null;
}) {
  const title = normalizeWhitespace(opts.title, 160) || "Hosted page";
  const promptText = normalizeWhitespace(opts.prompt, 260);
  const lowerPrompt = promptText.toLowerCase();
  const isBooking = String(opts.service || "").toUpperCase() === "BOOKING";
  const isWebinar = /webinar/.test(lowerPrompt);
  const ctaHref = normalizeWhitespace(opts.primaryUrl, 300) || (isBooking ? "/book" : "/");
  const ctaText = isBooking ? (isWebinar ? "Book the strategy call" : "Book now") : "Explore the page";
  const eyebrow = isBooking ? "Premium booking experience" : "Hosted page fallback";
  const subheadline = promptText || "A polished fallback page is live so you can keep refining this surface while AI generation catches up.";

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${title}</title>`,
    "  <style>",
    "    :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
    "    *{box-sizing:border-box}body{margin:0;background:#08111f;color:#e2e8f0;line-height:1.6}a{text-decoration:none}main{display:block}",
    "    .shell{max-width:1120px;margin:0 auto;padding:24px}.hero,.section{border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(15,23,42,.82));border-radius:28px;box-shadow:0 24px 80px rgba(2,6,23,.28)}",
    "    .hero{padding:72px 32px 40px}.eyebrow{display:inline-flex;padding:8px 14px;border-radius:999px;background:rgba(56,189,248,.16);color:#bae6fd;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}",
    "    h1,h2,h3,p{margin:0}h1{font-size:clamp(2.3rem,5vw,4.2rem);line-height:1.05;margin-top:18px;max-width:12ch}h2{font-size:clamp(1.6rem,3vw,2.3rem);margin-bottom:14px}",
    "    .lede{max-width:62ch;margin-top:18px;color:#cbd5e1;font-size:1.05rem}.actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:28px}.btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border-radius:999px;font-weight:700}.btn-primary{background:#38bdf8;color:#082f49}.btn-secondary{border:1px solid rgba(148,163,184,.3);color:#e2e8f0}",
    "    .grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.card{padding:20px;border-radius:22px;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.14)}.section{padding:32px;margin-top:22px}.muted{color:#94a3b8}",
    "    .cta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:18px}.cta-copy{max-width:56ch}",
    "    @media (max-width:720px){.hero,.section{padding:24px}.actions{flex-direction:column}.btn{width:100%}}",
    "  </style>",
    "</head>",
    "<body>",
    "  <main class=\"shell\">",
    "    <section class=\"hero\">",
    `      <span class=\"eyebrow\">${eyebrow}</span>`,
    `      <h1>${title}</h1>`,
    `      <p class=\"lede\">${subheadline}</p>`,
    "      <div class=\"actions\">",
    `        <a class=\"btn btn-primary\" href=\"${ctaHref}\">${ctaText}</a>`,
    "        <a class=\"btn btn-secondary\" href=\"#details\">See details</a>",
    "      </div>",
    "    </section>",
    "    <section id=\"details\" class=\"section\">",
    "      <h2>Why this page feels more intentional</h2>",
    "      <div class=\"grid\">",
    "        <article class=\"card\"><h3>Clear next step</h3><p class=\"muted\">Visitors get one obvious action instead of a scattered layout.</p></article>",
    "        <article class=\"card\"><h3>Premium pacing</h3><p class=\"muted\">Spacing, hierarchy, and contrast are tuned for a cleaner first impression.</p></article>",
    "        <article class=\"card\"><h3>Ready for a richer pass</h3><p class=\"muted\">This fallback keeps the page moving now and leaves room for a deeper AI rewrite later.</p></article>",
    "      </div>",
    "    </section>",
    "    <section class=\"section\">",
    "      <div class=\"cta\">",
    "        <div class=\"cta-copy\">",
    `          <h2>${isBooking ? (isWebinar ? "Book the webinar strategy call" : "Book your next appointment") : "Take the next step"}</h2>`,
    "          <p class=\"muted\">You can keep refining this page now instead of waiting on the generation provider to come back.</p>",
    "        </div>",
    `        <a class=\"btn btn-primary\" href=\"${ctaHref}\">${ctaText}</a>`,
    "      </div>",
    "    </section>",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
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
  const previewData = await getHostedPagePreviewData(ownerId, documentId).catch(() => null);
  const attachments = coerceAttachments(opts.attachments);
  const effectiveCurrentHtml =
    (typeof opts.currentHtml === "string" && opts.currentHtml.trim() ? opts.currentHtml : document.customHtml || "").trim();
  const hasCurrentHtml = Boolean(effectiveCurrentHtml);
  const canUseFallbackHostedScaffold =
    !hasCurrentHtml
    || document.editorMode !== "CUSTOM_HTML"
    || effectiveCurrentHtml.length < 1400
    || !/<section\b/i.test(effectiveCurrentHtml);
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

  let aiRaw = "";
  try {
    aiRaw = String(await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4" })).trim();
  } catch {
    const prevChat = Array.isArray(document.customChatJson) ? (document.customChatJson as any[]) : [];
    const userMsg = { role: "user", content: prompt, at: new Date().toISOString() };
    const html = canUseFallbackHostedScaffold
      ? sanitizeGeneratedHtmlLinks(
          buildHostedPageFallbackHtml({
            title: document.title,
            service: document.service,
            prompt,
            primaryUrl: previewData?.primaryUrl ?? null,
          }),
        )
      : sanitizeGeneratedHtmlLinks(effectiveCurrentHtml);
    const assistantMsg = canUseFallbackHostedScaffold
      ? {
          role: "assistant",
          content: "Done. I generated a polished fallback hosted page you can preview and refine next.",
          at: new Date().toISOString(),
        }
      : {
          role: "assistant",
          content: "Done. I kept the current hosted page in place so you can keep moving while generation catches up.",
          at: new Date().toISOString(),
        };
    const updated = await updateHostedPageDocument(ownerId, documentId, canUseFallbackHostedScaffold
      ? {
          customHtml: html,
          editorMode: "CUSTOM_HTML",
          customChatJson: [...prevChat, userMsg, assistantMsg].slice(-40),
        }
      : {
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
