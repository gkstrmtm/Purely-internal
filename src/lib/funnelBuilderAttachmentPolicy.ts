const TRUSTED_HOST_ENV_KEYS = [
  "APP_URL",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  "BLOB_READ_WRITE_URL",
  "NEXT_PUBLIC_BLOB_BASE_URL",
];

function tryParseUrl(raw: string) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function hostCandidatesFromEnv(): Set<string> {
  const hosts = new Set<string>();
  for (const key of TRUSTED_HOST_ENV_KEYS) {
    const raw = String(process.env[key] || "").trim();
    if (!raw) continue;
    const candidate = raw.includes("://") ? raw : `https://${raw}`;
    const parsed = tryParseUrl(candidate);
    const hostname = parsed?.hostname.trim().toLowerCase();
    if (hostname) hosts.add(hostname);
  }
  return hosts;
}

function isPrivateIpv4Hostname(hostname: string) {
  const match = /^((?:\d{1,3}\.){3}\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const parts = match[1].split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function isBlockedHostname(hostname: string, requestHostname?: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (requestHostname && normalized === requestHostname) return false;
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") return true;
  if (normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  if (normalized.startsWith("[") && normalized.includes(":")) return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (isPrivateIpv4Hostname(normalized)) return true;
  return false;
}

function isTrustedHostname(hostname: string, requestHostname: string) {
  const trustedHosts = hostCandidatesFromEnv();
  trustedHosts.add(requestHostname);
  if (trustedHosts.has(hostname)) return true;
  for (const trusted of trustedHosts) {
    if (hostname.endsWith(`.${trusted}`)) return true;
  }
  return false;
}

export function toAbsoluteRequestUrl(req: Request, rawUrl: string) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return new URL(trimmed, new URL(req.url).origin).toString();
}

export function sanitizeTrustedAiAttachmentUrl(req: Request, rawUrl: string, opts?: { allowDataImage?: boolean }) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return null;
  if (opts?.allowDataImage !== false && /^data:image\//i.test(trimmed)) return trimmed;

  const absolute = toAbsoluteRequestUrl(req, trimmed);
  const parsed = tryParseUrl(absolute);
  if (!parsed) return null;

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.trim().toLowerCase();
  const requestHostname = new URL(req.url).hostname.trim().toLowerCase();
  if ((protocol !== "https:" && protocol !== "http:") || !hostname) return null;
  if (parsed.username || parsed.password) return null;
  if (isBlockedHostname(hostname, requestHostname)) return null;
  if (!isTrustedHostname(hostname, requestHostname)) return null;
  return parsed.toString();
}

export function canImportRemoteMediaUrl(req: Request, rawUrl: string) {
  const trimmed = String(rawUrl || "").trim();
  const parsed = tryParseUrl(trimmed);
  if (!parsed) return false;

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.trim().toLowerCase();
  const requestHostname = new URL(req.url).hostname.trim().toLowerCase();
  if (!hostname) return false;
  if (parsed.username || parsed.password) return false;
  if (isBlockedHostname(hostname, requestHostname)) return false;
  if (protocol === "https:") return true;
  return protocol === "http:" && hostname === requestHostname;
}