import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getCreditsState } from "@/lib/credits";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getPortalBusinessProfile } from "@/lib/portalBusinessProfile.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OnboardingProfileFieldKey =
  | "businessName"
  | "websiteUrl"
  | "industry"
  | "businessModel"
  | "primaryGoals"
  | "targetCustomer"
  | "brandVoice"
  | "businessContextNotes";

const ONBOARDING_PROFILE_FIELD_LABELS: Record<OnboardingProfileFieldKey, string> = {
  businessName: "business name",
  websiteUrl: "website",
  industry: "industry",
  businessModel: "business model",
  primaryGoals: "primary goals",
  targetCustomer: "target customer",
  brandVoice: "brand voice",
  businessContextNotes: "business notes",
};

function isFilledString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFilledStringArray(value: unknown) {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);
}

function formatMissingFieldSummary(labels: string[]) {
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export async function GET() {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const [profileResult, blogSite, creditsState] = await Promise.all([
    getPortalBusinessProfile({ ownerId }).catch(() => ({ status: 500, json: { ok: false, profile: null } })),
    prisma.clientBlogSite.findUnique({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
      },
    }),
    getCreditsState(ownerId).catch(() => ({ balance: 0, autoTopUp: false })),
  ]);
  const profile = profileResult?.json?.ok && profileResult.json?.profile && typeof profileResult.json.profile === "object"
    ? (profileResult.json.profile as {
        businessName?: string | null;
        websiteUrl?: string | null;
        industry?: string | null;
        businessModel?: string | null;
        primaryGoals?: unknown;
        targetCustomer?: string | null;
        brandVoice?: string | null;
        businessContextNotes?: string | null;
      })
    : null;

  const businessProfileComplete = Boolean(profile?.businessName?.trim());
  const blogsSetupComplete = Boolean(blogSite?.id);
  const creditsBalance = typeof creditsState?.balance === "number" && Number.isFinite(creditsState.balance) ? Math.max(0, creditsState.balance) : 0;
  const missingProfileFieldKeys = ([
    !isFilledString(profile?.businessName) ? "businessName" : null,
    !isFilledString(profile?.websiteUrl) ? "websiteUrl" : null,
    !isFilledString(profile?.industry) ? "industry" : null,
    !isFilledString(profile?.businessModel) ? "businessModel" : null,
    !isFilledStringArray(profile?.primaryGoals) ? "primaryGoals" : null,
    !isFilledString(profile?.targetCustomer) ? "targetCustomer" : null,
    !isFilledString(profile?.brandVoice) ? "brandVoice" : null,
    !isFilledString(profile?.businessContextNotes) ? "businessContextNotes" : null,
  ].filter(Boolean) as OnboardingProfileFieldKey[]);
  const missingProfileFields = missingProfileFieldKeys.map((key) => ({
    key,
    label: ONBOARDING_PROFILE_FIELD_LABELS[key],
  }));
  const recommendedTasks = [
    {
      key: "profile.complete",
      label: "Finish your business profile",
      status: missingProfileFields.length ? "pending" : "ready",
    },
    {
      key: "credits.add",
      label: "Add credits for usage-based work",
      status: creditsBalance > 0 ? "ready" : "pending",
    },
    {
      key: "blogs.setup",
      label: blogsSetupComplete ? "Review your blogs automation" : "Set up blogs automation",
      status: blogsSetupComplete ? "ready" : "pending",
    },
    { key: "inbox.connect", label: "Connect inbox", status: "pending" },
    { key: "reviews.setup", label: "Turn on reviews", status: "pending" },
    { key: "automations.setup", label: "Build automations", status: "pending" },
    { key: "funnel_builder.setup", label: "Start Funnel Builder", status: "pending" },
    { key: "nurture.setup", label: "Set up nurture campaigns", status: "pending" },
  ] as const;
  const missingFieldSummary = formatMissingFieldSummary(missingProfileFields.map((field) => field.label));
  const starterPrompt = [
    "You are helping a new portal customer onboard inside Pura.",
    "Start by checking the onboarding status below and ask only for missing business-profile information.",
    "Once you have enough information, help the user move through the setup tasks in one coordinated flow.",
    "Batch related work where possible, but keep confirmation for anything that charges credits, starts billing, or sends messages externally.",
    "Be explicit about what is already complete, what still needs answers, and what you can handle next.",
    `Missing profile fields: ${missingFieldSummary || "none"}.`,
    `Credits ready: ${creditsBalance > 0 ? `${creditsBalance} available` : "none yet"}.`,
    `Blogs setup: ${blogsSetupComplete ? "already set up" : "still needs setup"}.`,
    "Recommended onboarding tasks: finish profile, add credits if needed, set up blogs, connect inbox, turn on reviews, build automations, start Funnel Builder, and set up nurture campaigns.",
    "Open with a short onboarding summary, ask the next missing question or questions, and offer to keep handling the rest in this same thread.",
  ].join("\n");
  const summary = missingProfileFields.length
    ? `Pura will ask only for your missing ${missingFieldSummary}, then help you move through the remaining setup tasks.`
    : "Pura already has your core business profile and can jump straight into the remaining setup tasks.";

  return NextResponse.json({
    businessProfileComplete,
    blogsSetupComplete,
    creditsBalance,
    needsOnboarding: !businessProfileComplete,
    profile,
    blogSite,
    puraOnboarding: {
      summary,
      missingProfileFields,
      recommendedTasks,
      starterPrompt,
      threadContext: {
        kind: "portal_onboarding",
        missingProfileFields,
        recommendedTaskKeys: recommendedTasks.map((task) => task.key),
        summary,
      },
    },
  });
}
