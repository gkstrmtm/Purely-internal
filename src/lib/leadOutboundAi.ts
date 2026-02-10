import { generateText } from "@/lib/ai";
import type { LeadTemplateVars } from "@/lib/leadOutbound";

function isAiConfigured() {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY);
}

function safeOneLine(s: string, maxLen: number) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function safeMultiline(s: string, maxLen: number) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function tryParseJsonObject<T extends Record<string, unknown>>(raw: string): T | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const v = JSON.parse(text) as any;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as T;
  } catch {
    return null;
  }
}

export async function draftLeadOutboundEmail(opts: {
  lead: LeadTemplateVars;
  resources?: Array<{ label: string; url: string }>;
  fromName?: string;
}): Promise<{ subject: string; text: string } | null> {
  if (!isAiConfigured()) return null;

  const resources = Array.isArray(opts.resources) ? opts.resources : [];

  const system =
    "You draft concise, friendly outbound emails to business leads. " +
    "Return ONLY valid JSON with keys: subject, text. " +
    "Use plain text, no markdown. Keep subject <= 80 chars, body <= 1200 chars. " +
    "Do not invent facts. If a field is missing, omit it naturally.";

  const user =
    "Draft a cold outreach email.\n\n" +
    `From name: ${safeOneLine(opts.fromName || "", 80)}\n` +
    `Business name: ${safeOneLine(opts.lead.businessName, 200)}\n` +
    `Niche: ${safeOneLine(opts.lead.niche || "", 200)}\n` +
    `Website: ${safeOneLine(opts.lead.website || "", 300)}\n` +
    `Phone: ${safeOneLine(opts.lead.phone || "", 80)}\n` +
    `Address: ${safeOneLine(opts.lead.address || "", 300)}\n` +
    (resources.length
      ? `\nResources you may reference:\n${resources
          .slice(0, 5)
          .map((r) => `- ${safeOneLine(r.label, 120)}: ${safeOneLine(r.url, 500)}`)
          .join("\n")}`
      : "") +
    "\n\nOutput JSON only.";

  const raw = await generateText({ system, user });
  const parsed = tryParseJsonObject<{ subject?: unknown; text?: unknown }>(raw);
  if (!parsed) return null;

  const subject = safeOneLine(typeof parsed.subject === "string" ? parsed.subject : "", 120);
  const text = safeMultiline(typeof parsed.text === "string" ? parsed.text : "", 20000);

  if (!subject && !text) return null;
  return { subject, text };
}

export async function draftLeadOutboundSms(opts: {
  lead: LeadTemplateVars;
  resources?: Array<{ label: string; url: string }>;
  fromName?: string;
}): Promise<string | null> {
  if (!isAiConfigured()) return null;

  const resources = Array.isArray(opts.resources) ? opts.resources : [];

  const system =
    "You draft concise outbound SMS messages to business leads. " +
    "Return ONLY valid JSON with key: text. " +
    "Use plain text, no markdown. Keep text <= 320 chars. " +
    "Do not invent facts. If a field is missing, omit it naturally.";

  const user =
    "Draft a short cold outreach SMS.\n\n" +
    `From name: ${safeOneLine(opts.fromName || "", 80)}\n` +
    `Business name: ${safeOneLine(opts.lead.businessName, 200)}\n` +
    `Niche: ${safeOneLine(opts.lead.niche || "", 200)}\n` +
    `Website: ${safeOneLine(opts.lead.website || "", 300)}\n` +
    `Phone: ${safeOneLine(opts.lead.phone || "", 80)}\n` +
    `Address: ${safeOneLine(opts.lead.address || "", 300)}\n` +
    (resources.length
      ? `\nResources you may reference:\n${resources
          .slice(0, 2)
          .map((r) => `- ${safeOneLine(r.label, 120)}: ${safeOneLine(r.url, 500)}`)
          .join("\n")}`
      : "") +
    "\n\nOutput JSON only.";

  const raw = await generateText({ system, user });
  const parsed = tryParseJsonObject<{ text?: unknown }>(raw);
  if (!parsed) return null;

  const text = safeMultiline(typeof parsed.text === "string" ? parsed.text : "", 900);
  if (!text.trim()) return null;
  return text;
}
