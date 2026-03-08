import type { PortalVariant } from "@/lib/portalVariant";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import { isCreditsOnlyBilling } from "@/lib/portalBillingModel";

const DEFAULT_USD_PER_CREDIT_SUBSCRIPTION = 0.1;
const DEFAULT_USD_PER_CREDIT_CREDITS_ONLY = 0.2;

export async function getUsdPerCreditForOwner(opts: {
  ownerId: string;
  portalVariant: PortalVariant;
}): Promise<number> {
  const billingModel = await getPortalBillingModelForOwner({ ownerId: opts.ownerId, portalVariant: opts.portalVariant });
  return isCreditsOnlyBilling(billingModel) ? DEFAULT_USD_PER_CREDIT_CREDITS_ONLY : DEFAULT_USD_PER_CREDIT_SUBSCRIPTION;
}

export async function getCentsPerCreditForOwner(opts: {
  ownerId: string;
  portalVariant: PortalVariant;
}): Promise<number> {
  const usd = await getUsdPerCreditForOwner(opts);
  // Must be an integer number of cents for Stripe.
  return Math.max(1, Math.round(usd * 100));
}
