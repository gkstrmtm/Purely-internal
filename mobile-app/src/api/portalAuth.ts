import { apiFetch } from "./client";
import { AppConfig } from "../config/app";

export async function portalLogin(email: string, password: string): Promise<void> {
  const res = await fetch("/portal/api/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
    },
    credentials: "include",
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
}

export type PortalLogoutResponse = { ok: true } | { error: string };

export async function portalLogout(): Promise<void> {
  await apiFetch<PortalLogoutResponse>("/portal/api/logout", {
    method: "POST",
    headers: {
      [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
    },
  });
}
