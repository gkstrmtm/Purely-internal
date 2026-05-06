export const PURELY_HOSTED_ORIGIN = "https://purelyautomation.com";

function normalizePath(pathname: string): string {
  const p = String(pathname || "").trim();
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
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

export function toPurelyHostedUrl(pathname: string): string {
  return `${PURELY_HOSTED_ORIGIN}${normalizePath(pathname)}`;
}
