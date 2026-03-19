import { apiFetch, apiFetchRaw } from "./client";
import { AppConfig } from "../config/app";
import { clearPortalBearerToken, setPortalBearerToken } from "../auth/portalToken";

export async function portalLogin(email: string, password: string): Promise<void> {
  const isBrowser = typeof window !== "undefined";
  const res = await apiFetchRaw("/portal/api/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
      ...(isBrowser ? {} : { "x-pa-return-token": "1" }),
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let message = "Incorrect username or incorrect password";
    try {
      const data = (await res.json()) as { error?: string };
      if (typeof data?.error === "string" && data.error.trim()) {
        message = data.error.trim();
      }
    } catch {
      // fall back to default message
    }
    throw new Error(message);
  }

  // On native, prefer bearer token auth (cookie persistence is inconsistent across platforms).
  if (!isBrowser) {
    try {
      const data = (await res.json().catch(() => null)) as any;
      const token = typeof data?.token === "string" ? data.token.trim() : "";
      if (token) await setPortalBearerToken(token);
    } catch {
      // ignore
    }
  }
}

export type PortalLogoutResponse = { ok: true } | { error: string };

export async function portalLogout(): Promise<void> {
  await clearPortalBearerToken().catch(() => {});
  await apiFetch<PortalLogoutResponse>("/portal/api/logout", {
    method: "POST",
    headers: {
      [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
    },
  });
}
