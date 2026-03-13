import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { coerceFontFamily, coerceGoogleFamily, googleFontImportCss } from "@/lib/fontPresets";

export type HostedBrandFont = {
  fontFamily: string | null;
  googleCss: string | null;
  styleVars: Record<string, string>;
  globalStyle: Record<string, string>;
};

export async function getHostedBrandFont(ownerId: string): Promise<HostedBrandFont> {
  const safeOwnerId = String(ownerId || "").trim();
  if (!safeOwnerId) {
    return { fontFamily: null, googleCss: null, styleVars: {}, globalStyle: {} };
  }

  const [hasBrandFontFamily, hasBrandFontGoogleFamily] = await Promise.all([
    hasPublicColumn("BusinessProfile", "brandFontFamily"),
    hasPublicColumn("BusinessProfile", "brandFontGoogleFamily"),
  ]);

  if (!hasBrandFontFamily && !hasBrandFontGoogleFamily) {
    return { fontFamily: null, googleCss: null, styleVars: {}, globalStyle: {} };
  }

  const select: Record<string, boolean> = {};
  if (hasBrandFontFamily) select.brandFontFamily = true;
  if (hasBrandFontGoogleFamily) select.brandFontGoogleFamily = true;

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: safeOwnerId }, select: select as any })
    .catch(() => null);

  const fontFamily = coerceFontFamily((profile as any)?.brandFontFamily) ?? null;
  const fontGoogleFamily = coerceGoogleFamily((profile as any)?.brandFontGoogleFamily) ?? null;

  const googleCss = fontGoogleFamily ? googleFontImportCss(fontGoogleFamily) : null;

  const styleVars: Record<string, string> = {};
  const globalStyle: Record<string, string> = {};

  if (fontFamily) {
    styleVars["--font-brand"] = fontFamily;
    globalStyle.fontFamily = fontFamily;
  }

  return { fontFamily, googleCss, styleVars, globalStyle };
}
