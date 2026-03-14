import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicTable } from "@/lib/dbSchema";
import { MODULE_KEYS, type ModuleKey } from "@/lib/entitlements.shared";
import { normalizePhoneStrict } from "@/lib/phone";
import { PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } from "@/lib/portalBillingModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireManager(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const };
  if (role !== "MANAGER" && role !== "ADMIN") return { ok: false as const, status: 403 as const };
  return { ok: true as const, userId };
}

const querySchema = z.object({ ownerId: z.string().trim().min(1).max(64) });

const OVERRIDES_SETUP_SLUG = "__portal_entitlement_overrides";
const BILLING_MODEL_SETUP_SLUG = PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG;
const CREDITS_SETUP_SLUG = "credits";
const PROFILE_SETUP_SLUG = "profile";
const INTEGRATIONS_SETUP_SLUG = "integrations";
const AI_RECEPTIONIST_SETUP_SLUG = "ai-receptionist";

function parseOverrides(dataJson: unknown): Set<ModuleKey> {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const overridesRaw = rec?.overrides && typeof rec.overrides === "object" && !Array.isArray(rec.overrides)
    ? (rec.overrides as Record<string, unknown>)
    : null;

  const out = new Set<ModuleKey>();
  if (!overridesRaw) return out;
  for (const key of MODULE_KEYS) {
    if (overridesRaw[key] === true) out.add(key);
  }
  return out;
}

function parseCreditsOnlyOverride(dataJson: unknown): boolean {
  if (!dataJson || typeof dataJson !== "object" || Array.isArray(dataJson)) return false;
  const rec = dataJson as Record<string, unknown>;
  const rawModel = typeof rec.billingModel === "string" ? rec.billingModel.trim().toLowerCase() : "";
  if (rawModel === "credits" || rawModel === "credit" || rawModel === "credits_only" || rawModel === "credits-only") return true;
  if (typeof rec.creditsOnly === "boolean") return rec.creditsOnly;
  return false;
}

function parseCreditsBalance(dataJson: unknown): number {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const raw = rec?.balance;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function parseProfilePhoneE164(dataJson: unknown): string | null {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const raw = rec?.phone;
  if (typeof raw !== "string") return null;
  const parsed = normalizePhoneStrict(raw);
  return parsed.ok && parsed.e164 ? parsed.e164 : null;
}

function parseProfileVoiceAgentId(dataJson: unknown): string | null {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const raw = rec?.voiceAgentId;
  const id = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  return id ? id : null;
}

function parseAiReceptionistVoiceAgentId(dataJson: unknown): string | null {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const raw = typeof rec?.voiceAgentId === "string" ? rec.voiceAgentId : (typeof rec?.elevenLabsAgentId === "string" ? rec.elevenLabsAgentId : "");
  const id = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  return id ? id : null;
}

function parseTwilioFromNumberE164(dataJson: unknown): string | null {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const twilio = rec?.twilio && typeof rec.twilio === "object" && !Array.isArray(rec.twilio)
    ? (rec.twilio as Record<string, unknown>)
    : null;
  if (!twilio) return null;

  const accountSid = typeof twilio.accountSid === "string" ? twilio.accountSid.trim() : "";
  const authToken = typeof twilio.authToken === "string" ? twilio.authToken.trim() : "";
  const fromRaw = typeof twilio.fromNumberE164 === "string" ? twilio.fromNumberE164.trim() : "";
  const parsedFrom = normalizePhoneStrict(fromRaw);
  const fromNumberE164 = parsedFrom.ok && parsedFrom.e164 ? parsedFrom.e164 : "";

  if (!accountSid || !authToken || !fromNumberE164) return null;
  return fromNumberE164;
}

function maxDate(dates: Array<Date | null | undefined>) {
  let max = 0;
  for (const d of dates) {
    if (!d) continue;
    const t = d.getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max ? new Date(max) : null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const auth = requireManager(session);
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ ownerId: url.searchParams.get("ownerId") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });

  const ownerId = parsed.data.ownerId;

  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const user = await safe(
    async () =>
      prisma.user.findUnique({
        where: { id: ownerId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          timeZone: true,
          stripeAccountId: true,
          stripeConnectedAt: true,
        },
      }),
    null,
  );

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Portal setups / overrides
  const setups = await safe(
    async () =>
      prisma.portalServiceSetup.findMany({
        where: {
          ownerId,
          serviceSlug: {
            in: [OVERRIDES_SETUP_SLUG, BILLING_MODEL_SETUP_SLUG, CREDITS_SETUP_SLUG, PROFILE_SETUP_SLUG, INTEGRATIONS_SETUP_SLUG, AI_RECEPTIONIST_SETUP_SLUG],
          },
        },
        select: { serviceSlug: true, dataJson: true },
      }),
    [],
  );

  const getSetup = (slug: string) => setups.find((s) => s.serviceSlug === slug)?.dataJson;

  const overrides = Array.from(parseOverrides(getSetup(OVERRIDES_SETUP_SLUG)));
  const creditsOnlyOverride = parseCreditsOnlyOverride(getSetup(BILLING_MODEL_SETUP_SLUG));
  const creditsBalance = parseCreditsBalance(getSetup(CREDITS_SETUP_SLUG));
  const profilePhone = parseProfilePhoneE164(getSetup(PROFILE_SETUP_SLUG));
  const profileVoiceAgentId = parseProfileVoiceAgentId(getSetup(PROFILE_SETUP_SLUG));
  const aiReceptionistVoiceAgentId = parseAiReceptionistVoiceAgentId(getSetup(AI_RECEPTIONIST_SETUP_SLUG));
  const twilioFrom = parseTwilioFromNumberE164(getSetup(INTEGRATIONS_SETUP_SLUG));

  const mailbox = (await hasPublicTable("PortalMailboxAddress").catch(() => false))
    ? await safe(
        async () =>
          prisma.portalMailboxAddress.findUnique({ where: { ownerId }, select: { emailAddress: true, createdAt: true, updatedAt: true } }),
        null,
      )
    : null;

  const businessProfile = (await hasPublicTable("BusinessProfile").catch(() => false))
    ? await safe(
        async () =>
          prisma.businessProfile.findUnique({
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
              brandFontFamily: true,
              brandFontGoogleFamily: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
        null,
      )
    : null;

  const salesReportingSettings = await safe(
    async () =>
      prisma.salesReportingSettings.findUnique({
        where: { userId: ownerId },
        select: { activeProvider: true, updatedAt: true },
      }),
    null,
  );

  const salesReportingCredentials = await safe(
    async () =>
      prisma.salesReportingCredential.findMany({
        where: { userId: ownerId },
        select: { provider: true, displayHint: true, updatedAt: true, connectedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
    [],
  );

  const blogSite = await safe(
    async () =>
      prisma.clientBlogSite.findUnique({
        where: { ownerId },
        select: {
          id: true,
          name: true,
          slug: true,
          primaryDomain: true,
          verifiedAt: true,
          updatedAt: true,
        },
      }),
    null,
  );

  const blogCounts = blogSite
    ? await Promise.all([
        safe(() => prisma.clientBlogPost.count({ where: { siteId: blogSite.id, archivedAt: null } }), 0),
        safe(() => prisma.clientBlogPost.count({ where: { siteId: blogSite.id, archivedAt: null, status: "PUBLISHED" } }), 0),
        safe(() => prisma.clientBlogPost.count({ where: { siteId: blogSite.id, archivedAt: null, status: "DRAFT" } }), 0),
        safe(() => prisma.portalBlogGenerationEvent.count({ where: { ownerId, createdAt: { gte: since30 } } }), 0),
      ])
    : [0, 0, 0, 0];

  const [blogPostsTotal, blogPostsPublished, blogPostsDraft, blogGenLast30] = blogCounts;

  const newsletterGenLast30 = blogSite
    ? await safe(() => prisma.portalNewsletterGenerationEvent.count({ where: { ownerId, createdAt: { gte: since30 } } }), 0)
    : 0;

  const newsletterSendAgg = blogSite
    ? await safe(
        async () =>
          prisma.portalNewsletterSendEvent.aggregate({
            where: { ownerId, createdAt: { gte: since30 } },
            _count: { id: true },
            _sum: { requestedCount: true, sentCount: true, failedCount: true },
          }),
        { _count: { id: 0 }, _sum: { requestedCount: 0, sentCount: 0, failedCount: 0 } },
      )
    : { _count: { id: 0 }, _sum: { requestedCount: 0, sentCount: 0, failedCount: 0 } };

  const leadScrapeAgg = await safe(
    async () =>
      prisma.portalLeadScrapeRun.aggregate({
        where: { ownerId, createdAt: { gte: since30 } },
        _count: { id: true },
        _sum: { requestedCount: true, createdCount: true, chargedCredits: true, refundedCredits: true },
      }),
    { _count: { id: 0 }, _sum: { requestedCount: 0, createdCount: 0, chargedCredits: 0, refundedCredits: 0 } },
  );

  const leadScrapeErrorsLast30 = await safe(
    async () => prisma.portalLeadScrapeRun.count({ where: { ownerId, createdAt: { gte: since30 }, error: { not: null } } }),
    0,
  );

  const reviewsLast30 = await safe(
    async () => prisma.portalReview.count({ where: { ownerId, createdAt: { gte: since30 }, archivedAt: null } }),
    0,
  );

  const hoursSavedAgg = await safe(
    async () =>
      prisma.portalHoursSavedEvent.aggregate({
        where: { ownerId, occurredAt: { gte: since30 } },
        _count: { id: true },
        _sum: { secondsSaved: true },
      }),
    { _count: { id: 0 }, _sum: { secondsSaved: 0 } },
  );

  const bookingSite = await safe(
    async () =>
      prisma.portalBookingSite.findUnique({
        where: { ownerId },
        select: { id: true, enabled: true, slug: true, title: true, updatedAt: true },
      }),
    null,
  );

  const bookingsLast30 = bookingSite
    ? await safe(
        async () => prisma.portalBooking.count({ where: { siteId: bookingSite.id, createdAt: { gte: since30 } } }),
        0,
      )
    : 0;

  const bookingsUpcoming = bookingSite
    ? await safe(
        async () =>
          prisma.portalBooking.count({
            where: { siteId: bookingSite.id, status: "SCHEDULED", startAt: { gte: new Date() } },
          }),
        0,
      )
    : 0;

  const lastActivityAt = maxDate([
    blogSite?.updatedAt,
    bookingSite?.updatedAt,
    salesReportingSettings?.updatedAt,
    mailbox?.updatedAt,
    businessProfile?.updatedAt,
    salesReportingCredentials[0]?.updatedAt,
  ]);

  const usageCounts = {
    blogGenLast30,
    newsletterGenLast30,
    newsletterSendEventsLast30: Number(newsletterSendAgg._count.id ?? 0),
    leadScrapeRunsLast30: Number(leadScrapeAgg._count.id ?? 0),
    reviewsLast30,
    bookingsCreatedLast30: bookingsLast30,
    hoursSavedEventsLast30: Number(hoursSavedAgg._count.id ?? 0),
  };

  const mostUsedServices = Object.entries(usageCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 4)
    .map(([k, v]) => ({ key: k, count: v }));

  return NextResponse.json({
    ok: true,
    owner: {
      id: user.id,
      email: user.email,
      name: user.name,
      active: user.active,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      timeZone: user.timeZone,
      stripe: {
        connected: Boolean(user.stripeAccountId && user.stripeConnectedAt),
        accountId: user.stripeAccountId ?? null,
        connectedAt: user.stripeConnectedAt ?? null,
      },
      portal: {
        creditsOnlyOverride,
        creditsBalance,
        overrides,
        phone: profilePhone,
        mailboxEmail: mailbox?.emailAddress ?? null,
      },
      ai: {
        voiceAgentIds: {
          profile: profileVoiceAgentId,
          aiReceptionist: aiReceptionistVoiceAgentId,
        },
      },
      integrations: {
        twilio: {
          configured: Boolean(twilioFrom),
          fromNumberE164: twilioFrom,
        },
        salesReporting: {
          activeProvider: salesReportingSettings?.activeProvider ?? null,
          connectedProviders: salesReportingCredentials.map((c) => ({ provider: c.provider, displayHint: c.displayHint ?? null })),
        },
      },
      businessProfile: businessProfile
        ? {
            businessName: businessProfile.businessName,
            websiteUrl: businessProfile.websiteUrl,
            industry: businessProfile.industry,
            businessModel: businessProfile.businessModel,
            primaryGoals: Array.isArray(businessProfile.primaryGoals) ? businessProfile.primaryGoals : businessProfile.primaryGoals,
            targetCustomer: businessProfile.targetCustomer,
            brandVoice: businessProfile.brandVoice,
            logoUrl: businessProfile.logoUrl,
            brandPrimaryHex: businessProfile.brandPrimaryHex,
            brandAccentHex: businessProfile.brandAccentHex,
            brandTextHex: businessProfile.brandTextHex,
            brandFontFamily: businessProfile.brandFontFamily,
            brandFontGoogleFamily: businessProfile.brandFontGoogleFamily,
            updatedAt: businessProfile.updatedAt,
          }
        : null,
      content: {
        blogSite: blogSite
          ? {
              name: blogSite.name,
              slug: blogSite.slug,
              primaryDomain: blogSite.primaryDomain,
              verifiedAt: blogSite.verifiedAt,
              posts: {
                total: blogPostsTotal,
                published: blogPostsPublished,
                draft: blogPostsDraft,
              },
            }
          : null,
      },
      usage: {
        since30,
        mostUsedServices,
        counts: usageCounts,
        blog: {
          generationEventsLast30: blogGenLast30,
        },
        newsletter: {
          generationEventsLast30: newsletterGenLast30,
          sendEventsLast30: Number(newsletterSendAgg._count.id ?? 0),
          requestedLast30: Number(newsletterSendAgg._sum.requestedCount ?? 0),
          sentLast30: Number(newsletterSendAgg._sum.sentCount ?? 0),
          failedLast30: Number(newsletterSendAgg._sum.failedCount ?? 0),
        },
        leadScraping: {
          runsLast30: Number(leadScrapeAgg._count.id ?? 0),
          requestedLast30: Number(leadScrapeAgg._sum.requestedCount ?? 0),
          createdLast30: Number(leadScrapeAgg._sum.createdCount ?? 0),
          chargedCreditsLast30: Number(leadScrapeAgg._sum.chargedCredits ?? 0),
          refundedCreditsLast30: Number(leadScrapeAgg._sum.refundedCredits ?? 0),
          errorsLast30: leadScrapeErrorsLast30,
        },
        reviews: {
          receivedLast30: reviewsLast30,
        },
        booking: {
          site: bookingSite
            ? {
                enabled: bookingSite.enabled,
                slug: bookingSite.slug,
                title: bookingSite.title,
              }
            : null,
          bookingsCreatedLast30: bookingsLast30,
          bookingsUpcoming,
        },
        hoursSaved: {
          eventsLast30: Number(hoursSavedAgg._count.id ?? 0),
          secondsLast30: Number(hoursSavedAgg._sum.secondsSaved ?? 0),
        },
        lastActivityAt,
      },
    },
  });
}
