import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

type ProfileColumnFlags = {
  websiteUrl: boolean;
  industry: boolean;
  businessModel: boolean;
  primaryGoals: boolean;
  targetCustomer: boolean;
  brandVoice: boolean;
  businessContextNotes: boolean;
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
      hasPublicColumn("BusinessProfile", "businessContextNotes"),
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
        businessContextNotes,
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
        businessContextNotes,
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

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

async function getProfileExtras(ownerId: string): Promise<Record<string, unknown> | null> {
  const row = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
      select: { dataJson: true },
    })
    .catch(() => null);

  return row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;
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
  if (flags.businessContextNotes) select.businessContextNotes = true;
  if (flags.logoUrl) select.logoUrl = true;
  if (flags.brandPrimaryHex) select.brandPrimaryHex = true;
  if (flags.brandSecondaryHex) select.brandSecondaryHex = true;
  if (flags.brandAccentHex) select.brandAccentHex = true;
  if (flags.brandTextHex) select.brandTextHex = true;
  if (flags.brandFontFamily) select.brandFontFamily = true;
  if (flags.brandFontGoogleFamily) select.brandFontGoogleFamily = true;

  const profile = await prisma.businessProfile.findUnique({ where: { ownerId: id }, select: select as any }).catch(() => null);
  if (!profile) return {};

  const extras = flags.businessContextNotes ? null : await getProfileExtras(id);

  const businessName = safeLine((profile as any).businessName, 200);
  const websiteUrl = flags.websiteUrl ? safeUrl((profile as any).websiteUrl, 400) : "";
  const industry = flags.industry ? safeLine((profile as any).industry, 160) : "";
  const businessModel = flags.businessModel ? safeLine((profile as any).businessModel, 240) : "";
  const targetCustomer = flags.targetCustomer ? safeLine((profile as any).targetCustomer, 240) : "";
  const brandVoice = flags.brandVoice ? safeLine((profile as any).brandVoice, 240) : "";
  const businessContextNotes = flags.businessContextNotes
    ? safeLine((profile as any).businessContextNotes, 4000)
    : safeLine(extras?.businessContextNotes, 4000);
  const logoUrl = flags.logoUrl ? safeUrl((profile as any).logoUrl, 500) : "";
  const brandPrimaryHex = flags.brandPrimaryHex ? safeLine((profile as any).brandPrimaryHex, 16) : "";
  const brandSecondaryHex = flags.brandSecondaryHex ? safeLine((profile as any).brandSecondaryHex, 16) : "";
  const brandAccentHex = flags.brandAccentHex ? safeLine((profile as any).brandAccentHex, 16) : "";
  const brandTextHex = flags.brandTextHex ? safeLine((profile as any).brandTextHex, 16) : "";
  const brandFontFamily = flags.brandFontFamily ? safeLine((profile as any).brandFontFamily, 120) : "";
  const brandFontGoogleFamily = flags.brandFontGoogleFamily ? safeLine((profile as any).brandFontGoogleFamily, 160) : "";

  const vars: Record<string, string> = {
    // Canonical / dotted
    "business.name": businessName,
    "business.websiteUrl": websiteUrl,
    "business.industry": industry,
    "business.businessModel": businessModel,
    "business.targetCustomer": targetCustomer,
    "business.brandVoice": brandVoice,
    "business.businessContextNotes": businessContextNotes,
    "business.logoUrl": logoUrl,
    "business.brandPrimaryHex": brandPrimaryHex,
    "business.brandSecondaryHex": brandSecondaryHex,
    "business.brandAccentHex": brandAccentHex,
    "business.brandTextHex": brandTextHex,
    "business.brandFontFamily": brandFontFamily,
    "business.brandFontGoogleFamily": brandFontGoogleFamily,

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
    businessContextNotes,
    logoUrl,
    logo_url: logoUrl,
    brandPrimaryHex,
    brand_primary_hex: brandPrimaryHex,
    brandSecondaryHex,
    brand_secondary_hex: brandSecondaryHex,
    brandAccentHex,
    brand_accent_hex: brandAccentHex,
    brandTextHex,
    brand_text_hex: brandTextHex,
    brandFontFamily,
    brand_font_family: brandFontFamily,
    brandFontGoogleFamily,
    brand_font_google_family: brandFontGoogleFamily,
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
  if (flags.businessContextNotes) select.businessContextNotes = true;
  if (flags.logoUrl) select.logoUrl = true;
  if (flags.brandPrimaryHex) select.brandPrimaryHex = true;
  if (flags.brandSecondaryHex) select.brandSecondaryHex = true;
  if (flags.brandAccentHex) select.brandAccentHex = true;
  if (flags.brandTextHex) select.brandTextHex = true;
  if (flags.brandFontFamily) select.brandFontFamily = true;
  if (flags.brandFontGoogleFamily) select.brandFontGoogleFamily = true;

  const profile = await prisma.businessProfile.findUnique({ where: { ownerId: id }, select: select as any });
  if (!profile) return "";

  const extras = flags.businessContextNotes ? null : await getProfileExtras(id);

  const businessName = safeLine((profile as any).businessName, 200);
  if (!businessName) return "";

  const websiteUrl = flags.websiteUrl ? safeUrl((profile as any).websiteUrl, 400) : "";
  const industry = flags.industry ? safeLine((profile as any).industry, 160) : "";
  const businessModel = flags.businessModel ? safeLine((profile as any).businessModel, 240) : "";
  const primaryGoals = flags.primaryGoals ? safeGoals((profile as any).primaryGoals) : [];
  const targetCustomer = flags.targetCustomer ? safeLine((profile as any).targetCustomer, 240) : "";
  const brandVoice = flags.brandVoice ? safeLine((profile as any).brandVoice, 240) : "";
  const businessContextNotes = flags.businessContextNotes
    ? safeLine((profile as any).businessContextNotes, 4000)
    : safeLine(extras?.businessContextNotes, 4000);
  const logoUrl = flags.logoUrl ? safeUrl((profile as any).logoUrl, 500) : "";
  const brandPrimaryHex = flags.brandPrimaryHex ? safeLine((profile as any).brandPrimaryHex, 16) : "";
  const brandSecondaryHex = flags.brandSecondaryHex ? safeLine((profile as any).brandSecondaryHex, 16) : "";
  const brandAccentHex = flags.brandAccentHex ? safeLine((profile as any).brandAccentHex, 16) : "";
  const brandTextHex = flags.brandTextHex ? safeLine((profile as any).brandTextHex, 16) : "";
  const brandFontFamily = flags.brandFontFamily ? safeLine((profile as any).brandFontFamily, 120) : "";
  const brandFontGoogleFamily = flags.brandFontGoogleFamily ? safeLine((profile as any).brandFontGoogleFamily, 160) : "";

  const lines = [
    "BUSINESS_PROFILE (use as context; do not invent missing details):",
    `- Name: ${businessName}`,
    websiteUrl ? `- Website: ${websiteUrl}` : "",
    industry ? `- Industry: ${industry}` : "",
    businessModel ? `- Business model: ${businessModel}` : "",
    primaryGoals.length ? `- Primary goals: ${primaryGoals.join("; ")}` : "",
    targetCustomer ? `- Target customer: ${targetCustomer}` : "",
    brandVoice ? `- Brand voice: ${brandVoice}` : "",
    businessContextNotes ? `- Additional business context: ${businessContextNotes}` : "",
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
