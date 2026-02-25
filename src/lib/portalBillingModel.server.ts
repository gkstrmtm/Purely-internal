import { prisma } from "@/lib/db";
import type { PortalVariant } from "@/lib/portalVariant";
import {
  getPortalBillingModel,
  PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG,
  type PortalBillingModel,
} from "@/lib/portalBillingModel";

function parseOverride(dataJson: unknown): PortalBillingModel | null {
  if (!dataJson || typeof dataJson !== "object" || Array.isArray(dataJson)) return null;
  const rec = dataJson as Record<string, unknown>;

  const rawModel = typeof rec.billingModel === "string" ? rec.billingModel.trim().toLowerCase() : "";
  if (rawModel === "credits" || rawModel === "credit" || rawModel === "credits_only" || rawModel === "credits-only") {
    return "credits";
  }
  if (rawModel === "subscription" || rawModel === "subs" || rawModel === "stripe") {
    return "subscription";
  }

  const rawCreditsOnly = rec.creditsOnly;
  if (typeof rawCreditsOnly === "boolean") return rawCreditsOnly ? "credits" : "subscription";

  return null;
}

export async function getPortalBillingModelForOwner(opts: {
  ownerId: string;
  portalVariant: PortalVariant;
}): Promise<PortalBillingModel> {
  // The /credit product should remain controlled by env defaults.
  if (opts.portalVariant === "credit") return getPortalBillingModel(opts.portalVariant);

  const fromEnv = getPortalBillingModel(opts.portalVariant);

  const row = await prisma.portalServiceSetup
    .findUnique({
      where: {
        ownerId_serviceSlug: {
          ownerId: opts.ownerId,
          serviceSlug: PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG,
        },
      },
      select: { dataJson: true },
    })
    .catch(() => null);

  const override = parseOverride(row?.dataJson);
  return override ?? fromEnv;
}
