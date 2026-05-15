export const PURELY_HOSTED_ORIGIN = "https://purelyautomation.com";

function normalizePath(pathname: string): string {
  const p = String(pathname || "").trim();
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

function normalizeOrigin(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function readHostname(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).hostname.trim().toLowerCase();
  } catch {}
  return value.replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0]?.trim().toLowerCase() || "";
}

export function isLocalHostedHost(raw: string | null | undefined): boolean {
  const host = readHostname(String(raw || ""));
  return Boolean(host) && (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local"));
}

export function toRuntimeHostedUrl(pathname: string, runtimeOrigin?: string | null): string {
  const origin = String(runtimeOrigin || "").trim();
  if (origin && isLocalHostedHost(origin)) return `${origin}${normalizePath(pathname)}`;
  return toPurelyHostedUrl(pathname);
}

export function toAbsoluteUrl(pathname: string, origin: string): string | null {
  const absoluteOrigin = normalizeOrigin(origin);
  if (!absoluteOrigin) return null;
  return `${absoluteOrigin}${normalizePath(pathname)}`;
}

export function toCustomDomainUrl(pathname: string, domain: string): string | null {
  const host = readHostname(domain);
  if (!host) return null;
  return `https://${host}${normalizePath(pathname)}`;
}

export function toPurelyHostedUrl(pathname: string): string {
  return toAbsoluteUrl(pathname, PURELY_HOSTED_ORIGIN) || `${PURELY_HOSTED_ORIGIN}${normalizePath(pathname)}`;
}
