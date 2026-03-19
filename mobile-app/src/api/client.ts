import { AppConfig } from "../config/app";

import { getPortalBearerToken } from "../auth/portalToken";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly bodyText?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function resolveApiUrl(path: string): string {
  // Critical for web builds: keep requests same-origin so the portal session cookie
  // (set by `/portal/api/login`) is attached to `/api/*` calls via Vercel rewrites.
  // If we use an absolute base URL on web, the cookie will be stored on that other
  // domain and `portalMe()` will never see the session.
  const isBrowser = typeof window !== "undefined";
  const base = isBrowser ? "" : (AppConfig.apiBaseUrl || "").trim();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base.replace(/\/$/, "")}${normalizedPath}` : normalizedPath;
}

export async function apiFetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const url = resolveApiUrl(path);

  const token = await getPortalBearerToken();
  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers,
  });
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetchRaw(path, init);

  if (!res.ok) {
    const text = await res.text().catch(() => undefined);
    throw new ApiError(`Request failed: ${res.status}`, res.status, text);
  }

  const text = await res.text().catch(() => "");
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    // Some endpoints may return non-JSON (rare). Keep it usable.
    return text as unknown as T;
  }
}
