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
import { PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } from "@/lib/portalBillingModel";
import { getRequestIp } from "@/lib/requestIp";
import { findInviterByReferralCode, readReferralCodeFromUnknown } from "@/lib/portalReferrals.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function createRequestId() {
  try {
    // Prefer a real UUID when available.
    const c = (globalThis as any)?.crypto;
    if (c?.randomUUID) return String(c.randomUUID());
  } catch {
    // ignore
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(32).optional(),
  password: z.string().min(8).max(200),

  referralCode: z.string().trim().max(64).optional(),

  businessName: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(40),
  websiteUrl: z.string().trim().max(300).optional(),
  hasWebsite: z.enum(["YES", "NO", "NOT_SURE"]).optional(),
  acquisitionMethod: z.string().trim().max(160).optional(),
  acquisitionMethods: z.array(z.string().trim().max(80)).max(20).optional(),
  callsPerMonthRange: z.enum(["NOT_SURE", "0_10", "11_30", "31_60", "61_120", "120_PLUS"]).optional(),
  industry: z.string().trim().max(120).optional(),
  businessModel: z.string().trim().max(120).optional(),
  targetCustomer: z.string().trim().max(240).optional(),
  brandVoice: z.string().trim().max(240).optional(),

  billingPreference: z.enum(["credits", "subscription"]).optional(),
  selectedBundleId: z.enum(["launch-kit", "sales-loop", "brand-builder"]).nullable().optional(),

  goalIds: z.array(z.string()).max(10).optional(),
  selectedServiceSlugs: z.array(z.string()).max(20).optional(),
  selectedPlanIds: z.array(z.string()).max(20).optional(),
  selectedPlanQuantities: z.record(z.string(), z.number()).optional(),
  couponCode: z.string().trim().max(80).optional(),
});

function isSecureRequest(req: Request): boolean {
  const xfProto = req.headers.get("x-forwarded-proto");
  if (xfProto) return xfProto.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

function friendlySignupValidationError(issues: z.ZodIssue[]): string {
  for (const issue of issues) {
    const field = Array.isArray(issue.path) && issue.path.length ? String(issue.path[0]) : "";
    if (field === "password") {
      return "Password must be at least 8 characters.";
    }
    if (field === "email") {
      return "Enter a valid email address.";
    }
    if (field === "name") {
      return "Enter your name.";
    }
    if (field === "businessName") {
      return "Enter your business name.";
    }
    if (field === "city") {
      return "Enter your city.";
    }
    if (field === "state") {
      return "Enter your state.";
    }
  }

  return "Please check the form and try again.";
}

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

function normalizeStringArray(value: unknown, opts: { max: number; maxLen: number } = { max: 20, maxLen: 80 }): string[] {
  const arr = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const raw of arr) {
    const s = (typeof raw === "string" ? raw.trim() : "").slice(0, opts.maxLen);
    if (!s) continue;
    out.push(s);
    if (out.length >= opts.max) break;
  }
  return Array.from(new Set(out));
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
  const requestId = createRequestId();
  const variant = (normalizePortalVariant(req.headers.get(PORTAL_VARIANT_HEADER)) || "portal") satisfies PortalVariant;

  const jsonResponse = (body: Record<string, unknown>, init?: { status?: number }) => {
    const res = NextResponse.json({ requestId, ...body }, init);
    res.headers.set("x-pa-request-id", requestId);
    return res;
  };

  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return jsonResponse({ ok: false, error: "Server misconfigured" }, { status: 500 });
    }

    // Default to enabled. Set CLIENT_SIGNUP_ENABLED="false" to disable.
    const enabledFlag = String(process.env.CLIENT_SIGNUP_ENABLED ?? "").trim().toLowerCase();
    if (["0", "false", "off", "disabled"].includes(enabledFlag)) {
      return jsonResponse({ ok: false, error: "Customer signup is disabled" }, { status: 403 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonResponse(
        { ok: false, error: friendlySignupValidationError(parsed.error.issues) },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const invitedIp = getRequestIp(req);
    const referralCode = readReferralCodeFromUnknown(parsed.data.referralCode);
    const inviter = referralCode ? await findInviterByReferralCode(referralCode).catch(() => null) : null;

    const goalIds = normalizeGoalIds(parsed.data.goalIds);
    const recommendedServiceSlugs = recommendPortalServiceSlugs(goalIds);
    const selectedServiceSlugsRaw = normalizeServiceSlugs(parsed.data.selectedServiceSlugs);
    const selectedServiceSlugs = selectedServiceSlugsRaw.length ? selectedServiceSlugsRaw : recommendedServiceSlugs;

    const phoneRaw = typeof parsed.data.phone === "string" ? parsed.data.phone.trim() : "";
    const phoneParsed = phoneRaw ? normalizePhoneStrict(phoneRaw) : null;
    if (phoneParsed && !phoneParsed.ok) {
      return jsonResponse({ ok: false, error: "Invalid phone number" }, { status: 400 });
    }
    const phoneE164 = phoneParsed && phoneParsed.ok ? phoneParsed.e164 : null;

    const websiteUrl = (parsed.data.websiteUrl || "").trim();
    const city = parsed.data.city.trim();
    const state = parsed.data.state.trim();
    const hasWebsite = parsed.data.hasWebsite ?? null;
    const callsPerMonthRange = parsed.data.callsPerMonthRange ?? null;
    const acquisitionMethods = normalizeStringArray(parsed.data.acquisitionMethods);
    const acquisitionMethodLegacy = (parsed.data.acquisitionMethod || "").trim();
    const acquisitionMethod = acquisitionMethods.length ? acquisitionMethods.join(", ") : acquisitionMethodLegacy;
    const industry = (parsed.data.industry || "").trim();
    const businessModel = (parsed.data.businessModel || "").trim();
    const targetCustomer = (parsed.data.targetCustomer || "").trim();
    const brandVoice = (parsed.data.brandVoice || "").trim();

    const billingPreference = parsed.data.billingPreference ?? null;
    const selectedBundleId = typeof parsed.data.selectedBundleId === "string" ? parsed.data.selectedBundleId : null;

    const couponCode = (parsed.data.couponCode || "").trim().toUpperCase().slice(0, 40);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return jsonResponse({ ok: false, error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const createUserOnly = async () => {
      return prisma.user.create({
        data: {
          email,
          name: parsed.data.name,
          passwordHash,
          role: "CLIENT",
          clientPortalVariant: variant === "credit" ? "CREDIT" : "PORTAL",
        },
        select: { id: true, email: true, name: true, role: true },
      });
    };

    let user: Pick<User, "id" | "email" | "name" | "role">;
    try {
      user = await createUserOnly();
    } catch (e) {
      if (isClientRoleMissingError(e)) {
        await ensureClientRoleAllowed(prisma);
        user = await createUserOnly();
      } else {
        throw e;
      }
    }

    // Best-effort: provision onboarding records. These should never block account creation.
    const provisionTasks: Array<Promise<unknown>> = [];

    if (referralCode) {
      const inviterIp = String(inviter?.referralCodeCreatedIp || "").trim();
      const isValidInviter = inviter && inviter.role === "CLIENT" && inviter.email.toLowerCase() !== email;
      const ipOk = !inviterIp || !invitedIp || inviterIp !== invitedIp;
      if (isValidInviter && ipOk) {
        provisionTasks.push(
          prisma.portalReferral.create({
            data: {
              inviterId: inviter.id,
              invitedUserId: user.id,
              invitedEmail: email,
              invitedIp,
            },
            select: { id: true },
          }).catch(() => null),
        );
      }
    }

    const primaryGoals = goalLabelsFromIds(goalIds);
    provisionTasks.push(
      prisma.businessProfile.create({
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
      }),
    );

    provisionTasks.push(
      prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: "profile" } },
        create: {
          ownerId: user.id,
          serviceSlug: "profile",
          status: "COMPLETE",
          dataJson: {
            version: 1,
            ...(phoneE164 ? { phone: phoneE164 } : {}),
            city,
            state,
          },
        },
        update: {
          status: "COMPLETE",
          dataJson: {
            version: 1,
            ...(phoneE164 ? { phone: phoneE164 } : {}),
            city,
            state,
          },
        },
        select: { id: true },
      }),
    );

    if (variant !== "credit" && billingPreference) {
      provisionTasks.push(
        prisma.portalServiceSetup.upsert({
          where: {
            ownerId_serviceSlug: { ownerId: user.id, serviceSlug: PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG },
          },
          create: {
            ownerId: user.id,
            serviceSlug: PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG,
            status: "COMPLETE",
            dataJson: {
              billingModel: billingPreference,
              source: "onboarding",
              updatedAt: new Date().toISOString(),
            },
          },
          update: {
            status: "COMPLETE",
            dataJson: {
              billingModel: billingPreference,
              source: "onboarding",
              updatedAt: new Date().toISOString(),
            },
          },
          select: { id: true },
        }),
      );
    }

    provisionTasks.push(
      prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: "onboarding-intake" } },
        create: {
          ownerId: user.id,
          serviceSlug: "onboarding-intake",
          status: "COMPLETE",
          dataJson: {
            version: 3,
            goalIds,
            recommendedServiceSlugs,
            selectedServiceSlugs,
            businessName: parsed.data.businessName,
            city,
            state,
            websiteUrl: websiteUrl ? websiteUrl : null,
            hasWebsite,
            acquisitionMethod: acquisitionMethod ? acquisitionMethod : null,
            acquisitionMethods: acquisitionMethods.length ? acquisitionMethods : null,
            callsPerMonthRange,
            industry: industry ? industry : null,
            businessModel: businessModel ? businessModel : null,
            targetCustomer: targetCustomer ? targetCustomer : null,
            brandVoice: brandVoice ? brandVoice : null,
            phoneE164,
            billingPreference,
            selectedBundleId,
            starterCreditsGifted: billingPreference === "credits" ? 50 : 0,
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
            version: 3,
            goalIds,
            recommendedServiceSlugs,
            selectedServiceSlugs,
            businessName: parsed.data.businessName,
            city,
            state,
            websiteUrl: websiteUrl ? websiteUrl : null,
            hasWebsite,
            acquisitionMethod: acquisitionMethod ? acquisitionMethod : null,
            acquisitionMethods: acquisitionMethods.length ? acquisitionMethods : null,
            callsPerMonthRange,
            industry: industry ? industry : null,
            businessModel: businessModel ? businessModel : null,
            targetCustomer: targetCustomer ? targetCustomer : null,
            brandVoice: brandVoice ? brandVoice : null,
            phoneE164,
            billingPreference,
            selectedBundleId,
            starterCreditsGifted: billingPreference === "credits" ? 50 : 0,
            selectedPlanIds: Array.isArray(parsed.data.selectedPlanIds)
              ? parsed.data.selectedPlanIds.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 20)
              : [],
            selectedPlanQuantities: normalizePlanQuantities(parsed.data.selectedPlanQuantities),
            couponCode: couponCode || null,
            createdAt: new Date().toISOString(),
          },
        },
        select: { id: true },
      }),
    );

    // Default credits auto top-up ON for new accounts.
    provisionTasks.push(
      prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: "credits" } },
        create: {
          ownerId: user.id,
          serviceSlug: "credits",
          status: "COMPLETE",
          dataJson: { balance: billingPreference === "credits" ? 50 : 0, autoTopUp: true },
        },
        update: {
          status: "COMPLETE",
          dataJson: { balance: billingPreference === "credits" ? 50 : 0, autoTopUp: true },
        },
        select: { id: true },
      }),
    );

    // Keep services gated until checkout completes (subscription billing only).
    if (billingPreference !== "credits") {
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

        provisionTasks.push(
          (async () => {
            const existing = await prisma.portalServiceSetup
              .findUnique({
                where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: slug } },
                select: { id: true, dataJson: true },
              })
              .catch(() => null);

            if (!existing) {
              await prisma.portalServiceSetup.create({
                data: {
                  ownerId: user.id,
                  serviceSlug: slug,
                  status: "NOT_STARTED",
                  dataJson: withLifecycle({}, { state: "paused", reason: "pending_payment" }) as any,
                },
                select: { id: true },
              });
              return;
            }

            await prisma.portalServiceSetup.update({
              where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: slug } },
              data: { dataJson: withLifecycle(existing.dataJson, { state: "paused", reason: "pending_payment" }) as any },
              select: { id: true },
            });
          })(),
        );
      }
    }

    await Promise.all(
      provisionTasks.map((p) =>
        p.catch((err) => {
          console.error("/api/auth/client-signup provisioning failed", { requestId, error: err });
          return null;
        }),
      ),
    );

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

    const res = jsonResponse({ ok: true, user, signedIn: true });
    res.cookies.set({
      name: variant === "credit" ? CREDIT_PORTAL_SESSION_COOKIE_NAME : PORTAL_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(req),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e) {
    console.error("/api/auth/client-signup failed", { requestId, error: e });

    const prismaCode = typeof (e as any)?.code === "string" ? String((e as any).code) : null;
    if (prismaCode === "P2002") {
      return jsonResponse(
        { ok: false, error: "That email already has an account. Please sign in.", errorKey: "EMAIL_IN_USE" },
        { status: 409 },
      );
    }

    const msg = e instanceof Error ? e.message : "";
    const msgLower = msg.toLowerCase();
    const isSchemaMismatch =
      prismaCode === "P2021" ||
      prismaCode === "P2022" ||
      // Postgres enum mismatch (Role missing CLIENT, etc)
      (msgLower.includes("invalid input value for enum") && (msgLower.includes("role") || msgLower.includes("client"))) ||
      // Type mismatch from drift (e.g. column is text but prisma expects enum)
      (msgLower.includes("is of type") && msgLower.includes("but expression is of type")) ||
      // Common runtime drift errors
      msgLower.includes("relation") && msgLower.includes("does not exist") ||
      msgLower.includes("column") && msgLower.includes("does not exist");

    if (isSchemaMismatch) {
      return jsonResponse(
        {
          ok: false,
          error: "We’re updating our system. Please try again in a few minutes.",
          errorKey: "SCHEMA_MISMATCH",
        },
        { status: 503 },
      );
    }

    const message = e instanceof Error ? e.message : "Unknown error";
    const error = process.env.NODE_ENV === "production"
      ? "We couldn’t create your account right now. Please try again in a few minutes."
      : message;
    return jsonResponse({ ok: false, error, errorKey: "UNKNOWN" }, { status: 500 });
  }
}
