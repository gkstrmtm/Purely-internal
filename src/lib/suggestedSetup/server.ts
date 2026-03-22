import { prisma } from "@/lib/db";
import { resolveEntitlementsForOwnerId } from "@/lib/entitlements";
import type { Entitlements } from "@/lib/entitlements";

import type { ActivationProfile, SuggestedSetupPreview, SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { proposeBlogsAutomationSettings, proposeBlogsCreateSite } from "@/lib/suggestedSetup/blogs";

function goalsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 10) break;
  }
  return out;
}

export async function buildSuggestedSetupPreviewForOwner(ownerId: string): Promise<{
  entitlements: Entitlements;
  preview: SuggestedSetupPreview;
}> {
  const entitlements = await resolveEntitlementsForOwnerId(ownerId);

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: {
      businessName: true,
      websiteUrl: true,
      industry: true,
      businessModel: true,
      primaryGoals: true,
      targetCustomer: true,
      brandVoice: true,
      logoUrl: true,
      brandPrimaryHex: true,
      brandSecondaryHex: true,
      brandAccentHex: true,
      brandTextHex: true,
      brandFontFamily: true,
      brandFontGoogleFamily: true,
    },
  });

  const activationProfile: ActivationProfile = {
    businessName: profile?.businessName ?? "",
    websiteUrl: profile?.websiteUrl ?? null,
    industry: profile?.industry ?? null,
    businessModel: profile?.businessModel ?? null,
    primaryGoals: goalsFromJson(profile?.primaryGoals),
    targetCustomer: profile?.targetCustomer ?? null,
    brandVoice: profile?.brandVoice ?? null,
    brand: {
      logoUrl: profile?.logoUrl ?? null,
      primaryHex: profile?.brandPrimaryHex ?? null,
      secondaryHex: profile?.brandSecondaryHex ?? null,
      accentHex: profile?.brandAccentHex ?? null,
      textHex: profile?.brandTextHex ?? null,
      fontFamily: profile?.brandFontFamily ?? null,
      fontGoogleFamily: profile?.brandFontGoogleFamily ?? null,
    },
    size: "small",
    tone: "professional",
  };

  const actions: SuggestedSetupAction[] = [];

  // Blogs
  if (entitlements.blog) {
    const [site, setup] = await Promise.all([
      prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }).catch(() => null),
      prisma.portalServiceSetup
        .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } }, select: { dataJson: true } })
        .catch(() => null),
    ]);

    const setupRec = setup?.dataJson && typeof setup.dataJson === "object" ? (setup.dataJson as any) : null;
    const enabledNow = Boolean(setupRec?.enabled);
    const topicsNow = Array.isArray(setupRec?.topics) ? setupRec.topics.filter((t: any) => typeof t === "string").slice(0, 50) : [];

    const a1 = proposeBlogsCreateSite({ businessName: activationProfile.businessName, exists: Boolean(site?.id) });
    if (a1) actions.push(a1);

    const a2 = proposeBlogsAutomationSettings({ enabledNow, topicsNow });
    if (a2) actions.push(a2);
  }

  return {
    entitlements,
    preview: {
      activationProfile,
      proposedActions: actions,
    },
  };
}
