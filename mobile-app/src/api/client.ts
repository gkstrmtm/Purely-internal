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
  if (!AppConfig.apiBaseUrl) throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");

  const url = `${AppConfig.apiBaseUrl.replace(/\/$/, "")}\/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => undefined);
    throw new ApiError(`Request failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as T;
}
