const DEFAULT_ASSISTANT_BASE_URL = "https://purelyautomation.com";

function splitTrailingUrlPunctuation(value: string): { body: string; trailing: string } {
  let body = String(value || "");
  let trailing = "";
  while (/[.,!?;:]+$/.test(body)) {
    trailing = body.slice(-1) + trailing;
    body = body.slice(0, -1);
  }
  return { body, trailing };
}

function getAssistantBaseUrl(): string {
  const raw = String(process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_ASSISTANT_BASE_URL).trim();
  if (!raw) return DEFAULT_ASSISTANT_BASE_URL;
  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return DEFAULT_ASSISTANT_BASE_URL;
    if (!isAllowedAssistantHost(parsed.hostname)) return DEFAULT_ASSISTANT_BASE_URL;
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_ASSISTANT_BASE_URL;
  }
}

function isAllowedAssistantHost(hostname: string): boolean {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return false;
  return host === "purelyautomation.com" || host.endsWith(".purelyautomation.com") || host === "localhost" || host === "127.0.0.1";
}

export function normalizeAssistantLinkUrl(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;

  try {
    const parsed = value.startsWith("/") ? new URL(value, getAssistantBaseUrl()) : new URL(value, getAssistantBaseUrl());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!isAllowedAssistantHost(parsed.hostname)) return null;
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.hostname = "purelyautomation.com";
      parsed.port = "";
    }
    if (parsed.hostname === "purelyautomation.com" || parsed.hostname.endsWith(".purelyautomation.com")) {
      parsed.protocol = "https:";
      parsed.port = "";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function formatAssistantMarkdownLink(label: string, raw: unknown): string {
  const url = normalizeAssistantLinkUrl(raw);
  if (!url) return "";
  const safeLabel = String(label || "Open").replace(/[\[\]()]/g, "").trim() || "Open";
  return `[${safeLabel}](${url})`;
}

export function absolutizeAssistantTextLinks(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  if (!text) return "";

  let normalized = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    const nextUrl = normalizeAssistantLinkUrl(url);
    if (!nextUrl) return match;
    const safeLabel = String(label || "Open").replace(/[\r\n\t]+/g, " ").trim() || "Open";
    return `[${safeLabel}](${nextUrl})`;
  });

  normalized = normalized.replace(/\bhttps?:\/\/(?:localhost|127\.0\.0\.1|(?:[\w-]+\.)?purelyautomation\.com)(?::\d+)?[^\s)\]>]*/gi, (value) => {
    const { body, trailing } = splitTrailingUrlPunctuation(value);
    const nextUrl = normalizeAssistantLinkUrl(body);
    return `${nextUrl || body}${trailing}`;
  });

  normalized = normalized.replace(/(^|[\s(>])((?:\/(?:portal(?:\/app|\/api)?|pura-preview))[^\s)\]>]*)/g, (match, prefix, value) => {
    const { body, trailing } = splitTrailingUrlPunctuation(value);
    const nextUrl = normalizeAssistantLinkUrl(body);
    return `${prefix}${nextUrl || body}${trailing}`;
  });

  return normalized;
}
