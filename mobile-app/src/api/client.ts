import { AppConfig } from "../config/app";

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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = (AppConfig.apiBaseUrl || "").trim();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = base ? `${base.replace(/\/$/, "")}${normalizedPath}` : normalizedPath;

  const res = await fetch(url, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

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
