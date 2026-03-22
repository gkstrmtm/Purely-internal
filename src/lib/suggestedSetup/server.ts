import { prisma } from "@/lib/db";
import { resolveEntitlementsForOwnerId } from "@/lib/entitlements";
import type { Entitlements } from "@/lib/entitlements";
import { hasPublicTable } from "@/lib/dbSchema";
import { getReviewRequestsServiceData } from "@/lib/reviewRequests";
import { getAppointmentReminderSettingsForCalendar } from "@/lib/appointmentReminders";
import { getFollowUpSettings } from "@/lib/followUpAutomation";
import { getMissedCallTextBackServiceData } from "@/lib/missedCallTextBack";
import { getPortalDashboardData, type DashboardWidgetId } from "@/lib/portalDashboard";

import type { ActivationProfile, SuggestedSetupPreview, SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { proposeBlogsAutomationSettings, proposeBlogsCreateSite } from "@/lib/suggestedSetup/blogs";
import { proposeBookingConfigureSite } from "@/lib/suggestedSetup/booking";
import { proposeReviewsConfigureSettings } from "@/lib/suggestedSetup/reviews";
import { proposeNewsletterConfigureAutomation } from "@/lib/suggestedSetup/newsletter";
import { proposeNurtureCreateStarterCampaign } from "@/lib/suggestedSetup/nurture";
import { proposeLeadOutboundCreateCampaign } from "@/lib/suggestedSetup/leadOutbound";
import { proposeAiReceptionistConfigureSettings } from "@/lib/suggestedSetup/aiReceptionist";
import { proposeAutomationsInitialize } from "@/lib/suggestedSetup/automations";
import { proposeLeadScrapingConfigureSettings } from "@/lib/suggestedSetup/leadScraping";
import { proposeFunnelBuilderCreateStarterFunnel } from "@/lib/suggestedSetup/funnelBuilder";
import { proposeBookingConfigureReminders } from "@/lib/suggestedSetup/bookingReminders";
import { proposeFollowUpSeedTemplates } from "@/lib/suggestedSetup/followUp";
import { proposeMissedCallTextBackConfigureSettings } from "@/lib/suggestedSetup/missedCallTextback";
import { proposeDashboardAddWidgets } from "@/lib/suggestedSetup/dashboard";
import { proposeInboxInitialize } from "@/lib/suggestedSetup/inbox";
import { proposeTasksSeedStarterTasks } from "@/lib/suggestedSetup/tasks";
import { proposeMediaLibraryCreateStarterFolders } from "@/lib/suggestedSetup/mediaLibrary";

async function loadProfileLocation(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: "profile" } },
      select: { dataJson: true },
    })
    .catch(() => null);

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const city = typeof rec?.city === "string" ? rec.city.trim().slice(0, 120) : "";
  const state = typeof rec?.state === "string" ? rec.state.trim().slice(0, 40) : "";
  if (!city || !state) return null;
  return `${city}, ${state}`;
}

function goalsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 10) break;
  }
  return out;
}

export async function buildSuggestedSetupPreviewForOwner(ownerId: string): Promise<{
  entitlements: Entitlements;
  preview: SuggestedSetupPreview;
}> {
  const entitlements = await resolveEntitlementsForOwnerId(ownerId);

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
      brandSecondaryHex: true,
      brandAccentHex: true,
      brandTextHex: true,
      brandFontFamily: true,
      brandFontGoogleFamily: true,
    },
  });

  const activationProfile: ActivationProfile = {
    businessName: profile?.businessName ?? "",
    websiteUrl: profile?.websiteUrl ?? null,
    industry: profile?.industry ?? null,
    businessModel: profile?.businessModel ?? null,
    primaryGoals: goalsFromJson(profile?.primaryGoals),
    targetCustomer: profile?.targetCustomer ?? null,
    brandVoice: profile?.brandVoice ?? null,
    brand: {
      logoUrl: profile?.logoUrl ?? null,
      primaryHex: profile?.brandPrimaryHex ?? null,
      secondaryHex: profile?.brandSecondaryHex ?? null,
      accentHex: profile?.brandAccentHex ?? null,
      textHex: profile?.brandTextHex ?? null,
      fontFamily: profile?.brandFontFamily ?? null,
      fontGoogleFamily: profile?.brandFontGoogleFamily ?? null,
    },
    size: "small",
    tone: "professional",
  };

  const actions: SuggestedSetupAction[] = [];

  // Dashboard personalization (core)
  {
    const existing = await getPortalDashboardData(ownerId, "default").catch(() => null);
    const existingWidgetIds = (existing?.widgets ?? []).map((w) => w.id).filter(Boolean) as DashboardWidgetId[];

    const recommended: DashboardWidgetId[] = [
      "tasks",
      "inboxMessagesIn",
      "inboxMessagesOut",
      "mediaLibrary",
      ...(entitlements.booking ? (["bookingsCreated", "missedCalls"] as DashboardWidgetId[]) : []),
      ...(entitlements.reviews ? (["reviewsCollected", "avgReviewRating"] as DashboardWidgetId[]) : []),
      ...(entitlements.blog ? (["blogGenerations"] as DashboardWidgetId[]) : []),
      ...(entitlements.newsletter ? (["newsletterSends"] as DashboardWidgetId[]) : []),
      ...(entitlements.nurture ? (["nurtureEnrollments"] as DashboardWidgetId[]) : []),
      ...(entitlements.aiReceptionist ? (["aiCalls", "perfAiReceptionist", "perfMissedCallTextBack"] as DashboardWidgetId[]) : []),
      ...(entitlements.leadScraping ? (["leadScrapeRuns", "perfLeadScraping"] as DashboardWidgetId[]) : []),
      ...(entitlements.leadOutbound ? (["aiOutboundCalls"] as DashboardWidgetId[]) : []),
    ];

    const a = proposeDashboardAddWidgets({
      businessName: activationProfile.businessName,
      existingWidgetIds,
      recommendedWidgetIds: Array.from(new Set(recommended)),
    });
    if (a) actions.push(a);
  }

  // Inbox (core)
  {
    const row = await prisma.portalServiceSetup
      .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "inbox" } }, select: { dataJson: true } })
      .catch(() => null);
    const rec = row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson) ? (row.dataJson as any) : null;
    const token = typeof rec?.settings?.webhookToken === "string" ? String(rec.settings.webhookToken).trim() : "";
    const needsInit = !token || token.length < 12;
    const a = proposeInboxInitialize({ needsInit });
    if (a) actions.push(a);
  }

  // Tasks (core)
  {
    const hasTable = await hasPublicTable("PortalTask").catch(() => false);
    let hasAnyTasks = false;
    if (hasTable) {
      const rows = (await prisma
        .$queryRaw`select count(1)::int as "count" from "PortalTask" where "ownerId" = ${ownerId}`
        .catch(() => [])) as Array<{ count: number }>;
      const c = typeof rows?.[0]?.count === "number" ? rows[0].count : 0;
      hasAnyTasks = c > 0;
    }

    const a = proposeTasksSeedStarterTasks({ businessName: activationProfile.businessName, hasAnyTasks });
    if (a) actions.push(a);
  }

  // Media library (core)
  {
    const hasTable = await hasPublicTable("PortalMediaFolder").catch(() => false);
    let hasAnyRootFolders = false;
    if (hasTable) {
      const rows = (await prisma
        .$queryRaw`select count(1)::int as "count" from "PortalMediaFolder" where "ownerId" = ${ownerId} and "parentId" is null`
        .catch(() => [])) as Array<{ count: number }>;
      const c = typeof rows?.[0]?.count === "number" ? rows[0].count : 0;
      // If uploads already exists, count will be 1. We still want to offer the starter structure.
      hasAnyRootFolders = c >= 2;
    }

    const a = proposeMediaLibraryCreateStarterFolders({ hasAnyRootFolders });
    if (a) actions.push(a);
  }

  // Blogs
  if (entitlements.blog) {
    const [site, setup] = await Promise.all([
      prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }).catch(() => null),
      prisma.portalServiceSetup
        .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } }, select: { dataJson: true } })
        .catch(() => null),
    ]);

    const setupRec = setup?.dataJson && typeof setup.dataJson === "object" ? (setup.dataJson as any) : null;
    const enabledNow = Boolean(setupRec?.enabled);
    const topicsNow = Array.isArray(setupRec?.topics) ? setupRec.topics.filter((t: any) => typeof t === "string").slice(0, 50) : [];

    const a1 = proposeBlogsCreateSite({ businessName: activationProfile.businessName, exists: Boolean(site?.id) });
    if (a1) actions.push(a1);

    const a2 = proposeBlogsAutomationSettings({ enabledNow, topicsNow });
    if (a2) actions.push(a2);
  }

  // Booking
  if (entitlements.booking) {
    const site = await prisma.portalBookingSite
      .findUnique({ where: { ownerId }, select: { id: true, enabled: true } })
      .catch(() => null);
    const a = proposeBookingConfigureSite({
      businessName: activationProfile.businessName,
      exists: Boolean(site?.id),
      enabledNow: Boolean((site as any)?.enabled),
    });
    if (a) actions.push(a);

    const reminderSelected = await getAppointmentReminderSettingsForCalendar(ownerId, null).catch(() => null);
    const reminderSettings = reminderSelected?.settings ?? null;
    const reminderEnabledNow = Boolean((reminderSettings as any)?.enabled);
    const reminderSteps = Array.isArray((reminderSettings as any)?.steps) ? ((reminderSettings as any).steps as any[]) : [];
    const hasCustomizedSteps = reminderSteps.length > 1;
    const r = proposeBookingConfigureReminders({
      businessName: activationProfile.businessName,
      enabledNow: reminderEnabledNow,
      hasCustomizedSteps,
    });
    if (r) actions.push(r);
  }

  // Follow-up
  if (entitlements.booking) {
    const follow = await getFollowUpSettings(ownerId).catch(() => null);
    const enabledNow = Boolean((follow as any)?.enabled);
    const chainTemplates = Array.isArray((follow as any)?.chainTemplates) ? ((follow as any).chainTemplates as any[]) : [];
    const a = proposeFollowUpSeedTemplates({
      businessName: activationProfile.businessName,
      enabledNow,
      hasAnyChainTemplates: chainTemplates.length > 0,
    });
    if (a) actions.push(a);
  }

  // Reviews
  if (entitlements.reviews) {
    const reviewsData = await getReviewRequestsServiceData(ownerId).catch(() => null);
    const enabledNow = Boolean(reviewsData?.settings?.enabled);
    const a = proposeReviewsConfigureSettings({ businessName: activationProfile.businessName, enabledNow });
    if (a) actions.push(a);
  }

  // Newsletter
  if (entitlements.newsletter) {
    const setup = await prisma.portalServiceSetup
      .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } }, select: { dataJson: true } })
      .catch(() => null);
    const rec = setup?.dataJson && typeof setup.dataJson === "object" ? (setup.dataJson as any) : null;
    const enabledExternalNow = Boolean(rec?.external?.enabled);
    const enabledInternalNow = Boolean(rec?.internal?.enabled);
    const a = proposeNewsletterConfigureAutomation({
      businessName: activationProfile.businessName,
      enabledExternalNow,
      enabledInternalNow,
    });
    if (a) actions.push(a);
  }

  // Nurture
  if (entitlements.nurture) {
    const campaignCount = await prisma.portalNurtureCampaign.count({ where: { ownerId } }).catch(() => 0);
    const a = proposeNurtureCreateStarterCampaign({
      businessName: activationProfile.businessName,
      hasAnyCampaigns: campaignCount > 0,
    });
    if (a) actions.push(a);
  }

  // AI outbound calls
  if (entitlements.leadOutbound) {
    const count = await prisma.portalAiOutboundCallCampaign.count({ where: { ownerId } }).catch(() => 0);
    const a = proposeLeadOutboundCreateCampaign({ businessName: activationProfile.businessName, hasAnyCampaigns: count > 0 });
    if (a) actions.push(a);
  }

  // AI receptionist
  if (entitlements.aiReceptionist) {
    const setup = await prisma.portalServiceSetup
      .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "ai-receptionist" } }, select: { dataJson: true } })
      .catch(() => null);
    const rec = setup?.dataJson && typeof setup.dataJson === "object" ? (setup.dataJson as any) : null;
    const hasBusinessNameNow = Boolean(typeof rec?.settings?.businessName === "string" && rec.settings.businessName.trim());
    const a = proposeAiReceptionistConfigureSettings({
      businessName: activationProfile.businessName,
      hasBusinessNameNow,
    });
    if (a) actions.push(a);
  }

  // Missed-call text back (part of AI receptionist bundle)
  if (entitlements.aiReceptionist) {
    const data = await getMissedCallTextBackServiceData(ownerId).catch(() => null);
    const enabledNow = Boolean((data as any)?.settings?.enabled);
    const replyBodyNow = typeof (data as any)?.settings?.replyBody === "string" ? String((data as any).settings.replyBody) : "";
    const a = proposeMissedCallTextBackConfigureSettings({
      businessName: activationProfile.businessName,
      enabledNow,
      replyBodyNow,
    });
    if (a) actions.push(a);
  }

  // Automations
  if (entitlements.automations) {
    const setup = await prisma.portalServiceSetup
      .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "automations" } }, select: { dataJson: true } })
      .catch(() => null);
    const rec = setup?.dataJson && typeof setup.dataJson === "object" ? (setup.dataJson as any) : null;
    const webhookToken = typeof rec?.webhookToken === "string" ? rec.webhookToken.trim() : "";
    const automationsList = Array.isArray(rec?.automations) ? rec.automations : [];
    const a = proposeAutomationsInitialize({
      hasSetupRow: Boolean(setup),
      hasWebhookToken: webhookToken.length >= 12,
      automationCount: automationsList.length,
    });
    if (a) actions.push(a);
  }

  // Lead scraping
  if (entitlements.leadScraping) {
    const [setup, profileLocation] = await Promise.all([
      prisma.portalServiceSetup
        .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "lead-scraping" } }, select: { dataJson: true } })
        .catch(() => null),
      loadProfileLocation(ownerId),
    ]);

    const a = proposeLeadScrapingConfigureSettings({
      industry: activationProfile.industry,
      businessName: activationProfile.businessName,
      currentSettings: setup?.dataJson ?? null,
      profileLocation,
    });
    if (a) actions.push(a);
  }

  // Funnel builder (included service - no entitlement)
  {
    const funnelCount = await prisma.creditFunnel.count({ where: { ownerId } }).catch(() => 0);
    const a = proposeFunnelBuilderCreateStarterFunnel({
      businessName: activationProfile.businessName,
      hasAnyFunnels: funnelCount > 0,
    });
    if (a) actions.push(a);
  }

  return {
    entitlements,
    preview: {
      activationProfile,
      proposedActions: actions,
    },
  };
}
