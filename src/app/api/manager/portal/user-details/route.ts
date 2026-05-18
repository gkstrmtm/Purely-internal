import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { bugReportSummariesFromFeedback, parsePortalFeedbackPayload } from "@/lib/betaFeedback";
import { prisma } from "@/lib/db";
import { hasPublicTable } from "@/lib/dbSchema";
import { MODULE_KEYS, type ModuleKey } from "@/lib/entitlements.shared";
import { normalizePhoneStrict } from "@/lib/phone";
import { PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } from "@/lib/portalBillingModel";
import { platformAdminAuthError } from "@/lib/platformAdminGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({ ownerId: z.string().trim().min(1).max(64) });

const OVERRIDES_SETUP_SLUG = "__portal_entitlement_overrides";
const BILLING_MODEL_SETUP_SLUG = PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG;
const CREDITS_SETUP_SLUG = "credits";
const PROFILE_SETUP_SLUG = "profile";
const INTEGRATIONS_SETUP_SLUG = "integrations";
const AI_RECEPTIONIST_SETUP_SLUG = "ai-receptionist";
const ENGAGEMENT_SETUP_SLUG = "portal_engagement";
const DIAGNOSTICS_SETUP_SLUG = "portal_diagnostics";
const BUG_REPORT_SETUP_SLUG = "bug-reports";
const DELETED_ACCOUNT_SETUP_SLUG = "__portal_deleted_account";

function parseDeletedAccountTombstone(dataJson: unknown): { originalEmail: string | null; originalName: string | null; deletedAtIso: string | null } {
  if (!dataJson || typeof dataJson !== "object" || Array.isArray(dataJson)) return { originalEmail: null, originalName: null, deletedAtIso: null };
  const rec = dataJson as Record<string, unknown>;
  const originalEmail = typeof rec.originalEmail === "string" ? rec.originalEmail.trim().slice(0, 320) : "";
  const originalName = typeof rec.originalName === "string" ? rec.originalName.trim().slice(0, 200) : "";
  const deletedAtIso = typeof rec.deletedAtIso === "string" ? rec.deletedAtIso.trim().slice(0, 64) : "";
  return { originalEmail: originalEmail || null, originalName: originalName || null, deletedAtIso: deletedAtIso || null };
}

function readObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readRecordNumberMap(value: unknown): Record<string, number> {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!rec) return {};
  const out: Record<string, number> = {};
  for (const [kRaw, vRaw] of Object.entries(rec)) {
    const k = String(kRaw || "").trim();
    if (!k) continue;
    const n = typeof vRaw === "number" ? vRaw : typeof vRaw === "string" ? Number(vRaw) : NaN;
    if (!Number.isFinite(n)) continue;
    out[k] = Math.max(0, Math.floor(n));
  }
  return out;
}

function readActivityList(value: unknown): Array<{ atMs: number; path: string; pageKey?: string; dtSec: number }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ atMs: number; path: string; pageKey?: string; dtSec: number }> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r: any = raw as any;
    const atMs = Number.isFinite(Number(r.atMs)) ? Math.max(0, Math.floor(Number(r.atMs))) : 0;
    const dtSec = Number.isFinite(Number(r.dtSec)) ? Math.max(1, Math.min(60, Math.floor(Number(r.dtSec)))) : 0;
    const path = typeof r.path === "string" ? r.path.trim().slice(0, 512) : "";
    const pageKey = typeof r.pageKey === "string" ? r.pageKey.trim().slice(0, 140) : "";
    if (!atMs || !dtSec || !path) continue;
    out.push(pageKey ? { atMs, dtSec, path, pageKey } : { atMs, dtSec, path });
  }
  out.sort((a, b) => b.atMs - a.atMs);
  return out;
}

function readPortalDiagnostics(value: unknown): Array<{
  id: string;
  kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure";
  createdAtIso: string;
  lastSeenAtIso: string;
  count: number;
  message: string;
  path?: string;
  source?: string;
  file?: string;
  line?: number;
  column?: number;
  meta?: Record<string, unknown>;
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.events)) return [];
  return rec.events.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [] as Array<any>;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const kind =
      item.kind === "runtime_error" ||
      item.kind === "unhandled_rejection" ||
      item.kind === "resource_error" ||
      item.kind === "action_failure"
        ? item.kind
        : null;
    const createdAtIso = typeof item.createdAtIso === "string" ? item.createdAtIso.trim() : "";
    const lastSeenAtIso = typeof item.lastSeenAtIso === "string" ? item.lastSeenAtIso.trim() : createdAtIso;
    const message = typeof item.message === "string" ? item.message.trim().slice(0, 4000) : "";
    const count = Number.isFinite(Number(item.count)) ? Math.max(1, Math.floor(Number(item.count))) : 1;
    if (!id || !kind || !createdAtIso || !message) return [] as Array<any>;
    return [
      {
        id,
        kind,
        createdAtIso,
        lastSeenAtIso: lastSeenAtIso || createdAtIso,
        count,
        message,
        ...(typeof item.path === "string" && item.path.trim() ? { path: item.path.trim().slice(0, 512) } : {}),
        ...(typeof item.source === "string" && item.source.trim() ? { source: item.source.trim().slice(0, 64) } : {}),
        ...(typeof item.file === "string" && item.file.trim() ? { file: item.file.trim().slice(0, 2000) } : {}),
        ...(Number.isFinite(Number(item.line)) ? { line: Math.max(0, Math.floor(Number(item.line))) } : {}),
        ...(Number.isFinite(Number(item.column)) ? { column: Math.max(0, Math.floor(Number(item.column))) } : {}),
        ...(item.meta && typeof item.meta === "object" && !Array.isArray(item.meta) ? { meta: item.meta as Record<string, unknown> } : {}),
      },
    ];
  });
}

function readMetaString(meta: Record<string, unknown> | undefined, key: string) {
  if (!meta) return null;
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetaNumber(meta: Record<string, unknown> | undefined, key: string) {
  if (!meta) return null;
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function incrementMap(map: Map<string, number>, key: string | null | undefined, amount: number) {
  const safeKey = String(key || "unknown").trim() || "unknown";
  map.set(safeKey, (map.get(safeKey) ?? 0) + Math.max(1, amount));
}

function bucketLabelForEnvironment(key: string) {
  if (key === "local") return "Local / dev";
  if (key === "preview") return "Preview";
  if (key === "production") return "Production";
  return "Unknown";
}

function bucketLabelForSurface(key: string) {
  if (key === "admin_portal") return "Admin portal";
  if (key === "hosted_funnel") return "Hosted funnel";
  if (key === "public_site") return "Public site";
  return "Unknown";
}

function bucketLabelForAudience(key: string) {
  if (key === "internal_operator") return "Internal operator";
  if (key === "customer_surface") return "Customer-facing";
  return "Unknown";
}

function feedbackCategoryLabel(key: string) {
  if (key === "bug") return "Bug";
  if (key === "request") return "Request";
  if (key === "idea") return "Idea";
  if (key === "confusion") return "Confusion";
  if (key === "praise") return "Praise";
  return "Unknown";
}

function feedbackStatusLabel(key: string) {
  if (key === "new") return "New";
  if (key === "reviewing") return "Reviewing";
  if (key === "planned") return "Planned";
  if (key === "shipped") return "Shipped";
  if (key === "closed") return "Closed";
  return "Unknown";
}

function topBuckets(map: Map<string, number>, labelFor: (key: string) => string, take: number) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([key, count]) => ({ key, label: labelFor(key), count }));
}

function topEntriesByValue(map: Record<string, number>, take: number): Array<{ key: string; seconds: number }> {
  return Object.entries(map)
    .filter(([k, v]) => Boolean(k) && Number.isFinite(v) && v > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, take)
    .map(([k, v]) => ({ key: k, seconds: Number(v) }));
}

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
  const auth = await requirePlatformAdminSession();
  if (!auth.ok) return NextResponse.json({ error: platformAdminAuthError(auth.status) }, { status: auth.status });

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
            in: [
              OVERRIDES_SETUP_SLUG,
              BILLING_MODEL_SETUP_SLUG,
              CREDITS_SETUP_SLUG,
              PROFILE_SETUP_SLUG,
              INTEGRATIONS_SETUP_SLUG,
              AI_RECEPTIONIST_SETUP_SLUG,
              ENGAGEMENT_SETUP_SLUG,
              DIAGNOSTICS_SETUP_SLUG,
              BUG_REPORT_SETUP_SLUG,
              DELETED_ACCOUNT_SETUP_SLUG,
            ],
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

  const engagementJson = getSetup(ENGAGEMENT_SETUP_SLUG);
  const engagementRec = readObj(engagementJson);
  const engagementLastSeenAtMs = Number.isFinite(Number(engagementRec.lastSeenAtMs)) ? Math.floor(Number(engagementRec.lastSeenAtMs)) : 0;
  const engagementLastSeenAt = engagementLastSeenAtMs ? new Date(engagementLastSeenAtMs) : null;
  const engagementLastSeenPath = typeof engagementRec.lastSeenPath === "string" ? engagementRec.lastSeenPath.trim().slice(0, 512) : null;
  const engagementLastSeenPageKey = typeof engagementRec.lastSeenPageKey === "string" ? engagementRec.lastSeenPageKey.trim().slice(0, 140) : null;
  const pathTimeSec = readRecordNumberMap(engagementRec.pathTimeSec);
  const serviceTimeSec = readRecordNumberMap(engagementRec.serviceTimeSec);
  const recentActivity = readActivityList(engagementRec.recentActivity);
  const topPages = topEntriesByValue(pathTimeSec, 12);
  const topServicesByTime = topEntriesByValue(serviceTimeSec, 8);
  const portalDiagnostics = readPortalDiagnostics(getSetup(DIAGNOSTICS_SETUP_SLUG));
  const feedbackItems = parsePortalFeedbackPayload(getSetup(BUG_REPORT_SETUP_SLUG)).items;
  const bugReports = bugReportSummariesFromFeedback(feedbackItems);
  const diagnosticsLastSeenAt = portalDiagnostics.length
    ? portalDiagnostics
        .map((item) => Date.parse(item.lastSeenAtIso || item.createdAtIso))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a)[0] ?? null
    : null;
  const diagnosticsCounts = portalDiagnostics.reduce(
    (acc, item) => {
      if (item.kind === "action_failure") acc.actionFailureCount += item.count;
      if (item.kind === "runtime_error") acc.runtimeErrorCount += item.count;
      if (item.kind === "unhandled_rejection") acc.unhandledRejectionCount += item.count;
      if (item.kind === "resource_error") acc.resourceErrorCount += item.count;
      return acc;
    },
    { actionFailureCount: 0, runtimeErrorCount: 0, unhandledRejectionCount: 0, resourceErrorCount: 0 },
  );
  const diagnosticsSegments = { localOperator: 0, previewOperator: 0, productionOperator: 0, customerFacing: 0, unknown: 0 };
  const diagnosticsEnvironmentMap = new Map<string, number>();
  const diagnosticsSurfaceMap = new Map<string, number>();
  const diagnosticsAudienceMap = new Map<string, number>();
  const diagnosticsHostMap = new Map<string, number>();
  const diagnosticsPathMap = new Map<string, number>();
  const diagnosticsActionMap = new Map<string, { area: string; action: string; count: number }>();
  const feedbackCategoryMap = new Map<string, number>();
  const feedbackStatusMap = new Map<string, number>();

  for (const item of portalDiagnostics) {
    const environment = readMetaString(item.meta, "viewEnvironment") || "unknown";
    const surface = readMetaString(item.meta, "viewSurface") || "unknown";
    const audience = readMetaString(item.meta, "viewAudience") || "unknown";
    const host = readMetaString(item.meta, "viewHost") || "unknown";

    incrementMap(diagnosticsEnvironmentMap, environment, item.count);
    incrementMap(diagnosticsSurfaceMap, surface, item.count);
    incrementMap(diagnosticsAudienceMap, audience, item.count);
    incrementMap(diagnosticsHostMap, host, item.count);
    if (item.path) incrementMap(diagnosticsPathMap, item.path, item.count);

    if (audience === "internal_operator" && environment === "local") diagnosticsSegments.localOperator += item.count;
    else if (audience === "internal_operator" && environment === "preview") diagnosticsSegments.previewOperator += item.count;
    else if (audience === "internal_operator" && environment === "production") diagnosticsSegments.productionOperator += item.count;
    else if (audience === "customer_surface") diagnosticsSegments.customerFacing += item.count;
    else diagnosticsSegments.unknown += item.count;

    if (item.kind === "action_failure") {
      const area = readMetaString(item.meta, "area") || "unknown";
      const action = readMetaString(item.meta, "action") || "unknown";
      const key = `${area}::${action}`;
      const prev = diagnosticsActionMap.get(key);
      if (prev) prev.count += item.count;
      else diagnosticsActionMap.set(key, { area, action, count: item.count });
    }
  }

  for (const item of feedbackItems) {
    incrementMap(feedbackCategoryMap, item.category, 1);
    incrementMap(feedbackStatusMap, item.triage.status, 1);
  }

  const deletedTombstone = parseDeletedAccountTombstone(getSetup(DELETED_ACCOUNT_SETUP_SLUG));
  const displayEmail = deletedTombstone.originalEmail ?? user.email;
  const displayName = deletedTombstone.originalName ?? user.name;

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
    engagementLastSeenAt,
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

  const siteSlug = blogSite ? String(blogSite.slug || blogSite.id || "").trim() : "";
  const domainHost = blogSite?.primaryDomain && blogSite?.verifiedAt ? String(blogSite.primaryDomain).trim() : "";
  const hostify = (path: string) => (domainHost ? `https://${domainHost}${path}` : path);

  const funnels = await safe(
    async () =>
      prisma.creditFunnel.findMany({
        where: { ownerId },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          updatedAt: true,
          pages: { select: { slug: true, title: true }, orderBy: { sortOrder: "asc" } },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    [],
  );

  const blogPosts = blogSite
    ? await safe(
        async () =>
          prisma.clientBlogPost.findMany({
            where: { siteId: blogSite.id, archivedAt: null, status: "PUBLISHED" },
            select: { slug: true, title: true, publishedAt: true },
            orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
            take: 50,
          }),
        [],
      )
    : [];

  const newsletters = blogSite
    ? await safe(
        async () =>
          prisma.clientNewsletter.findMany({
            where: { siteId: blogSite.id, kind: "EXTERNAL", status: "SENT" },
            select: { slug: true, title: true, sentAt: true },
            orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
            take: 50,
          }),
        [],
      )
    : [];

  const hostedLinks = {
    funnels: funnels.map((f) => ({
      name: f.name,
      slug: f.slug,
      url: hostify(`/f/${encodeURIComponent(f.slug)}`),
      pages: (f.pages || []).slice(0, 50).map((p) => ({ title: p.title, slug: p.slug, url: hostify(`/f/${encodeURIComponent(f.slug)}/${encodeURIComponent(p.slug)}`) })),
    })),
    blog: siteSlug
      ? {
          indexUrl: hostify(`/${encodeURIComponent(siteSlug)}/blogs`),
          posts: blogPosts.map((p) => ({ title: p.title, slug: p.slug, url: hostify(`/${encodeURIComponent(siteSlug)}/blogs/${encodeURIComponent(p.slug)}`) })),
        }
      : null,
    newsletters: siteSlug
      ? {
          indexUrl: hostify(`/${encodeURIComponent(siteSlug)}/newsletters`),
          items: newsletters.map((n) => ({ title: n.title, slug: n.slug, url: hostify(`/${encodeURIComponent(siteSlug)}/newsletters/${encodeURIComponent(n.slug)}`) })),
        }
      : null,
    reviews: siteSlug ? { indexUrl: hostify(`/${encodeURIComponent(siteSlug)}/reviews`) } : null,
    booking: bookingSite?.slug ? { url: hostify(`/book/${encodeURIComponent(bookingSite.slug)}`), slug: bookingSite.slug } : null,
  };

  return NextResponse.json({
    ok: true,
    owner: {
      id: user.id,
      email: displayEmail,
      name: displayName,
      active: user.active,
      role: user.role,
      deletedAt: deletedTombstone.deletedAtIso ?? null,
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
        portalEngagement: {
          lastSeenAt: engagementLastSeenAt ? engagementLastSeenAt.toISOString() : null,
          lastSeenPath: engagementLastSeenPath,
          lastSeenPageKey: engagementLastSeenPageKey,
          topPages,
          topServicesByTime,
          recentActivity: recentActivity.slice(0, 500),
        },
        portalDiagnostics: {
          lastSeenAt: diagnosticsLastSeenAt ? new Date(diagnosticsLastSeenAt).toISOString() : null,
          actionFailureCount: diagnosticsCounts.actionFailureCount,
          runtimeErrorCount: diagnosticsCounts.runtimeErrorCount,
          unhandledRejectionCount: diagnosticsCounts.unhandledRejectionCount,
          resourceErrorCount: diagnosticsCounts.resourceErrorCount,
          segments: diagnosticsSegments,
          contexts: {
            environments: topBuckets(diagnosticsEnvironmentMap, bucketLabelForEnvironment, 6),
            surfaces: topBuckets(diagnosticsSurfaceMap, bucketLabelForSurface, 6),
            audiences: topBuckets(diagnosticsAudienceMap, bucketLabelForAudience, 6),
            hosts: topBuckets(diagnosticsHostMap, (key) => key, 8),
          },
          topPaths: Array.from(diagnosticsPathMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([path, count]) => ({ path, count })),
          topActions: Array.from(diagnosticsActionMap.values()).sort((a, b) => b.count - a.count).slice(0, 8),
          recentEvents: portalDiagnostics.slice(0, 100).map((item) => ({
            id: item.id,
            kind: item.kind,
            createdAtIso: item.createdAtIso,
            lastSeenAtIso: item.lastSeenAtIso,
            count: item.count,
            message: item.message,
            ...(item.path ? { path: item.path } : {}),
            ...(item.source ? { source: item.source } : {}),
            ...(item.file ? { file: item.file } : {}),
            ...(typeof item.line === "number" ? { line: item.line } : {}),
            ...(typeof item.column === "number" ? { column: item.column } : {}),
            area: readMetaString(item.meta, "area"),
            action: readMetaString(item.meta, "action"),
            status: readMetaNumber(item.meta, "status"),
            viewHost: readMetaString(item.meta, "viewHost"),
            viewEnvironment: readMetaString(item.meta, "viewEnvironment") || "unknown",
            viewSurface: readMetaString(item.meta, "viewSurface") || "unknown",
            viewAudience: readMetaString(item.meta, "viewAudience") || "unknown",
          })),
          bugReports: {
            count: bugReports.length,
            lastReportedAt: bugReports[0]?.createdAtIso ?? null,
          },
          betaFeedback: {
            count: feedbackItems.length,
            lastSubmittedAt: feedbackItems[0]?.createdAtIso ?? null,
            categories: topBuckets(feedbackCategoryMap, feedbackCategoryLabel, 8),
            statuses: topBuckets(feedbackStatusMap, feedbackStatusLabel, 8),
            recentItems: feedbackItems.slice(0, 40).map((item) => ({
              id: item.id,
              createdAtIso: item.createdAtIso,
              updatedAtIso: item.updatedAtIso ?? null,
              title: item.title,
              message: item.message,
              expected: item.expected ?? null,
              category: item.category,
              severity: item.severity,
              area: item.area ?? null,
              path: item.path ?? null,
              serviceSlug: item.serviceSlug ?? null,
              portalVariant: item.portalVariant ?? null,
              reporterEmail: item.reporterEmail ?? null,
              artifactUrl: item.artifactUrl ?? null,
              triage: {
                status: item.triage.status,
                priority: item.triage.priority,
                backlogRef: item.triage.backlogRef ?? null,
                promptRef: item.triage.promptRef ?? null,
                exportBucket: item.triage.exportBucket ?? null,
                notes: item.triage.notes ?? null,
                reviewerEmail: item.triage.reviewerEmail ?? null,
                lastReviewedAtIso: item.triage.lastReviewedAtIso ?? null,
              },
            })),
          },
        },
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
      hostedLinks,
    },
  });
}
