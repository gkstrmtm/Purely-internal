import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";
import { normalizePhoneStrict } from "@/lib/phone";
import {
  goalLabelsFromIds,
  normalizeGoalIds,
  normalizeServiceSlugs,
  recommendPortalServiceSlugs,
} from "@/lib/portalGetStartedRecommendations";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(32).optional(),
  password: z.string().min(6).max(200),

  businessName: z.string().trim().min(2).max(160),
  websiteUrl: z.string().trim().max(300).optional(),
  industry: z.string().trim().max(120).optional(),
  businessModel: z.string().trim().max(120).optional(),
  targetCustomer: z.string().trim().max(240).optional(),
  brandVoice: z.string().trim().max(240).optional(),

  goalIds: z.array(z.string()).max(10).optional(),
  selectedServiceSlugs: z.array(z.string()).max(20).optional(),
});

export async function POST(req: Request) {
  if (process.env.CLIENT_SIGNUP_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Customer signup is disabled" },
      { status: 403 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  const goalIds = normalizeGoalIds(parsed.data.goalIds);
  const recommendedServiceSlugs = recommendPortalServiceSlugs(goalIds);
  const selectedServiceSlugsRaw = normalizeServiceSlugs(parsed.data.selectedServiceSlugs);
  const selectedServiceSlugs = selectedServiceSlugsRaw.length ? selectedServiceSlugsRaw : recommendedServiceSlugs;

  const phoneRaw = typeof parsed.data.phone === "string" ? parsed.data.phone.trim() : "";
  const phoneParsed = phoneRaw ? normalizePhoneStrict(phoneRaw) : null;
  if (phoneParsed && !phoneParsed.ok) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }
  const phoneE164 = phoneParsed && phoneParsed.ok ? phoneParsed.e164 : null;

  const websiteUrl = (parsed.data.websiteUrl || "").trim();
  const industry = (parsed.data.industry || "").trim();
  const businessModel = (parsed.data.businessModel || "").trim();
  const targetCustomer = (parsed.data.targetCustomer || "").trim();
  const brandVoice = (parsed.data.brandVoice || "").trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const createUser = async () =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: parsed.data.name,
          passwordHash,
          role: "CLIENT",
        },
        select: { id: true, email: true, name: true, role: true },
      });

      const primaryGoals = goalLabelsFromIds(goalIds);

      await tx.businessProfile.create({
        data: {
          ownerId: user.id,
          businessName: parsed.data.businessName,
          websiteUrl: websiteUrl ? websiteUrl : null,
          industry: industry ? industry : null,
          businessModel: businessModel ? businessModel : null,
          primaryGoals: primaryGoals.length ? primaryGoals : undefined,
          targetCustomer: targetCustomer ? targetCustomer : null,
          brandVoice: brandVoice ? brandVoice : null,
        },
        select: { id: true },
      });

      if (phoneE164) {
        await tx.portalServiceSetup.upsert({
          where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: "profile" } },
          create: {
            ownerId: user.id,
            serviceSlug: "profile",
            status: "COMPLETE",
            dataJson: { version: 1, phone: phoneE164 },
          },
          update: {
            status: "COMPLETE",
            dataJson: { version: 1, phone: phoneE164 },
          },
          select: { id: true },
        });
      }

      await tx.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: "onboarding-intake" } },
        create: {
          ownerId: user.id,
          serviceSlug: "onboarding-intake",
          status: "COMPLETE",
          dataJson: {
            version: 1,
            goalIds,
            recommendedServiceSlugs,
            selectedServiceSlugs,
            businessName: parsed.data.businessName,
            websiteUrl: websiteUrl ? websiteUrl : null,
            industry: industry ? industry : null,
            businessModel: businessModel ? businessModel : null,
            targetCustomer: targetCustomer ? targetCustomer : null,
            brandVoice: brandVoice ? brandVoice : null,
            phoneE164,
            createdAt: new Date().toISOString(),
          },
        },
        update: {
          status: "COMPLETE",
          dataJson: {
            version: 1,
            goalIds,
            recommendedServiceSlugs,
            selectedServiceSlugs,
            businessName: parsed.data.businessName,
            websiteUrl: websiteUrl ? websiteUrl : null,
            industry: industry ? industry : null,
            businessModel: businessModel ? businessModel : null,
            targetCustomer: targetCustomer ? targetCustomer : null,
            brandVoice: brandVoice ? brandVoice : null,
            phoneE164,
            createdAt: new Date().toISOString(),
          },
        },
        select: { id: true },
      });

      return user;
    });

  let user;
  try {
    user = await createUser();
  } catch (e) {
    if (isClientRoleMissingError(e)) {
      await ensureClientRoleAllowed(prisma);
      user = await createUser();
    } else {
      throw e;
    }
  }

  return NextResponse.json({ user });
}
