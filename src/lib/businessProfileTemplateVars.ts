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

function safeParagraph(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function deriveBusinessProfileTemplateVars(profile: unknown): Record<string, string> {
  const row = profile && typeof profile === "object" && !Array.isArray(profile) ? (profile as Record<string, unknown>) : null;
  if (!row) return {};

  const businessName = safeLine(row.businessName, 200);
  const websiteUrl = safeUrl(row.websiteUrl, 400);
  const industry = safeLine(row.industry, 160);
  const businessModel = safeLine(row.businessModel, 240);
  const targetCustomer = safeLine(row.targetCustomer, 240);
  const brandVoice = safeLine(row.brandVoice, 240);
  const businessContext = safeParagraph(row.businessContext, 2400);
  const logoUrl = safeUrl(row.logoUrl, 500);
  const brandPrimaryHex = safeLine(row.brandPrimaryHex, 16);
  const brandSecondaryHex = safeLine(row.brandSecondaryHex, 16);
  const brandAccentHex = safeLine(row.brandAccentHex, 16);
  const brandTextHex = safeLine(row.brandTextHex, 16);
  const brandFontFamily = safeLine(row.brandFontFamily, 120);
  const brandFontGoogleFamily = safeLine(row.brandFontGoogleFamily, 160);

  return {
    "business.name": businessName,
    "business.websiteUrl": websiteUrl,
    "business.industry": industry,
    "business.businessModel": businessModel,
    "business.targetCustomer": targetCustomer,
    "business.brandVoice": brandVoice,
    "business.context": businessContext,
    "business.logoUrl": logoUrl,
    "business.brandPrimaryHex": brandPrimaryHex,
    "business.brandSecondaryHex": brandSecondaryHex,
    "business.brandAccentHex": brandAccentHex,
    "business.brandTextHex": brandTextHex,
    "business.brandFontFamily": brandFontFamily,
    "business.brandFontGoogleFamily": brandFontGoogleFamily,
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
    businessContext,
    business_context: businessContext,
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
}
