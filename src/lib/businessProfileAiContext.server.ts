import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

type ProfileColumnFlags = {
  websiteUrl: boolean;
  industry: boolean;
  businessModel: boolean;
  primaryGoals: boolean;
  targetCustomer: boolean;
  brandVoice: boolean;
  logoUrl: boolean;
  brandPrimaryHex: boolean;
  brandAccentHex: boolean;
  brandTextHex: boolean;
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
      hasPublicColumn("BusinessProfile", "logoUrl"),
      hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
      hasPublicColumn("BusinessProfile", "brandAccentHex"),
      hasPublicColumn("BusinessProfile", "brandTextHex"),
    ]).then(
      ([
        websiteUrl,
        industry,
        businessModel,
        primaryGoals,
        targetCustomer,
        brandVoice,
        logoUrl,
        brandPrimaryHex,
        brandAccentHex,
        brandTextHex,
      ]) => ({
        websiteUrl,
        industry,
        businessModel,
        primaryGoals,
        targetCustomer,
        brandVoice,
        logoUrl,
        brandPrimaryHex,
        brandAccentHex,
        brandTextHex,
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

export async function getBusinessProfileTemplateVars(ownerId: string): Promise<Record<string, string>> {
  const id = String(ownerId || "").trim();
  if (!id) return {};

  const flags = await getProfileColumnFlags();

  const select: Record<string, boolean> = {
    businessName: true,
  };
  if (flags.websiteUrl) select.websiteUrl = true;
  if (flags.industry) select.industry = true;
  if (flags.businessModel) select.businessModel = true;
  if (flags.targetCustomer) select.targetCustomer = true;
  if (flags.brandVoice) select.brandVoice = true;
  if (flags.logoUrl) select.logoUrl = true;
  if (flags.brandPrimaryHex) select.brandPrimaryHex = true;
  if (flags.brandAccentHex) select.brandAccentHex = true;
  if (flags.brandTextHex) select.brandTextHex = true;

  const profile = await prisma.businessProfile.findUnique({ where: { ownerId: id }, select: select as any }).catch(() => null);
  if (!profile) return {};

  const businessName = safeLine((profile as any).businessName, 200);
  const websiteUrl = flags.websiteUrl ? safeUrl((profile as any).websiteUrl, 400) : "";
  const industry = flags.industry ? safeLine((profile as any).industry, 160) : "";
  const businessModel = flags.businessModel ? safeLine((profile as any).businessModel, 240) : "";
  const targetCustomer = flags.targetCustomer ? safeLine((profile as any).targetCustomer, 240) : "";
  const brandVoice = flags.brandVoice ? safeLine((profile as any).brandVoice, 240) : "";
  const logoUrl = flags.logoUrl ? safeUrl((profile as any).logoUrl, 500) : "";
  const brandPrimaryHex = flags.brandPrimaryHex ? safeLine((profile as any).brandPrimaryHex, 16) : "";
  const brandAccentHex = flags.brandAccentHex ? safeLine((profile as any).brandAccentHex, 16) : "";
  const brandTextHex = flags.brandTextHex ? safeLine((profile as any).brandTextHex, 16) : "";

  const vars: Record<string, string> = {
    // Canonical / dotted
    "business.name": businessName,
    "business.websiteUrl": websiteUrl,
    "business.industry": industry,
    "business.businessModel": businessModel,
    "business.targetCustomer": targetCustomer,
    "business.brandVoice": brandVoice,
    "business.logoUrl": logoUrl,
    "business.brandPrimaryHex": brandPrimaryHex,
    "business.brandAccentHex": brandAccentHex,
    "business.brandTextHex": brandTextHex,

    // Common aliases (legacy + UI)
    businessName,
    business_name: businessName,
    websiteUrl,
    website_url: websiteUrl,
    website: websiteUrl,
    industry,
    niche: industry,
    businessModel,
    targetCustomer,
    brandVoice,
    logoUrl,
    logo_url: logoUrl,
    brandPrimaryHex,
    brand_primary_hex: brandPrimaryHex,
    brandAccentHex,
    brand_accent_hex: brandAccentHex,
    brandTextHex,
    brand_text_hex: brandTextHex,
  };

  return vars;
}

export async function getBusinessProfileAiContext(ownerId: string): Promise<string> {
  const id = String(ownerId || "").trim();
  if (!id) return "";

  const flags = await getProfileColumnFlags();

  const select: Record<string, boolean> = {
    businessName: true,
  };
  if (flags.websiteUrl) select.websiteUrl = true;
  if (flags.industry) select.industry = true;
  if (flags.businessModel) select.businessModel = true;
  if (flags.primaryGoals) select.primaryGoals = true;
  if (flags.targetCustomer) select.targetCustomer = true;
  if (flags.brandVoice) select.brandVoice = true;
  if (flags.logoUrl) select.logoUrl = true;
  if (flags.brandPrimaryHex) select.brandPrimaryHex = true;
  if (flags.brandAccentHex) select.brandAccentHex = true;
  if (flags.brandTextHex) select.brandTextHex = true;

  const profile = await prisma.businessProfile.findUnique({ where: { ownerId: id }, select: select as any });
  if (!profile) return "";

  const businessName = safeLine((profile as any).businessName, 200);
  if (!businessName) return "";

  const websiteUrl = flags.websiteUrl ? safeUrl((profile as any).websiteUrl, 400) : "";
  const industry = flags.industry ? safeLine((profile as any).industry, 160) : "";
  const businessModel = flags.businessModel ? safeLine((profile as any).businessModel, 240) : "";
  const primaryGoals = flags.primaryGoals ? safeGoals((profile as any).primaryGoals) : [];
  const targetCustomer = flags.targetCustomer ? safeLine((profile as any).targetCustomer, 240) : "";
  const brandVoice = flags.brandVoice ? safeLine((profile as any).brandVoice, 240) : "";
  const logoUrl = flags.logoUrl ? safeUrl((profile as any).logoUrl, 500) : "";
  const brandPrimaryHex = flags.brandPrimaryHex ? safeLine((profile as any).brandPrimaryHex, 16) : "";
  const brandAccentHex = flags.brandAccentHex ? safeLine((profile as any).brandAccentHex, 16) : "";
  const brandTextHex = flags.brandTextHex ? safeLine((profile as any).brandTextHex, 16) : "";

  const lines = [
    "BUSINESS_PROFILE (use as context; do not invent missing details):",
    `- Name: ${businessName}`,
    websiteUrl ? `- Website: ${websiteUrl}` : "",
    industry ? `- Industry: ${industry}` : "",
    businessModel ? `- Business model: ${businessModel}` : "",
    primaryGoals.length ? `- Primary goals: ${primaryGoals.join("; ")}` : "",
    targetCustomer ? `- Target customer: ${targetCustomer}` : "",
    brandVoice ? `- Brand voice: ${brandVoice}` : "",
    logoUrl ? `- Logo: ${logoUrl}` : "",
    brandPrimaryHex ? `- Brand primary: ${brandPrimaryHex}` : "",
    brandAccentHex ? `- Brand accent: ${brandAccentHex}` : "",
    brandTextHex ? `- Brand text: ${brandTextHex}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return lines;
}
