import type { FunnelFoundationBusinessContext } from "@/lib/funnelPageIntent";

import { assessBusinessProfileContextHealth } from "@/lib/businessProfileContextHealth";
import { resolveBusinessProfileRuntimeSnapshot } from "@/lib/businessProfileRuntimeSnapshot";
import { deriveBusinessProfileTemplateVars } from "@/lib/businessProfileTemplateVars";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getPortalBusinessProfile } from "@/lib/portalBusinessProfile.server";

type ProfileColumnFlags = {
  websiteUrl: boolean;
  industry: boolean;
  businessModel: boolean;
  primaryGoals: boolean;
  targetCustomer: boolean;
  brandVoice: boolean;
  businessContext: boolean;
  logoUrl: boolean;
  brandPrimaryHex: boolean;
  brandSecondaryHex: boolean;
  brandAccentHex: boolean;
  brandTextHex: boolean;
  brandFontFamily: boolean;
  brandFontGoogleFamily: boolean;
};

let flagsPromise: Promise<ProfileColumnFlags> | null = null;

async function getProfileColumnFlags(): Promise<ProfileColumnFlags> {
  if (!flagsPromise) {
    flagsPromise = Promise.all([
      hasPublicColumn("BusinessProfile", "websiteUrl"),
      hasPublicColumn("BusinessProfile", "industry"),
      hasPublicColumn("BusinessProfile", "businessModel"),
      hasPublicColumn("BusinessProfile", "primaryGoals"),
      hasPublicColumn("BusinessProfile", "targetCustomer"),
      hasPublicColumn("BusinessProfile", "brandVoice"),
      hasPublicColumn("BusinessProfile", "businessContext"),
      hasPublicColumn("BusinessProfile", "logoUrl"),
      hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
      hasPublicColumn("BusinessProfile", "brandSecondaryHex"),
      hasPublicColumn("BusinessProfile", "brandAccentHex"),
      hasPublicColumn("BusinessProfile", "brandTextHex"),
      hasPublicColumn("BusinessProfile", "brandFontFamily"),
      hasPublicColumn("BusinessProfile", "brandFontGoogleFamily"),
    ]).then(
      ([
        websiteUrl,
        industry,
        businessModel,
        primaryGoals,
        targetCustomer,
        brandVoice,
        businessContext,
        logoUrl,
        brandPrimaryHex,
        brandSecondaryHex,
        brandAccentHex,
        brandTextHex,
        brandFontFamily,
        brandFontGoogleFamily,
      ]) => ({
        websiteUrl,
        industry,
        businessModel,
        primaryGoals,
        targetCustomer,
        brandVoice,
        businessContext,
        logoUrl,
        brandPrimaryHex,
        brandSecondaryHex,
        brandAccentHex,
        brandTextHex,
        brandFontFamily,
        brandFontGoogleFamily,
      }),
    );
  }

  return flagsPromise;
}

function safeLine(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function safeUrl(value: unknown, maxLen: number) {
  const s = safeLine(value, maxLen);
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return s;
}

function safeGoals(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const goals = raw
    .map((g) => safeLine(g, 80))
    .filter(Boolean)
    .slice(0, 10);
  return goals;
}

function safeParagraph(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export async function getBusinessProfileFoundationContext(ownerId: string): Promise<FunnelFoundationBusinessContext | null> {
  const id = String(ownerId || "").trim();
  if (!id) return null;

  const result = await getPortalBusinessProfile({ ownerId: id }).catch(() => null);
  const json = result?.json as
    | {
        ok?: boolean;
        profile?: Record<string, unknown> | null;
        draftProfile?: Record<string, unknown> | null;
        guidedIntake?: Record<string, string[]> | null;
      }
    | undefined;
  if (!json?.ok) return null;

  const profile = resolveBusinessProfileRuntimeSnapshot({
    profile: json.profile,
    draftProfile: json.draftProfile,
    guidedIntake: json.guidedIntake,
  });

  const businessName = profile.businessName;
  const industry = profile.industry;
  const businessModel = profile.businessModel;
  const primaryGoals = profile.primaryGoals;
  const targetCustomer = profile.targetCustomer;
  const brandVoice = profile.brandVoice;
  const businessContext = profile.businessContext;

  if (!businessName && !industry && !businessModel && !primaryGoals.length && !targetCustomer && !brandVoice && !businessContext) {
    return null;
  }

  return {
    businessName: businessName || null,
    industry: industry || null,
    businessModel: businessModel || null,
    primaryGoals: primaryGoals.length ? primaryGoals : undefined,
    targetCustomer: targetCustomer || null,
    brandVoice: brandVoice || null,
    businessContext: businessContext || null,
  };
}

export async function getBusinessProfileTemplateVars(ownerId: string): Promise<Record<string, string>> {
  const id = String(ownerId || "").trim();
  if (!id) return {};

  const result = await getPortalBusinessProfile({ ownerId: id }).catch(() => null);
  const json = result?.json as
    | {
        ok?: boolean;
        profile?: Record<string, unknown> | null;
        draftProfile?: Record<string, unknown> | null;
        guidedIntake?: Record<string, string[]> | null;
      }
    | undefined;
  if (!json?.ok) return {};

  return deriveBusinessProfileTemplateVars(
    resolveBusinessProfileRuntimeSnapshot({
      profile: json.profile,
      draftProfile: json.draftProfile,
      guidedIntake: json.guidedIntake,
    }),
  );
}

export async function getBusinessProfileAiContext(ownerId: string): Promise<string> {
  const id = String(ownerId || "").trim();
  if (!id) return "";

  const result = await getPortalBusinessProfile({ ownerId: id }).catch(() => null);
  const json = result?.json as
    | {
        ok?: boolean;
        profile?: Record<string, unknown> | null;
        draftProfile?: Record<string, unknown> | null;
        guidedIntake?: Record<string, string[]> | null;
      }
    | undefined;
  if (!json?.ok) return "";

  const profile = resolveBusinessProfileRuntimeSnapshot({
    profile: json.profile,
    draftProfile: json.draftProfile,
    guidedIntake: json.guidedIntake,
  });

  const businessName = profile.businessName;
  if (!businessName) return "";

  const websiteUrl = profile.websiteUrl;
  const industry = profile.industry;
  const businessModel = profile.businessModel;
  const primaryGoals = profile.primaryGoals;
  const targetCustomer = profile.targetCustomer;
  const brandVoice = profile.brandVoice;
  const businessContext = profile.businessContext;
  const logoUrl = profile.logoUrl;
  const brandPrimaryHex = profile.brandPrimaryHex;
  const brandSecondaryHex = profile.brandSecondaryHex;
  const brandAccentHex = profile.brandAccentHex;
  const brandTextHex = profile.brandTextHex;
  const brandFontFamily = profile.brandFontFamily;
  const brandFontGoogleFamily = profile.brandFontGoogleFamily;
  const health = assessBusinessProfileContextHealth({
    businessName,
    websiteUrl,
    industry,
    businessModel,
    primaryGoals,
    targetCustomer,
    brandVoice,
    businessContext,
    logoUrl,
    brandPrimaryHex,
    brandSecondaryHex,
    brandAccentHex,
    brandTextHex,
    brandFontFamily,
    brandFontGoogleFamily,
  });

  const lines = [
    "BUSINESS_PROFILE (use as context; do not invent missing details):",
    `- Name: ${businessName}`,
    `- Context health: ${health.score}/100 (${health.label})`,
    `- Context health note: ${health.explanation}`,
    `- Assistant confidence guidance: ${health.assistantGuidance}`,
    health.nextSteps.length ? `- Smallest next steps: ${health.nextSteps.map((step) => step.label).join("; ")}` : "",
    websiteUrl ? `- Website: ${websiteUrl}` : "",
    industry ? `- Industry: ${industry}` : "",
    businessModel ? `- Business model: ${businessModel}` : "",
    primaryGoals.length ? `- Primary goals: ${primaryGoals.join("; ")}` : "",
    targetCustomer ? `- Target customer: ${targetCustomer}` : "",
    brandVoice ? `- Brand voice: ${brandVoice}` : "",
    businessContext ? `- Business context: ${businessContext}` : "",
    logoUrl ? `- Logo: ${logoUrl}` : "",
    brandPrimaryHex ? `- Brand primary: ${brandPrimaryHex}` : "",
    brandSecondaryHex ? `- Brand secondary: ${brandSecondaryHex}` : "",
    brandAccentHex ? `- Brand accent: ${brandAccentHex}` : "",
    brandTextHex ? `- Brand text: ${brandTextHex}` : "",
    brandFontFamily ? `- Brand font family: ${brandFontFamily}` : "",
    brandFontGoogleFamily ? `- Brand font (Google family): ${brandFontGoogleFamily}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return lines;
}
