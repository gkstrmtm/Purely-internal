import { apiFetch, apiFetchRaw } from "./client";
import { AppConfig } from "../config/app";
import { setPortalBearerToken } from "../auth/portalToken";

export type PortalSignupInput = {
  name: string;
  email: string;
  password: string;
  businessName: string;
  city: string;
  state: string;
  phone?: string;
  websiteUrl?: string;
  hasWebsite?: "YES" | "NO" | "NOT_SURE";
  callsPerMonthRange?:
    | "NOT_SURE"
    | "0_10"
    | "11_30"
    | "31_60"
    | "61_120"
    | "120_PLUS";
  acquisitionMethods?: string[];
  industry?: string;
  businessModel?: string;
  targetCustomer?: string;
  brandVoice?: string;
  goalIds?: string[];
  selectedServiceSlugs?: string[];
  selectedPlanIds?: string[];
  selectedPlanQuantities?: Record<string, number>;
  referralCode?: string;
  couponCode?: string;
  billingPreference?: "credits" | "subscription";
  selectedBundleId?: "launch-kit" | "sales-loop" | "brand-builder" | null;
};

export type PortalSignupResponse =
  | { ok: true; signedIn?: boolean }
  | { ok: false; error?: string; requestId?: string; errorKey?: string };

export async function portalSignup(input: PortalSignupInput): Promise<void> {
  const isBrowser = typeof window !== "undefined";

  // On native, ask the server to include the JWT in the response body so we can
  // use bearer auth (cookies can be flaky on device).
  if (!isBrowser) {
    const raw = await apiFetchRaw("/api/auth/client-signup", {
      method: "POST",
      headers: {
        [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
        "x-pa-return-token": "1",
      },
      body: JSON.stringify({
        ...input,
        billingPreference: input.billingPreference ?? "credits",
        selectedPlanIds: input.selectedPlanIds && input.selectedPlanIds.length > 0 ? input.selectedPlanIds : ["core"],
      }),
    });

    const data = (await raw.json().catch(() => null)) as any;
    if (!raw.ok || data?.ok !== true) {
      const msg = typeof data?.error === "string" ? String(data.error) : "Unable to create account";
      throw new Error(msg);
    }

    const token = typeof data?.token === "string" ? data.token.trim() : "";
    if (token) await setPortalBearerToken(token);
    return;
  }

  const res = await apiFetch<PortalSignupResponse>("/api/auth/client-signup", {
    method: "POST",
    headers: {
      [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
    },
    body: JSON.stringify({
      ...input,
      billingPreference: input.billingPreference ?? "credits",
      selectedPlanIds: input.selectedPlanIds && input.selectedPlanIds.length > 0 ? input.selectedPlanIds : ["core"],
    }),
  });

  if ((res as any)?.ok !== true) {
    const msg = typeof (res as any)?.error === "string" ? String((res as any).error) : "Unable to create account";
    throw new Error(msg);
  }
}
