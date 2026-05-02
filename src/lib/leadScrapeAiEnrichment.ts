import { generateText } from "@/lib/ai";

export type LeadScrapeAiEnrichment = {
  synopsis: string | null;
  contactPerson: string | null;
  alternateEmails: string[];
  secondaryPhones: string[];
  businessFacts: string[];
  isChain: boolean | null;
  sourceUrls: string[];
};

function isAiConfigured() {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY);
}

function safeOneLine(value: unknown, maxLen: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function safeMultiline(value: unknown, maxLen: number) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLen);
}

function stripHtml(html: string) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tryParseJsonObject<T extends Record<string, unknown>>(raw: string): T | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const normalized = text.startsWith("```") ? text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim() : text;
  try {
    const value = JSON.parse(normalized) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as T;
  } catch {
    return null;
  }
}

function normalizeEmailList(input: unknown, exclude: string[] = []) {
  const excludeSet = new Set(exclude.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
  const values = Array.isArray(input) ? input : [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const email = String(value || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (excludeSet.has(email) || seen.has(email)) continue;
    seen.add(email);
    next.push(email);
    if (next.length >= 6) break;
  }
  return next;
}

function normalizePhone(value: unknown): string | null {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

function normalizePhoneList(input: unknown, exclude: string[] = []) {
  const excludeSet = new Set(exclude.map((value) => normalizePhone(value)).filter((value): value is string => Boolean(value)));
  const values = Array.isArray(input) ? input : [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const phone = normalizePhone(value);
    if (!phone || excludeSet.has(phone) || seen.has(phone)) continue;
    seen.add(phone);
    next.push(phone);
    if (next.length >= 6) break;
  }
  return next;
}

function normalizeFacts(input: unknown) {
  const values = Array.isArray(input) ? input : [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const fact = safeOneLine(value, 220);
    const key = fact.toLowerCase();
    if (!fact || seen.has(key)) continue;
    seen.add(key);
    next.push(fact);
    if (next.length >= 8) break;
  }
  return next;
}

function extractEmails(raw: string) {
  return normalizeEmailList(Array.from(new Set((String(raw || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((value) => value.toLowerCase()))));
}

function extractPhones(raw: string) {
  return normalizePhoneList(String(raw || "").match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g) || []);
}

function websiteCandidates(website: string | null | undefined) {
  const raw = String(website || "").trim();
  if (!raw) return [];

  try {
    const parsed = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
    const base = parsed.origin;
    return Array.from(new Set([parsed.toString(), new URL("/about", base).toString(), new URL("/contact", base).toString()])).slice(0, 3);
  } catch {
    return [];
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function fetchWebsiteSnapshot(url: string): Promise<{ url: string; text: string; emails: string[]; phones: string[] } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "PurelyAutomation/1.0 (lead-scraping enrichment)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text().catch(() => "");
    const text = stripHtml(html).slice(0, 5000);
    if (!text) return null;
    return {
      url,
      text,
      emails: extractEmails(`${html}\n${text}`),
      phones: extractPhones(`${html}\n${text}`),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackSynopsis(opts: {
  businessName: string;
  niche?: string | null;
  address?: string | null;
  website?: string | null;
  contactPerson?: string | null;
  facts?: string[];
}) {
  const sentences: string[] = [];
  const descriptor = [opts.niche ? `${safeOneLine(opts.niche, 120)} business` : "business", opts.address ? `in ${safeOneLine(opts.address, 180)}` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (descriptor) {
    sentences.push(`${safeOneLine(opts.businessName, 160)} appears to be a ${descriptor}.`);
  } else {
    sentences.push(`${safeOneLine(opts.businessName, 160)} appears to be an active business lead.`);
  }
  if (opts.contactPerson) {
    sentences.push(`A likely contact name surfaced as ${safeOneLine(opts.contactPerson, 120)}.`);
  }
  if (opts.website) {
    sentences.push(`The website ${safeOneLine(opts.website, 220)} was available during enrichment.`);
  }
  if (Array.isArray(opts.facts) && opts.facts.length) {
    sentences.push(opts.facts.slice(0, 2).map((fact) => safeOneLine(fact, 180)).join(" "));
  }
  return safeMultiline(sentences.join(" "), 420) || null;
}

export async function enrichLeadScrapeBusiness(opts: {
  businessName: string;
  niche?: string | null;
  address?: string | null;
  website?: string | null;
  existingEmail?: string | null;
  existingPhone?: string | null;
  placeDetails?: unknown;
}): Promise<{
  enrichment: LeadScrapeAiEnrichment | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
}> {
  const sourceUrls: string[] = [];
  const snapshots = (
    await Promise.all(websiteCandidates(opts.website).map(async (candidate) => await fetchWebsiteSnapshot(candidate)))
  ).filter((snapshot): snapshot is { url: string; text: string; emails: string[]; phones: string[] } => Boolean(snapshot));
  for (const snapshot of snapshots) {
    sourceUrls.push(snapshot.url);
  }

  const extractedEmails = normalizeEmailList(
    snapshots.flatMap((snapshot) => snapshot.emails),
    [opts.existingEmail || ""],
  );
  const extractedPhones = normalizePhoneList(
    snapshots.flatMap((snapshot) => snapshot.phones),
    [opts.existingPhone || ""],
  );

  let contactPerson: string | null = null;
  let businessFacts: string[] = [];
  let isChain: boolean | null = null;
  let synopsis: string | null = null;

  const snippets = snapshots
    .map((snapshot, index) => `Source ${index + 1}: ${snapshot.url}\n${safeMultiline(snapshot.text, 2200)}`)
    .join("\n\n")
    .slice(0, 6500);

  if (isAiConfigured() && (snippets || opts.placeDetails)) {
    const system =
      "You summarize business lead research. Return ONLY valid JSON with keys: synopsis, contactPerson, alternateEmails, secondaryPhones, businessFacts, isChain. " +
      "Use only facts supported by the provided source material. synopsis should be 2-4 plain sentences. Use null or empty arrays when unknown.";

    const user =
      `Business name: ${safeOneLine(opts.businessName, 200)}\n` +
      `Niche: ${safeOneLine(opts.niche || "", 160)}\n` +
      `Address: ${safeOneLine(opts.address || "", 240)}\n` +
      `Website: ${safeOneLine(opts.website || "", 320)}\n` +
      `Known phone: ${safeOneLine(opts.existingPhone || "", 40)}\n` +
      `Known email: ${safeOneLine(opts.existingEmail || "", 120)}\n` +
      `Google place details JSON: ${safeMultiline(JSON.stringify(opts.placeDetails ?? null), 3500)}\n\n` +
      `Website source snippets:\n${snippets || "(none)"}\n\n` +
      "Return JSON only.";

    try {
      const raw = await withTimeout(
        generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4", temperature: 0.2 }),
        12000,
      );
      const parsed = tryParseJsonObject<{
        synopsis?: unknown;
        contactPerson?: unknown;
        alternateEmails?: unknown;
        secondaryPhones?: unknown;
        businessFacts?: unknown;
        isChain?: unknown;
      }>(raw);

      if (parsed) {
        synopsis = safeMultiline(typeof parsed.synopsis === "string" ? parsed.synopsis : "", 420) || null;
        contactPerson = safeOneLine(typeof parsed.contactPerson === "string" ? parsed.contactPerson : "", 120) || null;
        businessFacts = normalizeFacts(parsed.businessFacts);
        isChain = typeof parsed.isChain === "boolean" ? parsed.isChain : null;

        const aiEmails = normalizeEmailList(parsed.alternateEmails, [opts.existingEmail || "", ...extractedEmails]);
        const aiPhones = normalizePhoneList(parsed.secondaryPhones, [opts.existingPhone || "", ...extractedPhones]);
        extractedEmails.push(...aiEmails.filter((value) => !extractedEmails.includes(value)));
        extractedPhones.push(...aiPhones.filter((value) => !extractedPhones.includes(value)));
      }
    } catch {
      // Ignore AI errors and fall back to deterministic enrichment.
    }
  }

  synopsis = synopsis || fallbackSynopsis({
    businessName: opts.businessName,
    niche: opts.niche,
    address: opts.address,
    website: opts.website,
    contactPerson,
    facts: businessFacts,
  });

  const enrichment: LeadScrapeAiEnrichment | null =
    synopsis || contactPerson || extractedEmails.length || extractedPhones.length || businessFacts.length || sourceUrls.length
      ? {
          synopsis,
          contactPerson,
          alternateEmails: extractedEmails.slice(0, 6),
          secondaryPhones: extractedPhones.slice(0, 6),
          businessFacts: businessFacts.slice(0, 8),
          isChain,
          sourceUrls: sourceUrls.slice(0, 3),
        }
      : null;

  return {
    enrichment,
    primaryEmail: opts.existingEmail || extractedEmails[0] || null,
    primaryPhone: normalizePhone(opts.existingPhone) || extractedPhones[0] || null,
  };
}
