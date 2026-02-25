import type { PortalVariant } from "@/lib/portalVariant";

export type PortalBillingModel = "subscription" | "credits";

function normalizeBillingModel(raw: unknown): PortalBillingModel | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "subscription" || v === "subs" || v === "stripe") return "subscription";
  if (v === "credits" || v === "credit" || v === "credits_only" || v === "credits-only") return "credits";
  return null;
}

export function getPortalBillingModel(variant: PortalVariant): PortalBillingModel {
  const envKey = variant === "credit" ? "PORTAL_BILLING_MODEL_CREDIT" : "PORTAL_BILLING_MODEL_PORTAL";
  const fromVariant = normalizeBillingModel(process.env[envKey]);
  if (fromVariant) return fromVariant;

  const fromGlobal = normalizeBillingModel(process.env.PORTAL_BILLING_MODEL);
  if (fromGlobal) return fromGlobal;

  // Defaults:
  // - /portal: Stripe subscriptions (modules) + credits for usage
  // - /credit: credits-first product
  return variant === "credit" ? "credits" : "subscription";
}

export function isCreditsOnlyBilling(model: PortalBillingModel): boolean {
  return model === "credits";
}
