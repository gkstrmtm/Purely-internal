import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";

import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ensureClientRoleAllowed, isClientRoleMissingError } from "@/lib/ensureClientRoleAllowed";
import { normalizePhoneStrict } from "@/lib/phone";
import { CREDIT_PORTAL_SESSION_COOKIE_NAME, PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { resolvePortalOwnerIdForLogin } from "@/lib/portalAccounts";
import { getOrCreateOwnerMailboxAddress } from "@/lib/portalMailbox";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";
import {
  goalLabelsFromIds,
  normalizeGoalIds,
  normalizeServiceSlugs,
  recommendPortalServiceSlugs,
} from "@/lib/portalGetStartedRecommendations";
import { CORE_INCLUDED_SERVICE_SLUGS, planById } from "@/lib/portalOnboardingWizardCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  selectedPlanIds: z.array(z.string()).max(20).optional(),
  selectedPlanQuantities: z.record(z.string(), z.number()).optional(),
  couponCode: z.string().trim().max(80).optional(),
});

const ONBOARDING_SERVICE_SLUGS_TO_GUARD = [
  "inbox",
  "media-library",
  "tasks",
  "reporting",
  "automations",
  "booking",
  "reviews",
  "blogs",
  "ai-receptionist",
  "ai-outbound-calls",
  "lead-scraping",
  "newsletter",
  "nurture-campaigns",
] as const;

function normalizePlanQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  let count = 0;

  for (const [kRaw, vRaw] of Object.entries(value as Record<string, unknown>)) {
    const k = String(kRaw).trim();
    if (!k) continue;

    const n = typeof vRaw === "number" ? vRaw : Number(vRaw);
    if (!Number.isFinite(n)) continue;

    out[k] = Math.max(0, Math.min(50, Math.trunc(n)));
    count += 1;
    if (count >= 30) break;
  }

  return out;
}

function withLifecycle(dataJson: unknown, lifecycle: { state: string; reason?: string }) {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : {};
  return {
    ...rec,
    lifecycle: {
      ...(rec.lifecycle && typeof rec.lifecycle === "object" && !Array.isArray(rec.lifecycle) ? (rec.lifecycle as any) : {}),
      state: lifecycle.state,
      reason: lifecycle.reason,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function POST(req: Request) {
  const variant = (normalizePortalVariant(req.headers.get(PORTAL_VARIANT_HEADER)) || "portal") satisfies PortalVariant;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Default to enabled. Set CLIENT_SIGNUP_ENABLED="false" to disable.
  const enabledFlag = String(process.env.CLIENT_SIGNUP_ENABLED ?? "").trim().toLowerCase();
  if (["0", "false", "off", "disabled"].includes(enabledFlag)) {
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

  const couponCode = (parsed.data.couponCode || "").trim().toUpperCase().slice(0, 40);

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
          clientPortalVariant: variant === "credit" ? "CREDIT" : "PORTAL",
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
            selectedPlanIds: Array.isArray(parsed.data.selectedPlanIds)
              ? parsed.data.selectedPlanIds.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 20)
              : [],
            selectedPlanQuantities: normalizePlanQuantities(parsed.data.selectedPlanQuantities),
            couponCode: couponCode || null,
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
            selectedPlanIds: Array.isArray(parsed.data.selectedPlanIds)
              ? parsed.data.selectedPlanIds.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 20)
              : [],
            selectedPlanQuantities: normalizePlanQuantities(parsed.data.selectedPlanQuantities),
            couponCode: couponCode || null,
            createdAt: new Date().toISOString(),
          },
        },
        select: { id: true },
      });

      // Default credits auto top-up ON for new accounts.
      await tx.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: "credits" } },
        create: {
          ownerId: user.id,
          serviceSlug: "credits",
          status: "COMPLETE",
          dataJson: { balance: 0, autoTopUp: true },
        },
        update: {
          status: "COMPLETE",
          dataJson: { balance: 0, autoTopUp: true },
        },
        select: { id: true },
      });

      // Keep services gated until checkout completes.
      const allowed = new Set<string>(ONBOARDING_SERVICE_SLUGS_TO_GUARD as unknown as string[]);
      const coreIncluded = new Set<string>(CORE_INCLUDED_SERVICE_SLUGS as unknown as string[]);

      const planIds = Array.isArray(parsed.data.selectedPlanIds)
        ? parsed.data.selectedPlanIds.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 20)
        : [];
      const planSlugs = planIds.flatMap((id) => planById(id)?.serviceSlugsToActivate ?? []);

      const pendingPayment = new Set<string>([...selectedServiceSlugs, ...planSlugs]);
      for (const slug of Array.from(pendingPayment)) {
        if (!allowed.has(slug)) continue;
        if (coreIncluded.has(slug)) continue;

        const existing = await tx.portalServiceSetup
          .findUnique({
            where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: slug } },
            select: { id: true, dataJson: true },
          })
          .catch(() => null);

        if (!existing) {
          await tx.portalServiceSetup.create({
            data: {
              ownerId: user.id,
              serviceSlug: slug,
              status: "NOT_STARTED",
              dataJson: withLifecycle({}, { state: "paused", reason: "pending_payment" }) as any,
            },
            select: { id: true },
          });
          continue;
        }

        await tx.portalServiceSetup.update({
          where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: slug } },
          data: { dataJson: withLifecycle(existing.dataJson, { state: "paused", reason: "pending_payment" }) as any },
          select: { id: true },
        });
      }

      return user;
    });

  let user: Pick<User, "id" | "email" | "name" | "role">;
  try {
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

    // Multi-user portal accounts: session uid is the account ownerId.
    const ownerId = await resolvePortalOwnerIdForLogin(user.id).catch(() => user.id);

    // Best-effort: provision the managed business mailbox alias.
    try {
      await getOrCreateOwnerMailboxAddress(ownerId);
    } catch {
      // ignore
    }

    const token = await encode({
      secret,
      token: {
        uid: ownerId,
        memberUid: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      maxAge: 60 * 60 * 24 * 30,
    });

    const res = NextResponse.json({ ok: true, user, signedIn: true });
    res.cookies.set({
      name: variant === "credit" ? CREDIT_PORTAL_SESSION_COOKIE_NAME : PORTAL_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e) {
    console.error("/api/auth/client-signup failed", e);

    const prismaCode = typeof (e as any)?.code === "string" ? String((e as any).code) : null;
    if (prismaCode === "P2002") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    if (prismaCode === "P2021") {
      return NextResponse.json(
        { error: "Server database is missing required tables" },
        { status: 500 },
      );
    }

    const message = e instanceof Error ? e.message : "Unknown error";
    const error = process.env.NODE_ENV === "production" ? "Unable to create account" : message;
    return NextResponse.json({ error }, { status: 500 });
  }
}
