import { apiFetch } from "./client";

export type PortalOnboardingCheckoutResult =
  | { ok: true; url: string; sessionId: string }
  | { ok: true; bypass: true; couponCode?: string | null }
  | { ok: false; error?: string };

export async function portalOnboardingCheckout(input: {
  planIds: string[];
  planQuantities?: Record<string, number>;
  couponCode?: string;
}): Promise<PortalOnboardingCheckoutResult> {
  const res = await apiFetch<PortalOnboardingCheckoutResult>("/api/portal/billing/onboarding-checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return res;
}

export type PortalOnboardingConfirmResult =
  | { ok: true }
  | { ok: false; error?: string };

export async function portalOnboardingConfirm(input: {
  sessionId?: string;
  bypass?: boolean;
}): Promise<void> {
  const res = await apiFetch<PortalOnboardingConfirmResult>("/api/portal/billing/onboarding-confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });

  if ((res as any)?.ok !== true) {
    const msg = typeof (res as any)?.error === "string" ? String((res as any).error) : "Unable to confirm checkout";
    throw new Error(msg);
  }
}
