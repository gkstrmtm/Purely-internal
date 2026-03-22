import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getAiReceptionistServiceData, setAiReceptionistSettings } from "@/lib/aiReceptionist";
import { getOrCreateOwnerMailboxAddress } from "@/lib/portalMailbox";
import { coerceFontFamily, coerceGoogleFamily } from "@/lib/fontPresets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const upsertSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required"),
  websiteUrl: z.string().trim().max(500).optional().or(z.literal("")),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  businessModel: z.string().trim().max(200).optional().or(z.literal("")),
  primaryGoals: z.array(z.string().trim().min(1)).max(10).optional(),
  targetCustomer: z.string().trim().max(240).optional().or(z.literal("")),
  brandVoice: z.string().trim().max(240).optional().or(z.literal("")),

  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  brandPrimaryHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Primary color must be a hex code like #1d4ed8")
    .optional()
    .or(z.literal("")),
  brandSecondaryHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Secondary color must be a hex code like #22c55e")
    .optional()
    .or(z.literal("")),
  brandAccentHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Accent color must be a hex code like #fb7185")
    .optional()
    .or(z.literal("")),
  brandTextHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Text color must be a hex code like #0f172a")
    .optional()
    .or(z.literal("")),

  brandFontFamily: z.string().trim().max(200).optional().or(z.literal("")),
  brandFontGoogleFamily: z.string().trim().max(80).optional().or(z.literal("")),
});

function emptyToNull(value: string | undefined) {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length ? v : null;
}

function coerceWebsiteUrl(value: string | undefined): { ok: true; url: string | null } | { ok: false; error: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: true, url: null };

  // Allow users to paste domains without a protocol.
  const withProtocol = /^(https?:\/\/)/i.test(raw) ? raw : `https://${raw}`;

  try {
    const u = new URL(withProtocol);
    if (!u.hostname) return { ok: false, error: "Website URL is invalid" };
    if (!/\./.test(u.hostname)) return { ok: false, error: "Website URL must include a valid domain" };
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, error: "Website URL must start with http:// or https://" };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: "Website URL is invalid (try including https://)" };
  }
}

type ProfileColumnFlags = {
  websiteUrl: boolean;
  industry: boolean;
  businessModel: boolean;
  primaryGoals: boolean;
  targetCustomer: boolean;
  brandVoice: boolean;
  logoUrl: boolean;
  brandPrimaryHex: boolean;
  brandSecondaryHex: boolean;
  brandAccentHex: boolean;
  brandTextHex: boolean;
  brandFontFamily: boolean;
  brandFontGoogleFamily: boolean;
  updatedAt: boolean;
};

async function getProfileColumnFlags(): Promise<ProfileColumnFlags> {
  const [
    websiteUrl,
    industry,
    businessModel,
    primaryGoals,
    targetCustomer,
    brandVoice,
    logoUrl,
    brandPrimaryHex,
    brandSecondaryHex,
    brandAccentHex,
    brandTextHex,
    brandFontFamily,
    brandFontGoogleFamily,
    updatedAt,
  ] = await Promise.all([
    hasPublicColumn("BusinessProfile", "websiteUrl"),
    hasPublicColumn("BusinessProfile", "industry"),
    hasPublicColumn("BusinessProfile", "businessModel"),
    hasPublicColumn("BusinessProfile", "primaryGoals"),
    hasPublicColumn("BusinessProfile", "targetCustomer"),
    hasPublicColumn("BusinessProfile", "brandVoice"),
    hasPublicColumn("BusinessProfile", "logoUrl"),
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandSecondaryHex"),
    hasPublicColumn("BusinessProfile", "brandAccentHex"),
    hasPublicColumn("BusinessProfile", "brandTextHex"),
    hasPublicColumn("BusinessProfile", "brandFontFamily"),
    hasPublicColumn("BusinessProfile", "brandFontGoogleFamily"),
    hasPublicColumn("BusinessProfile", "updatedAt"),
  ]);

  return {
    websiteUrl,
    industry,
    businessModel,
    primaryGoals,
    targetCustomer,
    brandVoice,
    logoUrl,
    brandPrimaryHex,
    brandSecondaryHex,
    brandAccentHex,
    brandTextHex,
    brandFontFamily,
    brandFontGoogleFamily,
    updatedAt,
  };
}

function profileSelect(flags: ProfileColumnFlags) {
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
  if (flags.brandSecondaryHex) select.brandSecondaryHex = true;
  if (flags.brandAccentHex) select.brandAccentHex = true;
  if (flags.brandTextHex) select.brandTextHex = true;
  if (flags.brandFontFamily) select.brandFontFamily = true;
  if (flags.brandFontGoogleFamily) select.brandFontGoogleFamily = true;
  if (flags.updatedAt) select.updatedAt = true;

  return select as any;
}

function normalizeProfile(row: any, flags: ProfileColumnFlags) {
  return {
    businessName: row.businessName,
    websiteUrl: flags.websiteUrl ? (row.websiteUrl ?? null) : null,
    industry: flags.industry ? (row.industry ?? null) : null,
    businessModel: flags.businessModel ? (row.businessModel ?? null) : null,
    primaryGoals: flags.primaryGoals ? ((row.primaryGoals as unknown) ?? null) : null,
    targetCustomer: flags.targetCustomer ? (row.targetCustomer ?? null) : null,
    brandVoice: flags.brandVoice ? (row.brandVoice ?? null) : null,
    logoUrl: flags.logoUrl ? (row.logoUrl ?? null) : null,
    brandPrimaryHex: flags.brandPrimaryHex ? (row.brandPrimaryHex ?? null) : null,
    brandSecondaryHex: flags.brandSecondaryHex ? (row.brandSecondaryHex ?? null) : null,
    brandAccentHex: flags.brandAccentHex ? (row.brandAccentHex ?? null) : null,
    brandTextHex: flags.brandTextHex ? (row.brandTextHex ?? null) : null,
    brandFontFamily: flags.brandFontFamily ? (row.brandFontFamily ?? null) : null,
    brandFontGoogleFamily: flags.brandFontGoogleFamily ? (row.brandFontGoogleFamily ?? null) : null,
    updatedAt: flags.updatedAt ? row.updatedAt : null,
  };
}

export async function GET() {
  const auth = await requireClientSessionForService("businessProfile", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const flags = await getProfileColumnFlags();

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: profileSelect(flags),
  });

  return NextResponse.json({ ok: true, profile: profile ? normalizeProfile(profile as any, flags) : null });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const website = coerceWebsiteUrl(parsed.data.websiteUrl);
  if (!website.ok) {
    return NextResponse.json({ error: website.error }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const prevProfile = await prisma.businessProfile
    .findUnique({ where: { ownerId }, select: { businessName: true } })
    .catch(() => null);
  const prevBusinessName = typeof prevProfile?.businessName === "string" ? prevProfile.businessName.trim() : "";

  const flags = await getProfileColumnFlags();

  const baseData: Record<string, unknown> = {
    ownerId,
    businessName: parsed.data.businessName.trim(),
  };

  if (flags.websiteUrl) baseData.websiteUrl = website.url;
  if (flags.industry) baseData.industry = emptyToNull(parsed.data.industry);
  if (flags.businessModel) baseData.businessModel = emptyToNull(parsed.data.businessModel);
  if (flags.primaryGoals) {
    baseData.primaryGoals = parsed.data.primaryGoals?.length ? parsed.data.primaryGoals : undefined;
  }
  if (flags.targetCustomer) baseData.targetCustomer = emptyToNull(parsed.data.targetCustomer);
  if (flags.brandVoice) baseData.brandVoice = emptyToNull(parsed.data.brandVoice);
  if (flags.logoUrl) baseData.logoUrl = emptyToNull(parsed.data.logoUrl);
  if (flags.brandPrimaryHex) baseData.brandPrimaryHex = emptyToNull(parsed.data.brandPrimaryHex);
  if (flags.brandSecondaryHex) baseData.brandSecondaryHex = emptyToNull(parsed.data.brandSecondaryHex);
  if (flags.brandAccentHex) baseData.brandAccentHex = emptyToNull(parsed.data.brandAccentHex);
  if (flags.brandTextHex) baseData.brandTextHex = emptyToNull(parsed.data.brandTextHex);
  if (flags.brandFontFamily) baseData.brandFontFamily = coerceFontFamily(parsed.data.brandFontFamily) ?? null;
  if (flags.brandFontGoogleFamily) baseData.brandFontGoogleFamily = coerceGoogleFamily(parsed.data.brandFontGoogleFamily) ?? null;

  const updateData: Record<string, unknown> = {
    businessName: parsed.data.businessName.trim(),
  };
  if (flags.websiteUrl) updateData.websiteUrl = website.url;
  if (flags.industry) updateData.industry = emptyToNull(parsed.data.industry);
  if (flags.businessModel) updateData.businessModel = emptyToNull(parsed.data.businessModel);
  if (flags.primaryGoals) {
    updateData.primaryGoals = parsed.data.primaryGoals?.length ? parsed.data.primaryGoals : Prisma.DbNull;
  }
  if (flags.targetCustomer) updateData.targetCustomer = emptyToNull(parsed.data.targetCustomer);
  if (flags.brandVoice) updateData.brandVoice = emptyToNull(parsed.data.brandVoice);
  if (flags.logoUrl) updateData.logoUrl = emptyToNull(parsed.data.logoUrl);
  if (flags.brandPrimaryHex) updateData.brandPrimaryHex = emptyToNull(parsed.data.brandPrimaryHex);
  if (flags.brandSecondaryHex) updateData.brandSecondaryHex = emptyToNull(parsed.data.brandSecondaryHex);
  if (flags.brandAccentHex) updateData.brandAccentHex = emptyToNull(parsed.data.brandAccentHex);
  if (flags.brandTextHex) updateData.brandTextHex = emptyToNull(parsed.data.brandTextHex);
  if (flags.brandFontFamily) updateData.brandFontFamily = coerceFontFamily(parsed.data.brandFontFamily) ?? null;
  if (flags.brandFontGoogleFamily) updateData.brandFontGoogleFamily = coerceGoogleFamily(parsed.data.brandFontGoogleFamily) ?? null;

  const row = await prisma.businessProfile.upsert({
    where: { ownerId },
    create: baseData as any,
    update: updateData as any,
    select: profileSelect(flags),
  });

  // Best-effort: keep AI Receptionist business name in sync with Business Profile.
  // Only overwrite if the receptionist name is empty, or it previously matched the old profile name.
  try {
    const nextBusinessName = typeof (row as any)?.businessName === "string" ? String((row as any).businessName).trim() : "";
    if (nextBusinessName) {
      const ai = await getAiReceptionistServiceData(ownerId).catch(() => null);
      const currentAiName = typeof ai?.settings?.businessName === "string" ? ai.settings.businessName.trim() : "";
      const shouldSync = !currentAiName || (prevBusinessName && currentAiName === prevBusinessName);
      if (ai && shouldSync) {
        await setAiReceptionistSettings(ownerId, { ...ai.settings, businessName: nextBusinessName });
      }
    }
  } catch {
    // ignore
  }

  // Best-effort: provision the managed business mailbox alias.
  try {
    await getOrCreateOwnerMailboxAddress(ownerId);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, profile: normalizeProfile(row as any, flags) });
}
