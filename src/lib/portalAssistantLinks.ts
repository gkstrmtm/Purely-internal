const DEFAULT_ASSISTANT_BASE_URL = "https://purelyautomation.com";

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
    if (parsed.hostname === "purelyautomation.com" || parsed.hostname.endsWith(".purelyautomation.com")) {
      parsed.protocol = "https:";
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
