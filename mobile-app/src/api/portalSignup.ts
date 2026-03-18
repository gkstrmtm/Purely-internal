import { apiFetch } from "./client";
import { AppConfig } from "../config/app";

export type PortalSignupInput = {
  name: string;
  email: string;
  password: string;
  businessName: string;
  city: string;
  state: string;
};

export type PortalSignupResponse =
  | { ok: true; signedIn?: boolean }
  | { ok: false; error?: string; requestId?: string; errorKey?: string };

export async function portalSignup(input: PortalSignupInput): Promise<void> {
  const res = await apiFetch<PortalSignupResponse>("/api/auth/client-signup", {
    method: "POST",
    headers: {
      [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
    },
    body: JSON.stringify({
      ...input,
      billingPreference: "credits",
    }),
  });

  if ((res as any)?.ok !== true) {
    const msg = typeof (res as any)?.error === "string" ? String((res as any).error) : "Unable to create account";
    throw new Error(msg);
  }
}
