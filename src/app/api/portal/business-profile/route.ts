import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const upsertSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required"),
  websiteUrl: z.string().trim().url().optional().or(z.literal("")),
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
});

function emptyToNull(value: string | undefined) {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length ? v : null;
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

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
      brandAccentHex: true,
      brandTextHex: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, profile });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
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

  const ownerId = auth.session.user.id;

  const row = await prisma.businessProfile.upsert({
    where: { ownerId },
    create: {
      ownerId,
      businessName: parsed.data.businessName.trim(),
      websiteUrl: emptyToNull(parsed.data.websiteUrl),
      industry: emptyToNull(parsed.data.industry),
      businessModel: emptyToNull(parsed.data.businessModel),
      primaryGoals: parsed.data.primaryGoals?.length ? parsed.data.primaryGoals : undefined,
      targetCustomer: emptyToNull(parsed.data.targetCustomer),
      brandVoice: emptyToNull(parsed.data.brandVoice),

      logoUrl: emptyToNull(parsed.data.logoUrl),
      brandPrimaryHex: emptyToNull(parsed.data.brandPrimaryHex),
      brandAccentHex: emptyToNull(parsed.data.brandAccentHex),
      brandTextHex: emptyToNull(parsed.data.brandTextHex),
    },
    update: {
      businessName: parsed.data.businessName.trim(),
      websiteUrl: emptyToNull(parsed.data.websiteUrl),
      industry: emptyToNull(parsed.data.industry),
      businessModel: emptyToNull(parsed.data.businessModel),
      primaryGoals: parsed.data.primaryGoals?.length ? parsed.data.primaryGoals : Prisma.DbNull,
      targetCustomer: emptyToNull(parsed.data.targetCustomer),
      brandVoice: emptyToNull(parsed.data.brandVoice),

      logoUrl: emptyToNull(parsed.data.logoUrl),
      brandPrimaryHex: emptyToNull(parsed.data.brandPrimaryHex),
      brandAccentHex: emptyToNull(parsed.data.brandAccentHex),
      brandTextHex: emptyToNull(parsed.data.brandTextHex),
    },
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
      brandAccentHex: true,
      brandTextHex: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, profile: row });
}
