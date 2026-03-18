import { apiFetch } from "./client";
import { AppConfig } from "../config/app";

export type PortalLoginResponse = { ok: true } | { error: string };

export async function portalLogin(email: string, password: string): Promise<void> {
  const res = await apiFetch<PortalLoginResponse>("/portal/api/login", {
    method: "POST",
    headers: {
      [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
    },
    body: JSON.stringify({ email, password }),
  });

  if ((res as any)?.ok !== true) {
    const msg = typeof (res as any)?.error === "string" ? String((res as any).error) : "Invalid email or password";
    throw new Error(msg);
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
