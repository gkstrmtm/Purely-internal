import crypto from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/leadOutbound";
import {
  createPortalAccountInvite,
  getPortalAccountMemberRole,
  listPortalAccountInvites,
  listPortalAccountMembers,
} from "@/lib/portalAccounts";
import { normalizePortalPermissions } from "@/lib/portalPermissions";
import {
  PortalAgentActionArgsSchemaByKey,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import { consumeCredits, consumeCreditsOnce } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import { runOwnerAutomationByIdForEvent } from "@/lib/portalAutomationsRunner";
import { generateClientBlogDraft } from "@/lib/clientBlogAutomation";
import { generateClientNewsletterDraft } from "@/lib/clientNewsletterAutomation";
import { uniqueNewsletterSlug } from "@/lib/portalNewsletter";
import { normalizeNewsletterFontKey } from "@/lib/portalNewsletterFonts";
import { slugify } from "@/lib/slugify";
import { getBookingCalendarsConfig, setBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getBookingFormConfig, setBookingFormConfig } from "@/lib/bookingForm";
import { computeAvailableSlots } from "@/lib/bookingSlots";
import { getBlogAppearance, setBlogAppearance } from "@/lib/blogAppearance";
import { ensureStoredBlogSiteSlug, getStoredBlogSiteSlug, setStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import {
  getAppointmentReminderSettingsForCalendar,
  listAppointmentReminderEvents,
  parseAppointmentReminderSettings,
  setAppointmentReminderSettingsForCalendar,
} from "@/lib/appointmentReminders";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { findOrCreatePortalContact, normalizePhoneKey } from "@/lib/portalContacts";
import { listDuplicatePortalContactsByPhoneKey, mergePortalContacts } from "@/lib/portalContactDedup";
import { addContactTagAssignment, createOwnerContactTag, ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { sendPortalInboxMessageNow } from "@/lib/portalInboxSend";
import {
  getReviewRequestsServiceData,
  listReviewRequestEvents,
  parseReviewRequestsSettings,
  sendReviewRequestForBooking,
  sendReviewRequestForContact,
  setReviewRequestsSettings,
} from "@/lib/reviewRequests";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";
import { safeFilename, newPublicToken, newTag, normalizeMimeType, normalizeNameKey } from "@/lib/portalMedia";
import { addPortalDashboardWidget, isDashboardWidgetId, removePortalDashboardWidget, resetPortalDashboard, savePortalDashboardData, type DashboardWidgetId } from "@/lib/portalDashboard";
import { hasPublicColumn } from "@/lib/dbSchema";
import { cancelFollowUpsForBooking, scheduleFollowUpsForBooking } from "@/lib/followUpAutomation";
import { trySendTransactionalEmail, sendTransactionalEmail } from "@/lib/emailSender";
import { buildPortalTemplateVars, normalizePortalContactCustomVarKey } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";
import { signBookingRescheduleToken } from "@/lib/bookingReschedule";
import { getOwnerTwilioSmsConfig, getOwnerTwilioSmsConfigMasked, sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { normalizePhoneStrict } from "@/lib/phone";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet, stripePost } from "@/lib/stripeFetch";
import { generateText } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { ensureVercelProjectDomain } from "@/lib/vercelProjectDomains";
import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey, stripePostWithKey } from "@/lib/stripeFetchWithKey.server";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { normalizeTagIdList } from "@/lib/portalAiOutboundCalls";
import { normalizeToolIdList, normalizeToolKeyList, parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

const MAX_REMOTE_MEDIA_BYTES = 15 * 1024 * 1024; // matches /api/portal/media/import-remote

function sanitizeHumanName(raw: unknown, maxLen: number) {
  return String(raw || "")
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function splitTagsFlexible(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
    : String(raw ?? "")
        .trim()
        .split(/[\n\r,;|]+/g)
        .map((p) => p.trim())
        .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const v = String(p || "").trim().slice(0, 60);
    const key = v.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

async function newUniqueMediaFolderTag(ownerId: string) {
  let tag = newTag();
  for (let i = 0; i < 5; i++) {
    const exists = await (prisma as any).portalMediaFolder.findFirst({ where: { ownerId, tag }, select: { id: true } });
    if (!exists) return tag;
    tag = newTag();
  }
  return tag;
}

function dashboardWidgetsForNiche(nicheRaw: string | null | undefined): DashboardWidgetId[] {
  const niche = String(nicheRaw || "").trim().toLowerCase();

  const base: DashboardWidgetId[] = [
    "hoursSaved",
    "billing",
    "services",
    "creditsRemaining",
    "creditsRunway",
    "successRate",
    "failures",
    "dailyActivity",
    "tasks",
    "inboxMessagesIn",
    "inboxMessagesOut",
    "reviewsCollected",
    "avgReviewRating",
    "bookingsCreated",
    "leadsCaptured",
  ];

  if (!niche) return base;

  const add = (ids: DashboardWidgetId[]) => ids.forEach((id) => base.push(id));

  if (/(lawn|landscap|tree|roof|plumb|hvac|electric|pest|pressure\s*wash|contractor|home\s*service|garage|pool)/.test(niche)) {
    add(["missedCalls", "aiCalls", "leadsCreated", "contactsCreated", "leadScrapeRuns"]);
  }

  if (/(dent|ortho|chiro|med|clinic|spa|salon|barber|wellness|therapy)/.test(niche)) {
    add(["missedCalls", "aiCalls", "newsletterSends", "nurtureEnrollments"]);
  }

  if (/(real\s*estate|realtor|broker|mortgage|loan|insurance)/.test(niche)) {
    add(["leadsCreated", "contactsCreated", "aiOutboundCalls", "leadScrapeRuns"]);
  }

  // De-dupe while preserving order.
  const seen = new Set<string>();
  return base.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function simpleDashboardLayout(widgetIds: DashboardWidgetId[]) {
  // Keep big widgets at the bottom.
  const big = new Set<DashboardWidgetId>(["dailyActivity", "services"]);
  const perf = (id: DashboardWidgetId) => id.startsWith("perf");

  const smallIds = widgetIds.filter((id) => !big.has(id));
  const bigIds = widgetIds.filter((id) => big.has(id));

  const layout: Array<{ i: DashboardWidgetId; x: number; y: number; w: number; h: number; minW?: number; minH?: number }> = [];
  const colW = 3;
  const rowH = 8;

  smallIds.forEach((id, idx) => {
    const x = (idx % 4) * colW;
    const y = Math.floor(idx / 4) * rowH;
    const w = perf(id) ? 6 : 3;
    const h = perf(id) ? 10 : 8;
    layout.push({ i: id, x, y, w, h, minW: w === 3 ? 3 : 3, minH: 4 });
  });

  let y = Math.ceil(smallIds.length / 4) * rowH;
  for (const id of bigIds) {
    layout.push({ i: id, x: 0, y, w: 12, h: id === "dailyActivity" ? 22 : 14, minW: 6, minH: id === "dailyActivity" ? 16 : 10 });
    y += id === "dailyActivity" ? 22 : 14;
  }

  return layout;
}

function normalizeSlug(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const cleaned = s
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  return cleaned;
}

function normalizeHexColor(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s === "transparent") return "transparent";
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  return s;
}

function normalizeFunnelBuilderFormStyle(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as any;
  const out: any = {};

  const pageBg = normalizeHexColor(r.pageBg);
  const cardBg = normalizeHexColor(r.cardBg);
  const buttonBg = normalizeHexColor(r.buttonBg);
  const buttonText = normalizeHexColor(r.buttonText);
  const inputBg = normalizeHexColor(r.inputBg);
  const inputBorder = normalizeHexColor(r.inputBorder);
  const textColor = normalizeHexColor(r.textColor);

  if (pageBg) out.pageBg = pageBg;
  if (cardBg) out.cardBg = cardBg;
  if (buttonBg) out.buttonBg = buttonBg;
  if (buttonText) out.buttonText = buttonText;
  if (inputBg) out.inputBg = inputBg;
  if (inputBorder) out.inputBorder = inputBorder;
  if (textColor) out.textColor = textColor;

  if (typeof r.radiusPx === "number" && Number.isFinite(r.radiusPx)) {
    out.radiusPx = Math.max(0, Math.min(40, Math.round(r.radiusPx)));
  }

  return out;
}

function normalizeFunnelBuilderFormSchema(schema: unknown): any {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { fields: [] };
  const fields = (schema as any).fields;
  const style = normalizeFunnelBuilderFormStyle((schema as any).style);
  if (!Array.isArray(fields)) return { fields: [] };
  const out: any[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const name = typeof (f as any).name === "string" ? (f as any).name.trim() : "";
    const label = typeof (f as any).label === "string" ? (f as any).label.trim() : "";
    const type = (f as any).type;
    const required = (f as any).required === true;
    if (!name || !label) continue;
    if (type !== "text" && type !== "email" && type !== "tel" && type !== "textarea") continue;
    out.push({ name: name.slice(0, 64), label: label.slice(0, 160), type, required });
  }

  const normalized: any = { fields: out.slice(0, 50) };
  if (style && typeof style === "object" && Object.keys(style).length) normalized.style = style;
  return normalized;
}

function withRandomSuffix(base: string, maxLen = 60) {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const suffix = `-${digits}`;
  const headMax = Math.max(1, maxLen - suffix.length);
  const head = base.length > headMax ? base.slice(0, headMax).replace(/-+$/g, "") : base;
  return `${head}${suffix}`;
}

async function uniqueBlogSlug(siteId: string, desired: string) {
  const base = slugify(desired) || "post";
  let attempt = base;
  for (let i = 0; i < 50; i += 1) {
    const exists = await prisma.clientBlogPost.findUnique({ where: { siteId_slug: { siteId, slug: attempt } }, select: { id: true } });
    if (!exists) return attempt;
    attempt = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

type BookingSiteColumnFlags = {
  photoUrl: boolean;
  meetingLocation: boolean;
  meetingDetails: boolean;
  appointmentPurpose: boolean;
  toneDirection: boolean;
  notificationEmails: boolean;
};

async function getBookingSiteColumnFlags(): Promise<BookingSiteColumnFlags> {
  const [photoUrl, meetingLocation, meetingDetails, appointmentPurpose, toneDirection, notificationEmails] = await Promise.all([
    hasPublicColumn("PortalBookingSite", "photoUrl"),
    hasPublicColumn("PortalBookingSite", "meetingLocation"),
    hasPublicColumn("PortalBookingSite", "meetingDetails"),
    hasPublicColumn("PortalBookingSite", "appointmentPurpose"),
    hasPublicColumn("PortalBookingSite", "toneDirection"),
    hasPublicColumn("PortalBookingSite", "notificationEmails"),
  ]);
  return { photoUrl, meetingLocation, meetingDetails, appointmentPurpose, toneDirection, notificationEmails };
}

function bookingSiteSelect(flags: BookingSiteColumnFlags) {
  const select: Record<string, boolean> = {
    id: true,
    ownerId: true,
    slug: true,
    enabled: true,
    title: true,
    description: true,
    durationMinutes: true,
    timeZone: true,
    updatedAt: true,
  };

  if (flags.photoUrl) select.photoUrl = true;
  if (flags.notificationEmails) select.notificationEmails = true;
  if (flags.appointmentPurpose) select.appointmentPurpose = true;
  if (flags.toneDirection) select.toneDirection = true;
  if (flags.meetingLocation) select.meetingLocation = true;
  if (flags.meetingDetails) select.meetingDetails = true;

  return select as any;
}

async function ensureBookingSite(ownerId: string, flags: BookingSiteColumnFlags) {
  const existing = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: bookingSiteSelect(flags) }).catch(() => null);
  if (existing) return existing as any;

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true, timeZone: true } }).catch(() => null),
    prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }).catch(() => null),
  ]);

  const base = slugify(profile?.businessName ?? user?.name ?? user?.email?.split("@")[0] ?? "booking");
  const desired = base.length >= 3 ? base : "booking";

  let slug = desired;
  const collision = await prisma.portalBookingSite.findUnique({ where: { slug }, select: { ownerId: true } }).catch(() => null);
  if (collision?.ownerId && String(collision.ownerId) !== ownerId) slug = `${desired}-${ownerId.slice(0, 6)}`;

  const title = profile?.businessName?.trim() ? `Book with ${profile.businessName.trim()}` : "Book a call";
  const created = await prisma.portalBookingSite.create({
    data: {
      ownerId,
      slug,
      title,
      timeZone: user?.timeZone ?? "America/New_York",
      durationMinutes: 30,
      enabled: false,
    },
    select: bookingSiteSelect(flags),
  });
  return created as any;
}

function normalizeDomain(raw: string | null | undefined) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  const withoutProtocol = v.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  const d = withoutPath.replace(/:\d+$/, "").replace(/\.$/, "");
  return d.length ? d : null;
}

async function ensureUniquePublicSiteSlug(ownerId: string, desiredName: string): Promise<{ canUseSlugColumn: boolean; slug: string | null }> {
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  const base = slugify(desiredName) || "site";
  const desired = base.length >= 3 ? base : "site";

  if (!canUseSlugColumn) return { canUseSlugColumn, slug: desired };

  let slug = desired;
  const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } }).catch(() => null)) as any;
  if (collision?.ownerId && String(collision.ownerId) !== ownerId) slug = `${desired}-${ownerId.slice(0, 6)}`;

  return { canUseSlugColumn, slug };
}

async function runDirectAction(opts: {
  action: PortalAgentActionKey;
  ownerId: string;
  actorUserId: string;
  args: any;
}): Promise<{ status: number; json: any }> {
  const { action, ownerId, actorUserId, args } = opts;

  function readStringArray(json: unknown): string[] {
    if (!Array.isArray(json)) return [];
    const out: string[] = [];
    for (const x of json) {
      if (typeof x === "string" && x.trim()) out.push(x.trim());
    }
    return out;
  }

  function tryParseJsonDraft(s: string): null | { subject?: string; body?: string } {
    const t = String(s || "").trim();
    if (!t.startsWith("{") || !t.endsWith("}")) return null;
    try {
      const obj = JSON.parse(t);
      if (!obj || typeof obj !== "object") return null;
      const subject = typeof (obj as any).subject === "string" ? String((obj as any).subject) : undefined;
      const body = typeof (obj as any).body === "string" ? String((obj as any).body) : undefined;
      return { subject, body };
    } catch {
      return null;
    }
  }

  function parseSubjectBodyFallback(s: string): { subject?: string; body: string } {
    const raw = String(s || "").replace(/\r\n/g, "\n").trim();
    if (!raw) return { body: "" };

    const lines = raw.split("\n");
    const first = String(lines[0] || "").trim();
    if (/^subject\s*:/i.test(first)) {
      const subject = first.replace(/^subject\s*:/i, "").trim();
      const body = lines.slice(1).join("\n").trim();
      return { subject, body };
    }

    return { body: raw };
  }

  async function requireOwnerOrAdmin() {
    const memberId = String(actorUserId || "").trim() || ownerId;
    const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
    return myRole === "OWNER" || myRole === "ADMIN";
  }

  type FunnelBuilderSettings = {
    notifyEmails: string[];
    webhookUrl: string | null;
    webhookSecret: string;
  };

  function normalizeEmailList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const v of raw) {
      if (typeof v !== "string") continue;
      const e = v.trim().toLowerCase();
      if (!e) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
      out.push(e);
    }
    return Array.from(new Set(out)).slice(0, 10);
  }

  function normalizeWebhookUrl(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s) return null;
    try {
      const u = new URL(s);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  function parseFunnelBuilderSettings(dataJson: unknown): FunnelBuilderSettings {
    const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? (dataJson as any) : {};
    const notifyEmails = normalizeEmailList(rec.notifyEmails);
    const webhookUrl = normalizeWebhookUrl(rec.webhookUrl);
    const webhookSecret = typeof rec.webhookSecret === "string" && rec.webhookSecret.trim().length >= 16
      ? rec.webhookSecret.trim()
      : crypto.randomBytes(24).toString("hex");
    return { notifyEmails, webhookUrl, webhookSecret };
  }

  type DomainRootMode = "DISABLED" | "DIRECTORY" | "REDIRECT";

  function safeRootMode(raw: unknown): DomainRootMode {
    const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (s === "DISABLED" || s === "DIRECTORY" || s === "REDIRECT") return s;
    return "DIRECTORY";
  }

  function safeRedirectSlug(raw: unknown): string | null {
    const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!s) return null;
    if (s.length > 80) return null;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return null;
    return s;
  }

  function readDomainSettings(settingsJson: unknown, domain: string): { rootMode: DomainRootMode; rootFunnelSlug: string | null } {
    if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
      return { rootMode: "DIRECTORY", rootFunnelSlug: null };
    }
    const domains = (settingsJson as any).customDomains;
    if (!domains || typeof domains !== "object" || Array.isArray(domains)) {
      return { rootMode: "DIRECTORY", rootFunnelSlug: null };
    }
    const row = (domains as any)[domain];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { rootMode: "DIRECTORY", rootFunnelSlug: null };
    }
    const rootMode = safeRootMode((row as any).rootMode);
    const rootFunnelSlug = safeRedirectSlug((row as any).rootFunnelSlug);
    return { rootMode, rootFunnelSlug };
  }

  function writeDomainSettings(settingsJson: unknown, domain: string, next: { rootMode: DomainRootMode; rootFunnelSlug: string | null }) {
    const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
    const customDomains =
      base.customDomains && typeof base.customDomains === "object" && !Array.isArray(base.customDomains)
        ? { ...(base.customDomains as any) }
        : {};
    customDomains[domain] = { rootMode: next.rootMode, rootFunnelSlug: next.rootFunnelSlug };
    base.customDomains = customDomains;
    return base;
  }

  function normalizeCustomDomain(raw: unknown) {
    let s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!s) return null;

    s = s.replace(/^https?:\/\//, "");
    s = s.split("/")[0] || "";
    s = s.split("?")[0] || "";
    s = s.split("#")[0] || "";

    if (!s) return null;
    if (s.length > 253) return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
    if (s.includes("..")) return null;
    if (s.startsWith("-") || s.endsWith("-")) return null;

    return s;
  }

  function readFunnelDomains(settingsJson: unknown): Record<string, string> {
    if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return {};
    const raw = (settingsJson as any).funnelDomains;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as any)) {
      if (typeof k !== "string" || !k.trim()) continue;
      const domain = normalizeCustomDomain(v);
      if (!domain) continue;
      out[k] = domain;
    }
    return out;
  }

  function writeFunnelDomain(settingsJson: unknown, funnelId: string, domain: string | null) {
    const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
    const funnelDomains =
      base.funnelDomains && typeof base.funnelDomains === "object" && !Array.isArray(base.funnelDomains)
        ? { ...(base.funnelDomains as any) }
        : {};

    if (domain) funnelDomains[funnelId] = domain;
    else delete funnelDomains[funnelId];

    base.funnelDomains = funnelDomains;
    return base;
  }

  type FunnelSeo = {
    title?: string;
    description?: string;
    imageUrl?: string;
    noIndex?: boolean;
  };

  function readFunnelSeo(settingsJson: unknown, funnelId: string): FunnelSeo | null {
    if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return null;
    const raw = (settingsJson as any).funnelSeo;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = (raw as any)[funnelId];
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;

    const title = typeof (row as any).title === "string" ? (row as any).title.trim().slice(0, 120) : "";
    const description = typeof (row as any).description === "string" ? (row as any).description.trim().slice(0, 300) : "";
    const imageUrl = typeof (row as any).imageUrl === "string" ? (row as any).imageUrl.trim().slice(0, 500) : "";
    const noIndex = (row as any).noIndex === true;

    const out: FunnelSeo = {};
    if (title) out.title = title;
    if (description) out.description = description;
    if (imageUrl) out.imageUrl = imageUrl;
    if (noIndex) out.noIndex = true;

    return Object.keys(out).length ? out : null;
  }

  function safeSeo(raw: unknown): FunnelSeo | null {
    if (raw === null) return null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const title = typeof (raw as any).title === "string" ? (raw as any).title.trim().slice(0, 120) : "";
    const description = typeof (raw as any).description === "string" ? (raw as any).description.trim().slice(0, 300) : "";
    const imageUrl = typeof (raw as any).imageUrl === "string" ? (raw as any).imageUrl.trim().slice(0, 500) : "";
    const noIndex = (raw as any).noIndex === true;

    const out: FunnelSeo = {};
    if (title) out.title = title;
    if (description) out.description = description;
    if (imageUrl) out.imageUrl = imageUrl;
    if (noIndex) out.noIndex = true;
    return out;
  }

  function writeFunnelSeo(settingsJson: unknown, funnelId: string, seo: FunnelSeo | null) {
    const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
    const funnelSeo =
      base.funnelSeo && typeof base.funnelSeo === "object" && !Array.isArray(base.funnelSeo)
        ? { ...(base.funnelSeo as any) }
        : {};

    if (seo === null) delete funnelSeo[funnelId];
    else funnelSeo[funnelId] = seo;

    base.funnelSeo = funnelSeo;
    return base;
  }

  function removeFunnelFromDomainRedirects(settingsJson: unknown, funnelSlug: string) {
    if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return settingsJson;
    const base: any = { ...(settingsJson as any) };
    const customDomains =
      base.customDomains && typeof base.customDomains === "object" && !Array.isArray(base.customDomains)
        ? { ...(base.customDomains as any) }
        : null;
    if (!customDomains) return base;

    let changed = false;
    for (const [domain, row] of Object.entries(customDomains)) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const rootMode = typeof (row as any).rootMode === "string" ? String((row as any).rootMode).trim().toUpperCase() : "";
      const rootFunnelSlug = typeof (row as any).rootFunnelSlug === "string" ? String((row as any).rootFunnelSlug).trim().toLowerCase() : "";
      if (rootMode === "REDIRECT" && rootFunnelSlug && rootFunnelSlug === funnelSlug) {
        customDomains[domain] = { ...(row as any), rootMode: "DIRECTORY", rootFunnelSlug: null };
        changed = true;
      }
    }

    if (!changed) return base;
    base.customDomains = customDomains;
    return base;
  }

  type FunnelPageSeo = {
    faviconUrl?: string;
  };

  function readFunnelPageSeo(settingsJson: unknown, pageId: string): FunnelPageSeo | null {
    if (!pageId) return null;
    if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return null;
    const raw = (settingsJson as any).funnelPageSeo;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = (raw as any)[pageId];
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;

    const faviconUrl = typeof (row as any).faviconUrl === "string" ? String((row as any).faviconUrl).trim().slice(0, 500) : "";

    const out: FunnelPageSeo = {};
    if (faviconUrl) out.faviconUrl = faviconUrl;
    return Object.keys(out).length ? out : null;
  }

  function safePageSeo(raw: unknown): FunnelPageSeo | null {
    if (raw === null) return null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const faviconUrl = typeof (raw as any).faviconUrl === "string" ? String((raw as any).faviconUrl).trim().slice(0, 500) : "";
    const out: FunnelPageSeo = {};
    if (faviconUrl) out.faviconUrl = faviconUrl;
    return out;
  }

  function writeFunnelPageSeo(settingsJson: unknown, pageId: string, seo: FunnelPageSeo | null) {
    const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
    const funnelPageSeo =
      base.funnelPageSeo && typeof base.funnelPageSeo === "object" && !Array.isArray(base.funnelPageSeo)
        ? { ...(base.funnelPageSeo as any) }
        : {};

    if (seo === null) delete funnelPageSeo[pageId];
    else funnelPageSeo[pageId] = seo;

    base.funnelPageSeo = funnelPageSeo;
    return base;
  }

  const GLOBAL_HEADER_KEY = "__global_header__";

  function getGlobalHeaderBlockFromPages(pages: Array<{ blocksJson: unknown }>): CreditFunnelBlock | null {
    for (const p of pages) {
      const blocks = coerceBlocksJson(p.blocksJson);
      for (const b of blocks) {
        if (b.type !== "headerNav") continue;
        const key = typeof (b.props as any)?.globalKey === "string" ? String((b.props as any).globalKey) : "";
        if (key !== GLOBAL_HEADER_KEY) continue;
        return {
          ...b,
          props: {
            ...(b.props as any),
            isGlobal: true,
            globalKey: GLOBAL_HEADER_KEY,
          },
        } as CreditFunnelBlock;
      }
    }
    return null;
  }

  function isHeaderNavBlock(b: CreditFunnelBlock | null | undefined): b is Extract<CreditFunnelBlock, { type: "headerNav" }> {
    return Boolean(b && typeof b === "object" && (b as any).type === "headerNav");
  }

  function removeGlobalHeaders(blocks: CreditFunnelBlock[]): CreditFunnelBlock[] {
    let changed = false;
    const out = blocks.filter((b) => {
      if (b.type !== "headerNav") return true;
      const p: any = b.props as any;
      const isGlobal = p?.isGlobal === true;
      const globalKey = typeof p?.globalKey === "string" ? String(p.globalKey).trim() : "";
      if (isGlobal || globalKey === GLOBAL_HEADER_KEY) {
        changed = true;
        return false;
      }
      return true;
    });
    return changed ? out : blocks;
  }

  function coerceHeaderNavFromUnknown(raw: unknown, forceGlobal: boolean): Extract<CreditFunnelBlock, { type: "headerNav" }> | null {
    const arr = coerceBlocksJson([raw]);
    const first = arr[0] || null;
    if (!isHeaderNavBlock(first)) return null;

    const next: any = {
      ...first,
      props: {
        ...(first.props as any),
        globalKey: GLOBAL_HEADER_KEY,
        ...(forceGlobal ? { isGlobal: true } : { isGlobal: false, globalKey: undefined }),
      },
    };

    const coerced = coerceBlocksJson([next])[0] as any;
    return isHeaderNavBlock(coerced) ? (coerced as any) : null;
  }

  function parseSubmissionLimit(raw: unknown): number {
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return 50;
    return Math.max(1, Math.min(100, Math.floor(n)));
  }

  function parseSubmissionCursor(raw: unknown): { createdAt: Date; id: string } | null {
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s) return null;
    const [createdAtRaw, idRaw] = s.split("|");
    const id = String(idRaw || "").trim();
    const createdAt = new Date(String(createdAtRaw || ""));
    if (!id) return null;
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  }

  switch (action) {
    case "tasks.create": {
      await ensurePortalTasksSchema().catch(() => null);

      const title = String(args.title || "").trim().slice(0, 160);
      const description = String(args.description || "").trim().slice(0, 5000);
      const assignedToUserId = typeof args.assignedToUserId === "string" && args.assignedToUserId.trim() ? args.assignedToUserId.trim() : null;

      const dueAtIso = typeof args.dueAtIso === "string" ? args.dueAtIso.trim() : "";
      const dueAt = dueAtIso ? new Date(dueAtIso) : null;
      if (dueAt && !Number.isFinite(dueAt.getTime())) {
        return { status: 400, json: { ok: false, error: "Invalid due date" } };
      }

      const id = crypto.randomUUID().replace(/-/g, "");
      const now = new Date();

      const sql = `
        INSERT INTO "PortalTask" ("id","ownerId","createdByUserId","title","description","status","assignedToUserId","dueAt","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,DEFAULT,$8)
      `;
      await prisma.$executeRawUnsafe(sql, id, ownerId, actorUserId, title, description || null, assignedToUserId, dueAt, now);
      return { status: 200, json: { ok: true, taskId: id } };
    }

    case "tasks.create_for_all": {
      await ensurePortalTasksSchema().catch(() => null);

      const title = String(args.title || "").trim().slice(0, 160);
      const description = String(args.description || "").trim().slice(0, 5000);

      const dueAtIso = typeof args.dueAtIso === "string" ? args.dueAtIso.trim() : "";
      const dueAt = dueAtIso ? new Date(dueAtIso) : null;
      if (dueAt && !Number.isFinite(dueAt.getTime())) {
        return { status: 400, json: { ok: false, error: "Invalid due date" } };
      }

      const members = await prisma.portalAccountMember.findMany({
        where: { ownerId },
        select: { userId: true },
        take: 200,
      });

      const uniqueUserIds = Array.from(new Set(members.map((m) => String(m.userId)))).filter(Boolean).slice(0, 200);
      if (!uniqueUserIds.length) return { status: 409, json: { ok: false, error: "No team members found" } };

      const now = new Date();
      const sql = `
        INSERT INTO "PortalTask" ("id","ownerId","createdByUserId","title","description","status","assignedToUserId","dueAt","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,DEFAULT,$8)
      `;

      const taskIds: string[] = [];
      for (const userId of uniqueUserIds) {
        const id = crypto.randomUUID().replace(/-/g, "");
        await prisma.$executeRawUnsafe(sql, id, ownerId, actorUserId, title, description || null, userId, dueAt, now);
        taskIds.push(id);
      }

      return { status: 200, json: { ok: true, count: taskIds.length, taskIds } };
    }

    case "funnel.create": {
      const needCredits = PORTAL_CREDIT_COSTS.funnelCreate;
      const charged = await consumeCredits(ownerId, needCredits);
      if (!charged.ok) {
        return { status: 402, json: { ok: false, error: "Insufficient credits", credits: charged.state.balance } };
      }

      const slug = normalizeSlug(args.slug);
      const nameRaw = typeof args.name === "string" ? args.name.trim() : "";
      const name = nameRaw || (slug ? slug.replace(/-/g, " ") : "");

      if (!slug) return { status: 400, json: { ok: false, error: "Invalid slug" } };
      if (!name || name.length > 120) return { status: 400, json: { ok: false, error: "Invalid name" } };

      let funnel: any = null;
      let candidate = slug;
      for (let i = 0; i < 8; i += 1) {
        funnel = await prisma.creditFunnel
          .create({
            data: { ownerId, slug: candidate, name },
            select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
          })
          .catch((e) => {
            const msg = String((e as any)?.message || "");
            if (msg.includes("CreditFunnel_slug_key") || msg.toLowerCase().includes("unique")) return null;
            throw e;
          });
        if (funnel) break;
        candidate = withRandomSuffix(slug);
      }

      if (!funnel) return { status: 500, json: { ok: false, error: "Unable to create funnel" } };
      return { status: 200, json: { ok: true, funnel } };
    }

    case "funnel_builder.settings.get": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const row = await prisma.creditFunnelBuilderSettings
        .findUnique({ where: { ownerId }, select: { dataJson: true } })
        .catch(() => null);
      const settings = parseFunnelBuilderSettings(row?.dataJson);

      if (!row || (row.dataJson as any)?.webhookSecret !== settings.webhookSecret) {
        await prisma.creditFunnelBuilderSettings
          .upsert({ where: { ownerId }, update: { dataJson: settings as any }, create: { ownerId, dataJson: settings as any } })
          .catch(() => null);
      }

      return { status: 200, json: { ok: true, settings } };
    }

    case "funnel_builder.settings.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const row = await prisma.creditFunnelBuilderSettings
        .findUnique({ where: { ownerId }, select: { dataJson: true } })
        .catch(() => null);
      const current = parseFunnelBuilderSettings(row?.dataJson);

      const next: FunnelBuilderSettings = {
        notifyEmails: normalizeEmailList(args?.notifyEmails ?? current.notifyEmails),
        webhookUrl: normalizeWebhookUrl(args?.webhookUrl) ?? null,
        webhookSecret: args?.regenerateSecret === true ? crypto.randomBytes(24).toString("hex") : current.webhookSecret,
      };

      await prisma.creditFunnelBuilderSettings.upsert({
        where: { ownerId },
        update: { dataJson: next as any },
        create: { ownerId, dataJson: next as any },
      });

      return { status: 200, json: { ok: true, settings: next } };
    }

    case "funnel_builder.domains.list": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const settings = await prisma.creditFunnelBuilderSettings
        .findUnique({ where: { ownerId }, select: { dataJson: true } })
        .catch(() => null);
      const settingsJson = settings?.dataJson ?? null;

      const domains = await prisma.creditCustomDomain.findMany({
        where: { ownerId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
      });

      const domainsWithSettings = domains.map((d) => {
        const s = readDomainSettings(settingsJson, d.domain);
        return { ...d, rootMode: s.rootMode, rootFunnelSlug: s.rootFunnelSlug };
      });

      return { status: 200, json: { ok: true, domains: domainsWithSettings } };
    }

    case "funnel_builder.domains.create": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const domain = normalizeCustomDomain(args?.domain);
      if (!domain) {
        return {
          status: 400,
          json: { ok: false, error: "Please enter a valid domain like example.com (no https://, no paths)." },
        };
      }

      const row = await prisma.creditCustomDomain
        .upsert({
          where: { ownerId_domain: { ownerId, domain } },
          update: { domain },
          create: { ownerId, domain },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        })
        .catch((e) => {
          const msg = String((e as any)?.message || "");
          if (msg.includes("CreditCustomDomain_ownerId_domain_key") || msg.toLowerCase().includes("unique")) return null;
          throw e;
        });

      if (!row) return { status: 409, json: { ok: false, error: "Domain already exists" } };

      let provisioning: Awaited<ReturnType<typeof ensureVercelProjectDomain>> | null = null;
      try {
        provisioning = await ensureVercelProjectDomain(domain);
      } catch {
        provisioning = null;
      }

      return { status: 200, json: { ok: true, domain: row, provisioning } };
    }

    case "funnel_builder.domains.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const domain = normalizeCustomDomain(args?.domain);
      if (!domain) {
        return {
          status: 400,
          json: { ok: false, error: "Please enter a valid domain like example.com (no https://, no paths)." },
        };
      }

      const exists = await prisma.creditCustomDomain.findUnique({
        where: { ownerId_domain: { ownerId, domain } },
        select: { id: true },
      });
      if (!exists) return { status: 404, json: { ok: false, error: "Domain not found" } };

      const rootMode = safeRootMode(args?.rootMode);
      const rootFunnelSlug = safeRedirectSlug(args?.rootFunnelSlug);
      if (rootMode === "REDIRECT" && !rootFunnelSlug) {
        return { status: 400, json: { ok: false, error: "Pick a funnel to redirect to" } };
      }

      const existingSettings = await prisma.creditFunnelBuilderSettings
        .findUnique({ where: { ownerId }, select: { dataJson: true } })
        .catch(() => null);

      const nextJson = writeDomainSettings(existingSettings?.dataJson ?? null, domain, {
        rootMode,
        rootFunnelSlug: rootMode === "REDIRECT" ? rootFunnelSlug : null,
      });

      await prisma.creditFunnelBuilderSettings.upsert({
        where: { ownerId },
        update: { dataJson: nextJson as any },
        create: { ownerId, dataJson: nextJson as any },
        select: { ownerId: true },
      });

      return {
        status: 200,
        json: {
          ok: true,
          domain,
          rootMode,
          rootFunnelSlug: rootMode === "REDIRECT" ? rootFunnelSlug : null,
        },
      };
    }

    case "funnel_builder.forms.list": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const forms = await prisma.creditForm.findMany({
        where: { ownerId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
      });

      return { status: 200, json: { ok: true, forms } };
    }

    case "funnel_builder.forms.create": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const slug = normalizeSlug(args?.slug);
      const nameRaw = typeof args?.name === "string" ? args.name.trim() : "";
      const name = nameRaw || (slug ? slug.replace(/-/g, " ") : "");

      if (!slug) return { status: 400, json: { ok: false, error: "Invalid slug" } };
      if (!name || name.length > 120) return { status: 400, json: { ok: false, error: "Invalid name" } };

      let form: any = null;
      let candidate = slug;
      for (let i = 0; i < 8; i += 1) {
        form = await prisma.creditForm
          .create({
            data: { ownerId, slug: candidate, name },
            select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
          })
          .catch((e) => {
            const msg = String((e as any)?.message || "");
            if (msg.includes("CreditForm_slug_key") || msg.toLowerCase().includes("unique")) return null;
            throw e;
          });
        if (form) break;
        candidate = withRandomSuffix(slug);
      }

      if (!form) return { status: 500, json: { ok: false, error: "Unable to create form" } };
      return { status: 200, json: { ok: true, form } };
    }

    case "funnel_builder.forms.get": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const id = String(args?.formId || "").trim();
      if (!id) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const form = await prisma.creditForm.findFirst({
        where: { id, ownerId },
        select: { id: true, slug: true, name: true, status: true, schemaJson: true, createdAt: true, updatedAt: true },
      });
      if (!form) return { status: 404, json: { ok: false, error: "Not found" } };
      return { status: 200, json: { ok: true, form } };
    }

    case "funnel_builder.forms.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const id = String(args?.formId || "").trim();
      if (!id) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const existing = await prisma.creditForm.findFirst({ where: { id, ownerId }, select: { id: true } });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      const data: any = {};

      if (typeof args?.name === "string") {
        const name = args.name.trim();
        if (!name || name.length > 120) return { status: 400, json: { ok: false, error: "Invalid name" } };
        data.name = name;
      }

      if (typeof args?.status === "string") {
        if (args.status !== "DRAFT" && args.status !== "ACTIVE" && args.status !== "ARCHIVED") {
          return { status: 400, json: { ok: false, error: "Invalid status" } };
        }
        data.status = args.status;
      }

      if (typeof args?.slug === "string") {
        const slug = normalizeSlug(args.slug);
        if (!slug) return { status: 400, json: { ok: false, error: "Invalid slug" } };
        data.slug = slug;
      }

      if (args?.schemaJson !== undefined) {
        data.schemaJson = normalizeFunnelBuilderFormSchema(args.schemaJson);
      }

      const desiredSlug = typeof (data as any)?.slug === "string" ? String((data as any).slug) : null;
      let form: any = null;
      let candidate = desiredSlug;
      for (let i = 0; i < 8; i += 1) {
        if (candidate) (data as any).slug = candidate;

        form = await prisma.creditForm
          .update({
            where: { id },
            data,
            select: { id: true, slug: true, name: true, status: true, schemaJson: true, createdAt: true, updatedAt: true },
          })
          .catch((e) => {
            const msg = String((e as any)?.message || "");
            if (msg.toLowerCase().includes("unique") || msg.includes("CreditForm_slug_key")) return null;
            throw e;
          });

        if (form) break;
        if (!desiredSlug) break;
        candidate = withRandomSuffix(desiredSlug);
      }

      if (!form) return { status: 500, json: { ok: false, error: "Unable to update form" } };
      return { status: 200, json: { ok: true, form } };
    }

    case "funnel_builder.forms.delete": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const id = String(args?.formId || "").trim();
      if (!id) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const existing = await prisma.creditForm.findFirst({ where: { id, ownerId }, select: { id: true } });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      await prisma.creditForm.delete({ where: { id: existing.id }, select: { id: true } });
      return { status: 200, json: { ok: true } };
    }

    case "funnel_builder.forms.submissions.list": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const id = String(args?.formId || "").trim();
      if (!id) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const form = await prisma.creditForm.findFirst({ where: { id, ownerId }, select: { id: true } });
      if (!form) return { status: 404, json: { ok: false, error: "Not found" } };

      const limit = parseSubmissionLimit(args?.limit);
      const cursor = parseSubmissionCursor(args?.cursor);

      const submissions = await prisma.creditFormSubmission.findMany({
        where: {
          formId: form.id,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: { id: true, createdAt: true, dataJson: true, ip: true, userAgent: true },
      });

      const hasMore = submissions.length > limit;
      const page = hasMore ? submissions.slice(0, limit) : submissions;
      const nextCursor = hasMore ? `${page[page.length - 1]!.createdAt.toISOString()}|${page[page.length - 1]!.id}` : null;

      return {
        status: 200,
        json: {
          ok: true,
          submissions: page.map((s) => ({
            id: s.id,
            createdAt: s.createdAt.toISOString(),
            dataJson: s.dataJson,
            ip: s.ip,
            userAgent: s.userAgent,
          })),
          nextCursor,
        },
      };
    }

    case "funnel_builder.form_field_keys.get": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      function parseFormFields(schemaJson: unknown): Array<{ key: string; label: string }> {
        if (!schemaJson || typeof schemaJson !== "object") return [];
        const rawFields = (schemaJson as any).fields;
        if (!Array.isArray(rawFields)) return [];

        const out: Array<{ key: string; label: string }> = [];
        for (const f of rawFields) {
          if (!f || typeof f !== "object") continue;
          const key = typeof (f as any).name === "string" ? String((f as any).name).trim() : "";
          const label = typeof (f as any).label === "string" ? String((f as any).label).trim() : "";
          if (!key || !label) continue;
          out.push({ key, label });
        }
        return out;
      }

      const forms = await prisma.creditForm.findMany({
        where: { ownerId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, slug: true, name: true, schemaJson: true },
        take: 200,
      });

      const seen = new Set<string>();
      const fields: Array<{ key: string; label: string; formId: string; formSlug: string; formName: string }> = [];
      for (const form of forms) {
        const formFields = parseFormFields(form.schemaJson);
        for (const f of formFields) {
          const key = f.key;
          if (seen.has(key)) continue;
          seen.add(key);
          fields.push({ key, label: f.label, formId: form.id, formSlug: form.slug, formName: form.name });
        }
      }

      fields.sort((a, b) => {
        const al = (a.label || a.key).toLowerCase();
        const bl = (b.label || b.key).toLowerCase();
        if (al < bl) return -1;
        if (al > bl) return 1;
        return a.key.localeCompare(b.key);
      });

      return { status: 200, json: { ok: true, fields } };
    }

    case "funnel_builder.funnels.list": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const settings = await prisma.creditFunnelBuilderSettings
        .findUnique({ where: { ownerId }, select: { dataJson: true } })
        .catch(() => null);
      const funnelDomains = readFunnelDomains(settings?.dataJson ?? null);

      const funnels = await prisma.creditFunnel.findMany({
        where: { ownerId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
      });

      const funnelsWithDomains = funnels.map((f) => ({ ...f, assignedDomain: funnelDomains[f.id] ?? null }));
      return { status: 200, json: { ok: true, funnels: funnelsWithDomains } };
    }

    case "funnel_builder.funnels.get": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const id = String(args?.funnelId || "").trim();
      if (!id) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const funnel = await prisma.creditFunnel.findFirst({
        where: { id, ownerId },
        select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
      });
      if (!funnel) return { status: 404, json: { ok: false, error: "Not found" } };

      const settings = await prisma.creditFunnelBuilderSettings
        .findUnique({ where: { ownerId }, select: { dataJson: true } })
        .catch(() => null);
      const funnelDomains = readFunnelDomains(settings?.dataJson ?? null);
      const seo = readFunnelSeo(settings?.dataJson ?? null, funnel.id);

      return { status: 200, json: { ok: true, funnel: { ...funnel, assignedDomain: funnelDomains[funnel.id] ?? null, seo } } };
    }

    case "funnel_builder.funnels.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const id = String(args?.funnelId || "").trim();
      if (!id) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const existing = await prisma.creditFunnel.findFirst({ where: { id, ownerId }, select: { id: true } });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      const data: any = {};

      const wantsDomainUpdate = typeof args?.domain !== "undefined";
      const requestedDomainRaw = wantsDomainUpdate ? args.domain : undefined;
      const requestedDomain =
        requestedDomainRaw === null ? null : typeof requestedDomainRaw === "string" ? normalizeCustomDomain(requestedDomainRaw) : null;
      if (wantsDomainUpdate && requestedDomainRaw !== null && !requestedDomain) {
        return { status: 400, json: { ok: false, error: "Invalid domain" } };
      }

      const wantsSeoUpdate = typeof args?.seo !== "undefined";
      const requestedSeoRaw = wantsSeoUpdate ? args.seo : undefined;
      const requestedSeo = wantsSeoUpdate ? (requestedSeoRaw === null ? null : safeSeo(requestedSeoRaw)) : undefined;
      if (wantsSeoUpdate && requestedSeoRaw !== null && requestedSeo == null) {
        return { status: 400, json: { ok: false, error: "Invalid seo" } };
      }

      if (wantsDomainUpdate && requestedDomain) {
        const exists = await prisma.creditCustomDomain.findUnique({
          where: { ownerId_domain: { ownerId, domain: requestedDomain } },
          select: { id: true },
        });
        if (!exists) return { status: 404, json: { ok: false, error: "Domain not found" } };
      }

      if (typeof args?.name === "string") {
        const name = args.name.trim();
        if (!name || name.length > 120) return { status: 400, json: { ok: false, error: "Invalid name" } };
        data.name = name;
      }

      if (typeof args?.status === "string") {
        if (args.status !== "DRAFT" && args.status !== "ACTIVE" && args.status !== "ARCHIVED") {
          return { status: 400, json: { ok: false, error: "Invalid status" } };
        }
        data.status = args.status;
      }

      if (typeof args?.slug === "string") {
        const slug = normalizeSlug(args.slug);
        if (!slug) return { status: 400, json: { ok: false, error: "Invalid slug" } };
        data.slug = slug;
      }

      const desiredSlug = typeof (data as any)?.slug === "string" ? String((data as any).slug) : null;
      let funnel: any = null;
      let candidate = desiredSlug;
      for (let i = 0; i < 8; i += 1) {
        if (candidate) (data as any).slug = candidate;

        funnel = await prisma.creditFunnel
          .update({
            where: { id },
            data,
            select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
          })
          .catch((e) => {
            const msg = String((e as any)?.message || "");
            if (msg.toLowerCase().includes("unique") || msg.includes("CreditFunnel_slug_key")) return null;
            throw e;
          });

        if (funnel) break;
        if (!desiredSlug) break;
        candidate = withRandomSuffix(desiredSlug);
      }

      if (!funnel) return { status: 500, json: { ok: false, error: "Unable to update funnel" } };

      let assignedDomain: string | null = null;
      let seo: FunnelSeo | null = null;

      if (wantsDomainUpdate || wantsSeoUpdate) {
        const existingSettings = await prisma.creditFunnelBuilderSettings
          .findUnique({ where: { ownerId }, select: { dataJson: true } })
          .catch(() => null);

        let nextJson: any = existingSettings?.dataJson ?? null;
        if (wantsDomainUpdate) nextJson = writeFunnelDomain(nextJson, funnel.id, requestedDomain);
        if (wantsSeoUpdate) nextJson = writeFunnelSeo(nextJson, funnel.id, (requestedSeo as any) ?? null);

        await prisma.creditFunnelBuilderSettings.upsert({
          where: { ownerId },
          update: { dataJson: nextJson as any },
          create: { ownerId, dataJson: nextJson as any },
          select: { ownerId: true },
        });

        const funnelDomains = readFunnelDomains(nextJson);
        assignedDomain = funnelDomains[funnel.id] ?? null;
        seo = readFunnelSeo(nextJson, funnel.id);
      } else {
        const settings = await prisma.creditFunnelBuilderSettings
          .findUnique({ where: { ownerId }, select: { dataJson: true } })
          .catch(() => null);
        const settingsJson = settings?.dataJson ?? null;
        const funnelDomains = readFunnelDomains(settingsJson);
        assignedDomain = funnelDomains[funnel.id] ?? null;
        seo = readFunnelSeo(settingsJson, funnel.id);
      }

      return { status: 200, json: { ok: true, funnel: { ...funnel, assignedDomain, seo } } };
    }

    case "funnel_builder.funnels.delete": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const id = String(args?.funnelId || "").trim();
      if (!id) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const existing = await prisma.creditFunnel.findFirst({ where: { id, ownerId }, select: { id: true, slug: true } });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      try {
        const settings = await prisma.creditFunnelBuilderSettings
          .findUnique({ where: { ownerId }, select: { dataJson: true } })
          .catch(() => null);
        const settingsJson = settings?.dataJson ?? null;
        let nextJson: any = settingsJson;
        nextJson = writeFunnelDomain(nextJson, existing.id, null);
        nextJson = writeFunnelSeo(nextJson, existing.id, null);
        nextJson = removeFunnelFromDomainRedirects(nextJson, existing.slug);

        if (settingsJson != null) {
          await prisma.creditFunnelBuilderSettings.update({ where: { ownerId }, data: { dataJson: nextJson as any }, select: { ownerId: true } });
        }
      } catch {
        // ignore
      }

      await prisma.creditFunnel.delete({ where: { id: existing.id }, select: { id: true } });
      return { status: 200, json: { ok: true } };
    }

    case "funnel_builder.pages.list": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const funnelId = String(args?.funnelId || "").trim();
      if (!funnelId) return { status: 400, json: { ok: false, error: "Invalid funnelId" } };

      const funnel = await prisma.creditFunnel.findFirst({ where: { id: funnelId, ownerId }, select: { id: true } });
      if (!funnel) return { status: 404, json: { ok: false, error: "Not found" } };

      const pages = await prisma.creditFunnelPage.findMany({
        where: { funnelId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          sortOrder: true,
          contentMarkdown: true,
          editorMode: true,
          blocksJson: true,
          customHtml: true,
          customChatJson: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const settings = await prisma.creditFunnelBuilderSettings
        .findUnique({ where: { ownerId }, select: { dataJson: true } })
        .catch(() => null);

      const pagesWithSeo = pages.map((p) => ({ ...p, seo: readFunnelPageSeo(settings?.dataJson ?? null, p.id) }));
      return { status: 200, json: { ok: true, pages: pagesWithSeo } };
    }

    case "funnel_builder.pages.create": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const funnelId = String(args?.funnelId || "").trim();
      if (!funnelId) return { status: 400, json: { ok: false, error: "Invalid funnelId" } };

      const funnel = await prisma.creditFunnel.findFirst({ where: { id: funnelId, ownerId }, select: { id: true } });
      if (!funnel) return { status: 404, json: { ok: false, error: "Not found" } };

      const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.funnelPageCreate);
      if (!charged.ok) {
        return { status: 402, json: { ok: false, error: "Insufficient credits", credits: charged.state.balance } };
      }

      const pagesForHeader = await prisma.creditFunnelPage.findMany({ where: { funnelId }, select: { blocksJson: true } });
      const globalHeaderBlock = getGlobalHeaderBlockFromPages(pagesForHeader);

      const slugRaw = typeof args?.slug === "string" ? args.slug.trim().toLowerCase() : "";
      const title = typeof args?.title === "string" ? args.title.trim() : "";
      const contentMarkdown = typeof args?.contentMarkdown === "string" ? args.contentMarkdown : "";
      const sortOrder = Number.isFinite(Number(args?.sortOrder)) ? Number(args.sortOrder) : 0;

      const normalizedSlug = slugRaw
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64);
      if (!normalizedSlug) return { status: 400, json: { ok: false, error: "Slug is required" } };

      const page = await prisma.creditFunnelPage.create({
        data: {
          funnelId,
          slug: normalizedSlug,
          title: title || normalizedSlug,
          contentMarkdown,
          sortOrder,
          ...(globalHeaderBlock ? { blocksJson: [globalHeaderBlock] as any } : {}),
        },
        select: {
          id: true,
          slug: true,
          title: true,
          sortOrder: true,
          contentMarkdown: true,
          editorMode: true,
          blocksJson: true,
          customHtml: true,
          customChatJson: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return { status: 200, json: { ok: true, page, creditsRemaining: charged.state.balance } };
    }

    case "funnel_builder.pages.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const funnelId = String(args?.funnelId || "").trim();
      const pageId = String(args?.pageId || "").trim();
      if (!funnelId || !pageId) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const page = await prisma.creditFunnelPage.findFirst({
        where: { id: pageId, funnelId, funnel: { ownerId } },
        select: { id: true },
      });
      if (!page) return { status: 404, json: { ok: false, error: "Not found" } };

      const wantsSeoUpdate = typeof args?.seo !== "undefined";
      const requestedSeoRaw = wantsSeoUpdate ? args.seo : undefined;
      const requestedSeo = wantsSeoUpdate ? (requestedSeoRaw === null ? null : safePageSeo(requestedSeoRaw)) : undefined;
      if (wantsSeoUpdate && requestedSeoRaw !== null && requestedSeo == null) {
        return { status: 400, json: { ok: false, error: "Invalid seo" } };
      }

      const data: any = {};
      if (typeof args?.title === "string") data.title = args.title.trim();
      if (typeof args?.contentMarkdown === "string") data.contentMarkdown = args.contentMarkdown;
      if (typeof args?.sortOrder === "number" && Number.isFinite(args.sortOrder)) data.sortOrder = args.sortOrder;

      if (typeof args?.editorMode === "string") {
        const m = args.editorMode.trim().toUpperCase();
        if (m !== "MARKDOWN" && m !== "BLOCKS" && m !== "CUSTOM_HTML") {
          return { status: 400, json: { ok: false, error: "Invalid editorMode" } };
        }
        data.editorMode = m;
      }
      if (typeof args?.customHtml === "string") data.customHtml = args.customHtml;
      if (args?.blocksJson !== undefined) data.blocksJson = args.blocksJson;
      if (args?.customChatJson !== undefined) data.customChatJson = args.customChatJson;

      if (typeof args?.slug === "string") {
        const slug = args.slug
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 64);
        if (!slug) return { status: 400, json: { ok: false, error: "Invalid slug" } };
        data.slug = slug;
      }

      const updated = Object.keys(data).length
        ? await prisma.creditFunnelPage.update({
            where: { id: pageId },
            data,
            select: {
              id: true,
              slug: true,
              title: true,
              sortOrder: true,
              contentMarkdown: true,
              editorMode: true,
              blocksJson: true,
              customHtml: true,
              customChatJson: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : await prisma.creditFunnelPage.findUniqueOrThrow({
            where: { id: pageId },
            select: {
              id: true,
              slug: true,
              title: true,
              sortOrder: true,
              contentMarkdown: true,
              editorMode: true,
              blocksJson: true,
              customHtml: true,
              customChatJson: true,
              createdAt: true,
              updatedAt: true,
            },
          });

      let nextSeo: FunnelPageSeo | null = null;
      if (wantsSeoUpdate) {
        const existingSettings = await prisma.creditFunnelBuilderSettings
          .findUnique({ where: { ownerId }, select: { dataJson: true } })
          .catch(() => null);
        const nextJson = writeFunnelPageSeo(existingSettings?.dataJson ?? null, pageId, (requestedSeo as any) ?? null);

        await prisma.creditFunnelBuilderSettings.upsert({
          where: { ownerId },
          update: { dataJson: nextJson as any },
          create: { ownerId, dataJson: nextJson as any },
          select: { ownerId: true },
        });

        nextSeo = readFunnelPageSeo(nextJson, pageId);
      } else {
        const existingSettings = await prisma.creditFunnelBuilderSettings
          .findUnique({ where: { ownerId }, select: { dataJson: true } })
          .catch(() => null);
        nextSeo = readFunnelPageSeo(existingSettings?.dataJson ?? null, pageId);
      }

      return { status: 200, json: { ok: true, page: { ...updated, seo: nextSeo } } };
    }

    case "funnel_builder.pages.delete": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const funnelId = String(args?.funnelId || "").trim();
      const pageId = String(args?.pageId || "").trim();
      if (!funnelId || !pageId) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const page = await prisma.creditFunnelPage.findFirst({
        where: { id: pageId, funnelId, funnel: { ownerId } },
        select: { id: true },
      });
      if (!page) return { status: 404, json: { ok: false, error: "Not found" } };

      try {
        const existingSettings = await prisma.creditFunnelBuilderSettings
          .findUnique({ where: { ownerId }, select: { dataJson: true } })
          .catch(() => null);
        if (existingSettings?.dataJson != null) {
          const nextJson = writeFunnelPageSeo(existingSettings.dataJson, pageId, null);
          await prisma.creditFunnelBuilderSettings.update({ where: { ownerId }, data: { dataJson: nextJson as any }, select: { ownerId: true } });
        }
      } catch {
        // ignore
      }

      await prisma.creditFunnelPage.delete({ where: { id: pageId } });
      return { status: 200, json: { ok: true } };
    }

    case "funnel_builder.pages.export_custom_html": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const funnelId = String(args?.funnelId || "").trim();
      const pageId = String(args?.pageId || "").trim();
      if (!funnelId || !pageId) return { status: 400, json: { ok: false, error: "Invalid id" } };

      const page = await prisma.creditFunnelPage
        .findFirst({
          where: { id: pageId, funnelId, funnel: { ownerId } },
          select: { id: true, slug: true, title: true, editorMode: true, blocksJson: true, customHtml: true, customChatJson: true, updatedAt: true },
        })
        .catch(() => null);

      if (!page) return { status: 404, json: { ok: false, error: "Not found" } };

      const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { clientPortalVariant: true } }).catch(() => null);
      const basePath = owner?.clientPortalVariant === "CREDIT" ? "/credit" : "";

      function coerceBlocks(raw: unknown): CreditFunnelBlock[] {
        if (!Array.isArray(raw)) return [];
        return (raw as CreditFunnelBlock[]).filter((b) => b && typeof b === "object");
      }

      const blocksFromClient = coerceBlocks(args?.blocksJson);
      const blocksFromDb = coerceBlocks(page.blocksJson);
      const blocks = blocksFromClient.length ? blocksFromClient : blocksFromDb;

      const html = blocksToCustomHtmlDocument({
        blocks,
        pageId: page.id,
        ownerId,
        basePath,
        title: typeof args?.title === "string" && args.title.trim() ? args.title.trim() : page.title || "Funnel page",
      });

      const updated = await prisma.creditFunnelPage.update({
        where: { id: page.id },
        data: {
          ...(blocksFromClient.length ? { blocksJson: blocksFromClient as any } : null),
          customHtml: html,
          ...(typeof args?.setEditorMode === "string" ? { editorMode: args.setEditorMode } : null),
        },
        select: {
          id: true,
          slug: true,
          title: true,
          editorMode: true,
          blocksJson: true,
          customHtml: true,
          customChatJson: true,
          updatedAt: true,
        },
      });

      return { status: 200, json: { ok: true, html: updated.customHtml, page: updated } };
    }

    case "funnel_builder.pages.global_header": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const funnelId = String(args?.funnelId || "").trim();
      if (!funnelId) return { status: 400, json: { ok: false, error: "Invalid funnelId" } };

      const funnel = await prisma.creditFunnel.findFirst({ where: { id: funnelId, ownerId }, select: { id: true } });
      if (!funnel) return { status: 404, json: { ok: false, error: "Not found" } };

      const pages = await prisma.creditFunnelPage.findMany({
        where: { funnelId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          sortOrder: true,
          contentMarkdown: true,
          editorMode: true,
          blocksJson: true,
          customHtml: true,
          customChatJson: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (args?.mode === "apply") {
        const header = coerceHeaderNavFromUnknown(args?.headerBlock, true);
        if (!header) return { status: 400, json: { ok: false, error: "Invalid header block" } };

        const updates = pages.map((p) => {
          const coerced = coerceBlocksJson(p.blocksJson);
          const first = coerced[0];
          const pageSettings = first && first.type === "page" ? first : null;
          const editable = coerced.filter((b) => b.type !== "page");
          const withoutGlobal = removeGlobalHeaders(editable);
          const nextEditable = [header, ...withoutGlobal];
          const nextBlocks = pageSettings ? [pageSettings, ...nextEditable] : nextEditable;
          return prisma.creditFunnelPage.update({
            where: { id: p.id },
            data: { blocksJson: nextBlocks },
            select: {
              id: true,
              slug: true,
              title: true,
              sortOrder: true,
              contentMarkdown: true,
              editorMode: true,
              blocksJson: true,
              customHtml: true,
              customChatJson: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        });

        const updatedPages = await prisma.$transaction(updates);
        return { status: 200, json: { ok: true, pages: updatedPages } };
      }

      if (args?.mode === "unset") {
        const localHeader = coerceHeaderNavFromUnknown(args?.localHeaderBlock, false);
        if (!localHeader) return { status: 400, json: { ok: false, error: "Invalid header block" } };

        const keepOnPageId = String(args?.keepOnPageId || "").trim();
        const updates = pages.map((p) => {
          const coerced = coerceBlocksJson(p.blocksJson);
          const first = coerced[0];
          const pageSettings = first && first.type === "page" ? first : null;
          const editable = coerced.filter((b) => b.type !== "page");
          const withoutGlobal = removeGlobalHeaders(editable);
          const nextEditable = p.id === keepOnPageId ? [localHeader, ...withoutGlobal] : withoutGlobal;
          const nextBlocks = pageSettings ? [pageSettings, ...nextEditable] : nextEditable;
          return prisma.creditFunnelPage.update({
            where: { id: p.id },
            data: { blocksJson: nextBlocks },
            select: {
              id: true,
              slug: true,
              title: true,
              sortOrder: true,
              contentMarkdown: true,
              editorMode: true,
              blocksJson: true,
              customHtml: true,
              customChatJson: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        });

        const updatedPages = await prisma.$transaction(updates);
        return { status: 200, json: { ok: true, pages: updatedPages } };
      }

      return { status: 400, json: { ok: false, error: "Invalid payload" } };
    }

    case "funnel_builder.sales.products.list": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const secretKey = await getStripeSecretKeyForOwner(ownerId).catch(() => null);
      if (!secretKey) return { status: 400, json: { ok: false, error: "Stripe is not connected" } };

      type StripePrice = {
        id: string;
        unit_amount: number | null;
        currency: string;
      };

      type StripeProduct = {
        id: string;
        name: string;
        description: string | null;
        images: string[];
        active: boolean;
        default_price?: StripePrice | string | null;
      };

      type StripeList<T> = { data: T[] };

      function normalizeStripeProduct(p: StripeProduct) {
        const defaultPriceObj = p.default_price && typeof p.default_price === "object" ? (p.default_price as StripePrice) : null;
        return {
          id: String(p.id || ""),
          name: String(p.name || ""),
          description: p.description ? String(p.description) : null,
          images: Array.isArray(p.images) ? p.images.map((s) => String(s)).filter(Boolean).slice(0, 8) : [],
          active: Boolean(p.active),
          defaultPrice: defaultPriceObj
            ? {
                id: String(defaultPriceObj.id || ""),
                unitAmount: typeof defaultPriceObj.unit_amount === "number" ? defaultPriceObj.unit_amount : null,
                currency: String(defaultPriceObj.currency || "").toLowerCase() || "usd",
              }
            : null,
        };
      }

      const list = await stripeGetWithKey<StripeList<StripeProduct>>(secretKey, "/v1/products", {
        limit: 100,
        active: true,
        "expand[]": ["data.default_price"],
      });

      const products = Array.isArray(list?.data) ? list.data.map(normalizeStripeProduct) : [];
      return { status: 200, json: { ok: true, products } };
    }

    case "funnel_builder.sales.products.create": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const secretKey = await getStripeSecretKeyForOwner(ownerId).catch(() => null);
      if (!secretKey) return { status: 400, json: { ok: false, error: "Stripe is not connected" } };

      const name = typeof args?.name === "string" ? args.name.trim() : "";
      if (!name || name.length > 120) return { status: 400, json: { ok: false, error: "Invalid name" } };

      const description = typeof args?.description === "string" ? args.description.trim().slice(0, 1000) : "";
      const imageUrls = Array.isArray(args?.imageUrls)
        ? (args.imageUrls as unknown[]).map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
        : [];

      const priceCents = typeof args?.priceCents === "number" && Number.isFinite(args.priceCents) ? Math.floor(args.priceCents) : NaN;
      if (!Number.isFinite(priceCents) || priceCents < 50 || priceCents > 100_000_00) {
        return { status: 400, json: { ok: false, error: "Invalid priceCents" } };
      }

      const currency = typeof args?.currency === "string" && args.currency.trim() ? args.currency.trim().toLowerCase() : "usd";

      const created = await stripePostWithKey<any>(secretKey, "/v1/products", {
        name,
        ...(description ? { description } : {}),
        ...(imageUrls.length ? { "images[]": imageUrls } : {}),
        "default_price_data[unit_amount]": priceCents,
        "default_price_data[currency]": currency,
      });

      const product = {
        id: String(created?.id || ""),
        name: String(created?.name || ""),
        description: created?.description ? String(created.description) : null,
        images: Array.isArray(created?.images) ? created.images.map((s: any) => String(s)).filter(Boolean).slice(0, 8) : [],
        active: Boolean(created?.active),
      };

      return { status: 200, json: { ok: true, product } };
    }

    case "blogs.appearance.get": {
      const appearance = await getBlogAppearance(ownerId);
      return { status: 200, json: { ok: true, appearance } };
    }

    case "blogs.appearance.update": {
      const appearance = await setBlogAppearance(ownerId, args as any);
      return { status: 200, json: { ok: true, appearance } };
    }

    case "blogs.site.get": {
      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      async function ensurePublicSlug(desiredName: string) {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const base = slugify(profile?.businessName ?? desiredName) || "blog";
        const desired = base.length >= 3 ? base : "blog";

        let slug = desired;
        if (canUseSlugColumn) {
          const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug } })) as any;
          if (collision && collision.ownerId !== ownerId) {
            slug = `${desired}-${ownerId.slice(0, 6)}`;
          }
        }

        return slug;
      }

      const select: any = {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      };

      let site = (await prisma.clientBlogSite.findUnique({ where: { ownerId }, select } as any)) as any;

      const currentSlug = (site as any)?.slug as string | null | undefined;
      if (site && canUseSlugColumn && !currentSlug) {
        const slug = await ensurePublicSlug(String(site.name || "Blog"));
        site = (await (prisma.clientBlogSite as any).update({ where: { ownerId }, data: { slug }, select } as any)) as any;
      }

      let fallbackSlug: string | null = null;
      if (site && !canUseSlugColumn) {
        fallbackSlug = await getStoredBlogSiteSlug(ownerId);
        if (!fallbackSlug) {
          fallbackSlug = await ensureStoredBlogSiteSlug(ownerId, String(site.name || "Blog"));
        }
      }

      return {
        status: 200,
        json: {
          ok: true,
          site: site
            ? {
                ...(site as any),
                slug: canUseSlugColumn ? ((site as any).slug ?? null) : fallbackSlug,
              }
            : null,
        },
      };
    }

    case "blogs.site.create": {
      function normalizeDomain(raw: string | null | undefined) {
        const v = String(raw || "").trim().toLowerCase();
        if (!v) return null;

        const withoutProtocol = v.replace(/^https?:\/\//, "");
        const withoutPath = withoutProtocol.split("/")[0] ?? "";
        const d = withoutPath.replace(/:\d+$/, "");
        return d.length ? d : null;
      }

      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      async function ensurePublicSlug(desiredName: string) {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const base = slugify(profile?.businessName ?? desiredName) || "blog";
        const desired = base.length >= 3 ? base : "blog";

        let slug = desired;
        if (canUseSlugColumn) {
          const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug } })) as any;
          if (collision && collision.ownerId !== ownerId) {
            slug = `${desired}-${ownerId.slice(0, 6)}`;
          }
        }

        return slug;
      }

      const slugFieldProvided = Object.prototype.hasOwnProperty.call(args as any, "slug");
      const rawSlug = typeof (args as any).slug === "string" ? String((args as any).slug).trim() : "";
      const requestedSlug = rawSlug.length ? slugify(rawSlug) : null;

      if (slugFieldProvided && !canUseSlugColumn) {
        try {
          if (requestedSlug) {
            await setStoredBlogSiteSlug(ownerId, requestedSlug);
          } else {
            await ensureStoredBlogSiteSlug(ownerId, String((args as any).name || "").trim());
          }
        } catch (e) {
          return { status: 409, json: { ok: false, error: e instanceof Error ? e.message : "That blog link is already taken." } };
        }
      }

      const select: any = {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      };

      const existing = (await prisma.clientBlogSite.findUnique({ where: { ownerId }, select } as any)) as any;

      const name = String((args as any).name || "").trim();
      const primaryDomain = normalizeDomain((args as any).primaryDomain);

      if (existing) {
        const currentPrimaryDomain = normalizeDomain((existing as any)?.primaryDomain);
        const domainChanged = primaryDomain !== currentPrimaryDomain;
        const tokenMissing = Boolean(primaryDomain) && !String((existing as any)?.verificationToken || "").trim();
        const nextVerificationToken =
          domainChanged && primaryDomain
            ? crypto.randomBytes(18).toString("hex")
            : tokenMissing
              ? crypto.randomBytes(18).toString("hex")
              : (existing as any)?.verificationToken;

        let nextSlug: string | undefined = undefined;
        if (canUseSlugColumn && slugFieldProvided) {
          nextSlug = requestedSlug ? requestedSlug : await ensurePublicSlug(name);

          const currentSlug = (existing as any)?.slug as string | null | undefined;
          if (nextSlug && nextSlug !== currentSlug) {
            const collision = (await (prisma.clientBlogSite as any).findUnique({
              where: { slug: nextSlug },
              select: { ownerId: true },
            })) as any;
            if (collision && collision.ownerId !== ownerId) {
              return { status: 409, json: { ok: false, error: "That blog link is already taken." } };
            }
          }
        }

        const updated = (await (prisma.clientBlogSite as any).update({
          where: { ownerId },
          data: {
            name,
            primaryDomain,
            ...(domainChanged
              ? { verifiedAt: null, verificationToken: nextVerificationToken }
              : tokenMissing
                ? { verificationToken: nextVerificationToken }
                : {}),
            ...(primaryDomain ? {} : domainChanged ? { verifiedAt: null } : {}),
            ...(canUseSlugColumn && nextSlug !== undefined ? { slug: nextSlug } : {}),
          },
          select,
        })) as any;

        return {
          status: 200,
          json: {
            ok: true,
            site: {
              ...(updated as any),
              slug: canUseSlugColumn ? ((updated as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
            },
          },
        };
      }

      const token = crypto.randomBytes(18).toString("hex");

      const slug = requestedSlug ? requestedSlug : await ensurePublicSlug(name);

      if (!canUseSlugColumn) {
        try {
          if (requestedSlug) {
            await setStoredBlogSiteSlug(ownerId, requestedSlug);
          } else {
            await ensureStoredBlogSiteSlug(ownerId, name);
          }
        } catch {
          // If requested is taken, fall back to generated slug.
          await ensureStoredBlogSiteSlug(ownerId, name);
        }
      }

      if (canUseSlugColumn && slug) {
        const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } })) as any;
        if (collision && collision.ownerId !== ownerId) {
          return { status: 409, json: { ok: false, error: "That blog link is already taken." } };
        }
      }

      const created = (await (prisma.clientBlogSite as any).create({
        data: {
          ownerId,
          name,
          ...(canUseSlugColumn ? { slug } : {}),
          primaryDomain,
          verificationToken: token,
        },
        select,
      })) as any;

      return {
        status: 200,
        json: {
          ok: true,
          site: {
            ...(created as any),
            slug: canUseSlugColumn ? ((created as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
          },
        },
      };
    }

    case "blogs.site.update": {
      function normalizeDomain(raw: string | null | undefined) {
        const v = String(raw || "").trim().toLowerCase();
        if (!v) return null;

        const withoutProtocol = v.replace(/^https?:\/\//, "");
        const withoutPath = withoutProtocol.split("/")[0] ?? "";
        const d = withoutPath.replace(/:\d+$/, "");
        return d.length ? d : null;
      }

      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      async function ensurePublicSlug(desiredName: string) {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const base = slugify(profile?.businessName ?? desiredName) || "blog";
        const desired = base.length >= 3 ? base : "blog";

        let slug = desired;
        if (canUseSlugColumn) {
          const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug } })) as any;
          if (collision && collision.ownerId !== ownerId) {
            slug = `${desired}-${ownerId.slice(0, 6)}`;
          }
        }

        return slug;
      }

      const slugFieldProvided = Object.prototype.hasOwnProperty.call(args as any, "slug");
      const rawSlug = typeof (args as any).slug === "string" ? String((args as any).slug).trim() : "";
      const requestedSlug = rawSlug.length ? slugify(rawSlug) : null;

      if (slugFieldProvided && !canUseSlugColumn) {
        try {
          if (requestedSlug) {
            await setStoredBlogSiteSlug(ownerId, requestedSlug);
          } else {
            await ensureStoredBlogSiteSlug(ownerId, String((args as any).name || "").trim());
          }
        } catch (e) {
          return { status: 409, json: { ok: false, error: e instanceof Error ? e.message : "That blog link is already taken." } };
        }
      }

      const select: any = {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      };

      const primaryDomain = normalizeDomain((args as any).primaryDomain);
      const name = String((args as any).name || "").trim();

      const existing = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { primaryDomain: true } });
      const domainChanged = (existing?.primaryDomain ?? null) !== primaryDomain;

      let nextSlug: string | null | undefined = undefined;
      if (canUseSlugColumn && slugFieldProvided) {
        if (requestedSlug) {
          nextSlug = requestedSlug;
        } else {
          nextSlug = await ensurePublicSlug(name);
        }

        const current = (await (prisma.clientBlogSite as any).findUnique({ where: { ownerId }, select: { slug: true } })) as any;
        const currentSlug = (current as any)?.slug as string | null | undefined;
        if (nextSlug && nextSlug !== currentSlug) {
          const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug: nextSlug }, select: { ownerId: true } })) as any;
          if (collision && collision.ownerId !== ownerId) {
            return { status: 409, json: { ok: false, error: "That blog link is already taken." } };
          }
        }
      }

      const updated = (await (prisma.clientBlogSite as any).upsert({
        where: { ownerId },
        create: {
          ownerId,
          name,
          ...(canUseSlugColumn ? { slug: nextSlug ?? requestedSlug ?? (await ensurePublicSlug(name)) } : {}),
          primaryDomain,
          verificationToken: crypto.randomBytes(18).toString("hex"),
          verifiedAt: null,
        },
        update: {
          name,
          ...(canUseSlugColumn
            ? {
                ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
                ...(nextSlug === undefined
                  ? await (async () => {
                      const existing = (await (prisma.clientBlogSite as any).findUnique({ where: { ownerId }, select: { slug: true } })) as any;
                      if ((existing as any)?.slug) return {};
                      return { slug: await ensurePublicSlug(name) };
                    })()
                  : {}),
              }
            : {}),
          primaryDomain,
          ...(domainChanged
            ? {
                verifiedAt: null,
                verificationToken: crypto.randomBytes(18).toString("hex"),
              }
            : {}),
        },
        select,
      })) as any;

      return {
        status: 200,
        json: {
          ok: true,
          site: {
            ...(updated as any),
            slug: canUseSlugColumn ? ((updated as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
          },
        },
      };
    }

    case "blogs.usage.get": {
      type RangeKey = "7d" | "30d" | "90d" | "all";
      const raw = typeof (args as any)?.range === "string" ? String((args as any).range).trim() : "30d";
      const range = ((): RangeKey => {
        switch (raw.toLowerCase()) {
          case "7d":
          case "7":
            return "7d";
          case "90d":
          case "90":
            return "90d";
          case "all":
            return "all";
          case "30d":
          case "30":
          default:
            return "30d";
        }
      })();

      const now = new Date();
      const start = range === "all" ? new Date(0) : new Date(now.getTime() - (range === "7d" ? 7 : range === "30d" ? 30 : 90) * 24 * 60 * 60 * 1000);

      const [site, aggRange, aggAll] = await Promise.all([
        prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }),
        prisma.portalBlogGenerationEvent.aggregate({
          where: { ownerId, createdAt: { gte: start } },
          _count: { id: true },
          _sum: { chargedCredits: true },
        }),
        prisma.portalBlogGenerationEvent.aggregate({
          where: { ownerId },
          _count: { id: true },
          _sum: { chargedCredits: true },
        }),
      ]);

      return {
        status: 200,
        json: {
          ok: true,
          range,
          siteId: site?.id ?? null,
          creditsUsed: {
            range: typeof aggRange._sum.chargedCredits === "number" ? aggRange._sum.chargedCredits : 0,
            all: typeof aggAll._sum.chargedCredits === "number" ? aggAll._sum.chargedCredits : 0,
          },
          generations: {
            range: typeof aggRange._count.id === "number" ? aggRange._count.id : 0,
            all: typeof aggAll._count.id === "number" ? aggAll._count.id : 0,
          },
        },
      };
    }

    case "blogs.posts.list": {
      const take = typeof (args as any)?.take === "number" && Number.isFinite((args as any).take) ? Math.min(200, Math.max(1, Math.floor((args as any).take))) : 50;
      const includeArchived = Boolean((args as any)?.includeArchived);

      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
      const siteId = site?.id ?? null;
      if (!siteId) return { status: 200, json: { ok: true, posts: [] } };

      const posts = await prisma.clientBlogPost.findMany({
        where: {
          siteId,
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: [{ updatedAt: "desc" }],
        take,
        select: {
          id: true,
          status: true,
          slug: true,
          title: true,
          excerpt: true,
          publishedAt: true,
          archivedAt: true,
          updatedAt: true,
        },
      });

      return { status: 200, json: { ok: true, posts } };
    }

    case "blogs.posts.create": {
      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
      const siteId = site?.id ?? null;
      if (!siteId) return { status: 400, json: { ok: false, error: "Create your blog site first" } };

      const title = typeof (args as any)?.title === "string" ? String((args as any).title).trim().slice(0, 180) : "";
      const finalTitle = title || "Untitled post";
      const slug = await uniqueBlogSlug(siteId, finalTitle);

      const created = await prisma.clientBlogPost.create({
        data: {
          siteId,
          status: "DRAFT",
          slug,
          title: finalTitle,
          excerpt: "",
          content: "",
        },
        select: {
          id: true,
          status: true,
          slug: true,
          title: true,
          excerpt: true,
          content: true,
          publishedAt: true,
          archivedAt: true,
          updatedAt: true,
        },
      });

      return { status: 200, json: { ok: true, post: created } };
    }

    case "blogs.posts.get": {
      const postId = String((args as any)?.postId || "").trim();
      const post = await prisma.clientBlogPost.findFirst({
        where: { id: postId, site: { ownerId } },
        select: {
          id: true,
          status: true,
          slug: true,
          title: true,
          excerpt: true,
          content: true,
          seoKeywords: true,
          publishedAt: true,
          archivedAt: true,
          updatedAt: true,
        },
      });
      if (!post) return { status: 404, json: { ok: false, error: "Not found" } };
      return { status: 200, json: { ok: true, post } };
    }

    case "blogs.posts.update": {
      const postId = String((args as any)?.postId || "").trim();

      const existing = await prisma.clientBlogPost.findFirst({
        where: { id: postId, site: { ownerId } },
        select: { id: true, siteId: true },
      });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      async function uniqueSlugForUpdate(siteId: string, desired: string, currentId: string) {
        const base = slugify(desired) || "post";
        let attempt = base;
        for (let i = 0; i < 50; i += 1) {
          const exists = await prisma.clientBlogPost.findUnique({
            where: { siteId_slug: { siteId, slug: attempt } },
            select: { id: true },
          });
          if (!exists || exists.id === currentId) return attempt;
          attempt = `${base}-${i + 2}`;
        }
        return `${base}-${Date.now()}`;
      }

      const desiredSlug = String((args as any).slug || "").trim();
      const slug = await uniqueSlugForUpdate(existing.siteId, desiredSlug, existing.id);

      const updated = await prisma.clientBlogPost.update({
        where: { id: existing.id },
        data: {
          title: String((args as any).title || "").trim(),
          slug,
          excerpt: String((args as any).excerpt ?? ""),
          content: String((args as any).content ?? ""),
          seoKeywords: Array.isArray((args as any).seoKeywords) && (args as any).seoKeywords.length ? (args as any).seoKeywords : Prisma.DbNull,
          archivedAt: (args as any).archived ? new Date() : null,
          ...(typeof (args as any).publishedAt !== "undefined"
            ? { publishedAt: (args as any).publishedAt ? new Date(String((args as any).publishedAt)) : null }
            : {}),
        },
        select: {
          id: true,
          status: true,
          slug: true,
          title: true,
          excerpt: true,
          content: true,
          seoKeywords: true,
          publishedAt: true,
          archivedAt: true,
          updatedAt: true,
        },
      });

      return { status: 200, json: { ok: true, post: updated } };
    }

    case "blogs.posts.delete": {
      const postId = String((args as any)?.postId || "").trim();
      const existing = await prisma.clientBlogPost.findFirst({ where: { id: postId, site: { ownerId } }, select: { id: true } });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };
      await prisma.clientBlogPost.delete({ where: { id: existing.id } });
      return { status: 200, json: { ok: true } };
    }

    case "blogs.posts.archive": {
      const postId = String((args as any)?.postId || "").trim();
      const archived = Boolean((args as any)?.archived);

      const existing = await prisma.clientBlogPost.findFirst({
        where: { id: postId, site: { ownerId } },
        select: { id: true },
      });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      const updated = await prisma.clientBlogPost.update({
        where: { id: existing.id },
        data: { archivedAt: archived ? new Date() : null },
        select: { id: true, archivedAt: true, updatedAt: true },
      });

      return { status: 200, json: { ok: true, post: updated } };
    }

    case "blogs.posts.export_markdown": {
      const postId = String((args as any)?.postId || "").trim();
      const post = await prisma.clientBlogPost.findFirst({
        where: { id: postId, site: { ownerId } },
        select: { title: true, slug: true, excerpt: true, content: true },
      });
      if (!post) return { status: 404, json: { ok: false, error: "Not found" } };

      const md = `# ${post.title}\n\n${post.excerpt ? post.excerpt + "\n\n" : ""}${post.content || ""}\n`;
      const fileName = `${String(post.slug || "post")}.md`;
      return { status: 200, json: { ok: true, markdown: md, fileName } };
    }

    case "blogs.automation.settings.get": {
      type StoredSettings = {
        enabled?: boolean;
        frequencyDays?: number;
        topics?: string[];
        cursor?: number;
        autoPublish?: boolean;
        lastRunAt?: string;
      };

      function normalizeTopics(items: unknown): string[] {
        if (!Array.isArray(items)) return [];
        const out: string[] = [];
        const seen = new Set<string>();
        for (const item of items) {
          if (typeof item !== "string") continue;
          const t = item.trim();
          if (!t) continue;
          const key = t.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(t);
          if (out.length >= 50) break;
        }
        return out;
      }

      function parseStored(value: unknown): Required<Pick<StoredSettings, "enabled" | "frequencyDays" | "topics" | "cursor" | "autoPublish">> & Pick<StoredSettings, "lastRunAt"> {
        const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        return {
          enabled: Boolean(rec?.enabled),
          frequencyDays:
            typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
              ? Math.min(30, Math.max(1, Math.floor(rec.frequencyDays)))
              : 7,
          topics: normalizeTopics(rec?.topics),
          cursor: typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0,
          autoPublish: Boolean(rec?.autoPublish),
          lastRunAt: typeof rec?.lastRunAt === "string" ? rec.lastRunAt : undefined,
        };
      }

      const setup = await prisma.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
        select: { id: true, dataJson: true, updatedAt: true },
      });

      const parsed = parseStored(setup?.dataJson);

      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
      let lastGeneratedAt: Date | null = null;
      if (site?.id) {
        const last = await prisma.clientBlogPost.findFirst({
          where: { siteId: site.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        lastGeneratedAt = last?.createdAt ?? null;
      }

      const nextDueAt = lastGeneratedAt
        ? new Date(lastGeneratedAt.getTime() + parsed.frequencyDays * 24 * 60 * 60 * 1000)
        : new Date();

      return {
        status: 200,
        json: {
          ok: true,
          settings: {
            ...parsed,
            lastGeneratedAt: lastGeneratedAt ? lastGeneratedAt.toISOString() : null,
            nextDueAt: nextDueAt.toISOString(),
          },
        },
      };
    }

    case "blogs.automation.settings.update": {
      type StoredSettings = {
        enabled?: boolean;
        frequencyDays?: number;
        topics?: string[];
        cursor?: number;
        autoPublish?: boolean;
        lastRunAt?: string;
      };

      function normalizeTopics(items: unknown): string[] {
        if (!Array.isArray(items)) return [];
        const out: string[] = [];
        const seen = new Set<string>();
        for (const item of items) {
          if (typeof item !== "string") continue;
          const t = item.trim();
          if (!t) continue;
          const key = t.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(t);
          if (out.length >= 50) break;
        }
        return out;
      }

      function parseStored(value: unknown): Required<Pick<StoredSettings, "enabled" | "frequencyDays" | "topics" | "cursor" | "autoPublish">> & Pick<StoredSettings, "lastRunAt"> {
        const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        return {
          enabled: Boolean(rec?.enabled),
          frequencyDays:
            typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
              ? Math.min(30, Math.max(1, Math.floor(rec.frequencyDays)))
              : 7,
          topics: normalizeTopics(rec?.topics),
          cursor: typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0,
          autoPublish: Boolean(rec?.autoPublish),
          lastRunAt: typeof rec?.lastRunAt === "string" ? rec.lastRunAt : undefined,
        };
      }

      const existing = await prisma.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
        select: { dataJson: true },
      });
      const prev = parseStored(existing?.dataJson);

      const next: StoredSettings = {
        enabled: Boolean((args as any).enabled),
        frequencyDays: Number((args as any).frequencyDays),
        topics: normalizeTopics((args as any).topics),
        cursor: prev.cursor,
        autoPublish: Boolean((args as any).autoPublish),
        lastRunAt: prev.lastRunAt,
      };

      const row = await prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
        create: { ownerId, serviceSlug: "blogs", status: "IN_PROGRESS", dataJson: next },
        update: { dataJson: next },
        select: { id: true, dataJson: true, updatedAt: true },
      });

      return { status: 200, json: { ok: true, settings: parseStored(row.dataJson), updatedAt: row.updatedAt.toISOString() } };
    }

    case "blogs.generate_now": {
      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
      if (!site?.id) {
        return { status: 409, json: { ok: false, error: "Create your blog workspace first." } };
      }

      const needCredits = PORTAL_CREDIT_COSTS.blogGenerateDraft;
      const consumed = await consumeCredits(ownerId, needCredits);
      if (!consumed.ok) {
        return {
          status: 402,
          json: {
            ok: false,
            code: "INSUFFICIENT_CREDITS",
            error: "Not enough credits to generate a blog post.",
            credits: consumed.state.balance,
            billingPath: "/portal/app/billing",
          },
        };
      }

      const profile = await prisma.businessProfile.findUnique({
        where: { ownerId },
        select: { businessName: true, websiteUrl: true, industry: true, businessModel: true, primaryGoals: true, targetCustomer: true, brandVoice: true },
      });

      const primaryGoals = Array.isArray(profile?.primaryGoals)
        ? (profile?.primaryGoals as unknown[]).filter((x) => typeof x === "string").map((x) => String(x)).slice(0, 10)
        : undefined;

      const draft = await generateClientBlogDraft({
        businessName: profile?.businessName,
        websiteUrl: profile?.websiteUrl,
        industry: profile?.industry,
        businessModel: profile?.businessModel,
        primaryGoals,
        targetCustomer: profile?.targetCustomer,
        brandVoice: profile?.brandVoice,
      });

      const slug = await uniqueBlogSlug(site.id, draft.title);
      const post = await prisma.clientBlogPost.create({
        data: { siteId: site.id, status: "DRAFT", slug, title: draft.title, excerpt: draft.excerpt, content: draft.content, seoKeywords: draft.seoKeywords?.length ? draft.seoKeywords : undefined },
        select: { id: true },
      });

      return { status: 200, json: { ok: true, postId: post.id, creditsRemaining: consumed.state.balance } };
    }

    case "newsletter.site.get": {
      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      async function ensurePublicSlug(desiredName: string) {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const base = slugify(profile?.businessName ?? desiredName) || "site";
        const desired = base.length >= 3 ? base : "site";

        let slug = desired;
        if (canUseSlugColumn) {
          const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } })) as any;
          if (collision && collision.ownerId !== ownerId) {
            slug = `${desired}-${ownerId.slice(0, 6)}`;
          }
        }
        return slug;
      }

      const select: any = {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      };

      let site = (await prisma.clientBlogSite.findUnique({ where: { ownerId }, select } as any)) as any;

      const currentSlug = (site as any)?.slug as string | null | undefined;
      if (site && canUseSlugColumn && !currentSlug) {
        const slug = await ensurePublicSlug(String(site.name || "Site"));
        site = (await (prisma.clientBlogSite as any).update({ where: { ownerId }, data: { slug }, select } as any)) as any;
      }

      let fallbackSlug: string | null = null;
      if (site && !canUseSlugColumn) {
        fallbackSlug = await getStoredBlogSiteSlug(ownerId);
        if (!fallbackSlug) {
          fallbackSlug = await ensureStoredBlogSiteSlug(ownerId, String(site.name || "Site"));
        }
      }

      return {
        status: 200,
        json: {
          ok: true,
          site: site
            ? {
                ...(site as any),
                slug: canUseSlugColumn ? ((site as any).slug ?? null) : fallbackSlug,
              }
            : null,
        },
      };
    }

    case "newsletter.site.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      async function ensurePublicSlug(desiredName: string) {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const base = slugify(profile?.businessName ?? desiredName) || "site";
        const desired = base.length >= 3 ? base : "site";

        let slug = desired;
        if (canUseSlugColumn) {
          const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } })) as any;
          if (collision && collision.ownerId !== ownerId) {
            slug = `${desired}-${ownerId.slice(0, 6)}`;
          }
        }
        return slug;
      }

      const slugFieldProvided = Object.prototype.hasOwnProperty.call(args as any, "slug");
      const rawSlug = typeof (args as any).slug === "string" ? String((args as any).slug).trim() : "";
      const requestedSlug = rawSlug.length ? slugify(rawSlug) : null;

      if (slugFieldProvided && !canUseSlugColumn) {
        try {
          if (requestedSlug) {
            await setStoredBlogSiteSlug(ownerId, requestedSlug);
          } else {
            await ensureStoredBlogSiteSlug(ownerId, String((args as any).name || "").trim());
          }
        } catch (e) {
          return { status: 409, json: { ok: false, error: e instanceof Error ? e.message : "That link is already taken." } };
        }
      }

      const select: any = {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      };

      const existing = (await prisma.clientBlogSite.findUnique({ where: { ownerId }, select } as any)) as any;

      const name = String((args as any).name || "").trim();
      const primaryDomain = normalizeDomain(typeof (args as any).primaryDomain === "string" ? (args as any).primaryDomain : null);

      if (existing) {
        const currentPrimaryDomain = normalizeDomain((existing as any)?.primaryDomain);
        const domainChanged = primaryDomain !== currentPrimaryDomain;
        const tokenMissing = Boolean(primaryDomain) && !String((existing as any)?.verificationToken || "").trim();
        const nextVerificationToken =
          domainChanged && primaryDomain
            ? crypto.randomBytes(18).toString("hex")
            : tokenMissing
              ? crypto.randomBytes(18).toString("hex")
              : (existing as any)?.verificationToken;

        let nextSlug: string | undefined = undefined;
        if (canUseSlugColumn && slugFieldProvided) {
          nextSlug = requestedSlug ? requestedSlug : await ensurePublicSlug(name);

          const current = (existing as any)?.slug as string | null | undefined;
          if (nextSlug && nextSlug !== current) {
            const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug: nextSlug }, select: { ownerId: true } })) as any;
            if (collision && collision.ownerId !== ownerId) {
              return { status: 409, json: { ok: false, error: "That link is already taken." } };
            }
          }
        }

        const updated = (await (prisma.clientBlogSite as any).update({
          where: { ownerId },
          data: {
            name,
            primaryDomain,
            ...(domainChanged
              ? { verifiedAt: null, verificationToken: nextVerificationToken }
              : tokenMissing
                ? { verificationToken: nextVerificationToken }
                : {}),
            ...(primaryDomain ? {} : domainChanged ? { verifiedAt: null } : {}),
            ...(canUseSlugColumn && nextSlug !== undefined ? { slug: nextSlug } : {}),
          },
          select,
        })) as any;

        return {
          status: 200,
          json: {
            ok: true,
            site: {
              ...(updated as any),
              slug: canUseSlugColumn ? ((updated as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
            },
          },
        };
      }

      const token = crypto.randomBytes(18).toString("hex");
      const slug = requestedSlug ? requestedSlug : await ensurePublicSlug(name);

      if (!canUseSlugColumn) {
        try {
          if (requestedSlug) {
            await setStoredBlogSiteSlug(ownerId, requestedSlug);
          } else {
            await ensureStoredBlogSiteSlug(ownerId, name);
          }
        } catch {
          await ensureStoredBlogSiteSlug(ownerId, name);
        }
      }

      if (canUseSlugColumn && slug) {
        const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } })) as any;
        if (collision && collision.ownerId !== ownerId) {
          return { status: 409, json: { ok: false, error: "That link is already taken." } };
        }
      }

      const created = (await (prisma.clientBlogSite as any).create({
        data: {
          ownerId,
          name,
          primaryDomain,
          verificationToken: token,
          ...(canUseSlugColumn ? { slug } : {}),
        },
        select,
      })) as any;

      return {
        status: 200,
        json: {
          ok: true,
          site: {
            ...(created as any),
            slug: canUseSlugColumn ? ((created as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
          },
        },
      };
    }

    case "newsletter.usage.get": {
      type RangeKey = "7d" | "30d" | "90d" | "all";
      const raw = typeof (args as any)?.range === "string" ? String((args as any).range).trim() : "30d";
      const range = ((): RangeKey => {
        switch (raw.toLowerCase()) {
          case "7d":
          case "7":
            return "7d";
          case "90d":
          case "90":
            return "90d";
          case "all":
            return "all";
          case "30d":
          case "30":
          default:
            return "30d";
        }
      })();

      const now = new Date();
      const start = range === "all" ? new Date(0) : new Date(now.getTime() - (range === "7d" ? 7 : range === "30d" ? 30 : 90) * 24 * 60 * 60 * 1000);

      const [site, aggRange, aggAll] = await Promise.all([
        prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }),
        prisma.portalNewsletterGenerationEvent.aggregate({
          where: { ownerId, createdAt: { gte: start } },
          _count: { id: true },
          _sum: { chargedCredits: true },
        }),
        prisma.portalNewsletterGenerationEvent.aggregate({
          where: { ownerId },
          _count: { id: true },
          _sum: { chargedCredits: true },
        }),
      ]);

      return {
        status: 200,
        json: {
          ok: true,
          range,
          siteId: site?.id ?? null,
          creditsUsed: {
            range: typeof aggRange._sum.chargedCredits === "number" ? aggRange._sum.chargedCredits : 0,
            all: typeof aggAll._sum.chargedCredits === "number" ? aggAll._sum.chargedCredits : 0,
          },
          generations: {
            range: typeof aggRange._count.id === "number" ? aggRange._count.id : 0,
            all: typeof aggAll._count.id === "number" ? aggAll._count.id : 0,
          },
        },
      };
    }

    case "newsletter.newsletters.list": {
      const kindRaw = typeof (args as any)?.kind === "string" ? String((args as any).kind).trim().toLowerCase() : "external";
      const kind = kindRaw === "internal" ? ("INTERNAL" as const) : ("EXTERNAL" as const);
      const take = typeof (args as any)?.take === "number" && Number.isFinite((args as any).take) ? Math.min(200, Math.max(1, Math.floor((args as any).take))) : 50;

      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, slug: true } });
      if (!site?.id) return { status: 200, json: { ok: true, site: null, newsletters: [] } };

      const newsletters = await prisma.clientNewsletter.findMany({
        where: { siteId: site.id, kind },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          kind: true,
          status: true,
          slug: true,
          title: true,
          excerpt: true,
          sentAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        status: 200,
        json: {
          ok: true,
          site: { id: site.id, slug: (site as any).slug ?? null },
          newsletters: newsletters.map((n) => ({
            id: n.id,
            kind: n.kind,
            status: n.status,
            slug: n.slug,
            title: n.title,
            excerpt: n.excerpt,
            sentAtIso: n.sentAt ? n.sentAt.toISOString() : null,
            createdAtIso: n.createdAt.toISOString(),
            updatedAtIso: n.updatedAt.toISOString(),
          })),
        },
      };
    }

    case "newsletter.newsletters.create": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const kindRaw = typeof (args as any)?.kind === "string" ? String((args as any).kind).trim().toLowerCase() : "external";
      const kind = kindRaw === "internal" ? ("INTERNAL" as const) : ("EXTERNAL" as const);
      const status = (args as any)?.status === "READY" ? "READY" : "DRAFT";

      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
      if (!site?.id) return { status: 404, json: { ok: false, error: "Newsletter site not configured" } };

      const slug = await uniqueNewsletterSlug(site.id, kind, String((args as any).title || "").trim());

      const created = await prisma.clientNewsletter.create({
        data: {
          siteId: site.id,
          kind,
          status,
          slug,
          title: String((args as any).title || "").trim(),
          excerpt: String((args as any).excerpt || "").trim(),
          content: String((args as any).content || "").trim(),
          smsText: (args as any).smsText ?? null,
        },
        select: { id: true, slug: true, status: true, createdAt: true },
      });

      return {
        status: 200,
        json: {
          ok: true,
          newsletter: {
            id: created.id,
            slug: created.slug,
            status: created.status,
            createdAtIso: created.createdAt.toISOString(),
          },
        },
      };
    }

    case "newsletter.newsletters.get": {
      const newsletterId = String((args as any)?.newsletterId || "").trim();

      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, slug: true, name: true } });
      if (!site?.id) return { status: 404, json: { ok: false, error: "Newsletter site not configured" } };

      const newsletter = await prisma.clientNewsletter.findFirst({
        where: { id: newsletterId, siteId: site.id },
        select: {
          id: true,
          siteId: true,
          kind: true,
          status: true,
          slug: true,
          title: true,
          excerpt: true,
          content: true,
          smsText: true,
          sentAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!newsletter) return { status: 404, json: { ok: false, error: "Not found" } };

      return {
        status: 200,
        json: {
          ok: true,
          site: { id: site.id, slug: (site as any).slug ?? null, name: site.name },
          newsletter: {
            ...(newsletter as any),
            sentAtIso: newsletter.sentAt ? newsletter.sentAt.toISOString() : null,
            createdAtIso: newsletter.createdAt.toISOString(),
            updatedAtIso: newsletter.updatedAt.toISOString(),
          },
        },
      };
    }

    case "newsletter.newsletters.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const newsletterId = String((args as any)?.newsletterId || "").trim();
      const hostedOnly = Boolean((args as any)?.hostedOnly);

      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
      if (!site?.id) return { status: 404, json: { ok: false, error: "Newsletter site not configured" } };

      const current = await prisma.clientNewsletter.findFirst({
        where: { id: newsletterId, siteId: site.id },
        select: { id: true, status: true, smsText: true },
      });
      if (!current) return { status: 404, json: { ok: false, error: "Not found" } };

      if (current.status === "SENT" && !hostedOnly) {
        return { status: 409, json: { ok: false, error: "Already sent" } };
      }

      const updated = await prisma.clientNewsletter.update({
        where: { id: current.id },
        data: {
          title: String((args as any).title || "").trim(),
          excerpt: String((args as any).excerpt || "").trim(),
          content: String((args as any).content || "").trim(),
          smsText: current.status === "SENT" ? current.smsText ?? null : ((args as any).smsText ?? null),
        },
        select: { id: true, updatedAt: true },
      });

      return { status: 200, json: { ok: true, newsletter: { id: updated.id, updatedAtIso: updated.updatedAt.toISOString() } } };
    }

    case "newsletter.audience.contacts.search": {
      const take = typeof (args as any)?.take === "number" && Number.isFinite((args as any).take) ? Math.min(200, Math.max(1, Math.floor((args as any).take))) : 50;
      const ids = Array.isArray((args as any)?.ids)
        ? (args as any).ids
            .map((x: any) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean)
            .slice(0, 200)
        : [];
      const q = typeof (args as any)?.q === "string" ? String((args as any).q).trim() : "";

      const where: any = { ownerId };
      if (ids.length) {
        where.id = { in: Array.from(new Set(ids)) };
      } else if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ];
      }

      const contacts = await prisma.portalContact.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          updatedAt: true,
          tagAssignments: {
            select: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take,
      });

      return {
        status: 200,
        json: {
          ok: true,
          contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            tags: (c as any).tagAssignments
              ? (c as any).tagAssignments
                  .map((a: any) => a?.tag)
                  .filter(Boolean)
                  .map((t: any) => ({
                    id: String(t.id),
                    name: String(t.name || "").slice(0, 60),
                    color: typeof t.color === "string" ? String(t.color) : null,
                  }))
              : [],
          })),
        },
      };
    }

    case "newsletter.automation.settings.get": {
      type NewsletterKind = "EXTERNAL" | "INTERNAL";
      type StoredKindSettings = {
        enabled?: boolean;
        frequencyDays?: number;
        cursor?: number;
        requireApproval?: boolean;
        channels?: { email?: boolean; sms?: boolean };
        topics?: string[];
        promptAnswers?: Record<string, string>;
        deliveryEmailHint?: string;
        deliverySmsHint?: string;
        includeImages?: boolean;
        royaltyFreeImages?: boolean;
        includeImagesWhereNeeded?: boolean;
        fontKey?: string;
        audience?: {
          tagIds?: string[];
          contactIds?: string[];
          emails?: string[];
          userIds?: string[];
          sendAllUsers?: boolean;
        };
      };

      type StoredSettings = { external: StoredKindSettings; internal: StoredKindSettings };

      function clampKind(raw: unknown): NewsletterKind {
        const s = typeof raw === "string" ? raw : "external";
        return s.toLowerCase().trim() === "internal" ? "INTERNAL" : "EXTERNAL";
      }

      function normalizeStrings(items: unknown, max: number) {
        if (!Array.isArray(items)) return [];
        const out: string[] = [];
        const seen = new Set<string>();
        for (const item of items) {
          if (typeof item !== "string") continue;
          const t = item.trim();
          if (!t) continue;
          const key = t.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(t);
          if (out.length >= max) break;
        }
        return out;
      }

      function parseKindSettings(value: unknown) {
        const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        const enabled = Boolean(rec?.enabled);
        const frequencyDays =
          typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
            ? Math.min(365, Math.max(1, Math.floor(rec.frequencyDays)))
            : 7;
        const cursor = typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0;
        const requireApproval = Boolean(rec?.requireApproval);

        const channelsRec = rec?.channels && typeof rec.channels === "object" ? (rec.channels as Record<string, unknown>) : null;
        const channels = {
          email: channelsRec ? Boolean(channelsRec.email ?? true) : true,
          sms: channelsRec ? Boolean(channelsRec.sms ?? true) : true,
        };

        const topics = normalizeStrings(rec?.topics, 50);

        const promptAnswersRaw = rec?.promptAnswers && typeof rec.promptAnswers === "object" ? (rec.promptAnswers as Record<string, unknown>) : null;
        const promptAnswers: Record<string, string> = {};
        if (promptAnswersRaw) {
          for (const [k, v] of Object.entries(promptAnswersRaw)) {
            if (typeof v !== "string") continue;
            const vv = v.trim();
            if (!vv) continue;
            promptAnswers[String(k).slice(0, 60)] = vv.slice(0, 2000);
          }
        }

        const audienceRaw = rec?.audience && typeof rec.audience === "object" ? (rec.audience as Record<string, unknown>) : null;
        const audience = {
          tagIds: normalizeStrings(audienceRaw?.tagIds, 200),
          contactIds: normalizeStrings(audienceRaw?.contactIds, 200),
          emails: normalizeStrings(audienceRaw?.emails, 200),
          userIds: normalizeStrings(audienceRaw?.userIds, 200),
          sendAllUsers: Boolean(audienceRaw?.sendAllUsers),
        };

        const deliveryEmailHint = typeof rec?.deliveryEmailHint === "string" ? rec.deliveryEmailHint.trim().slice(0, 1500) : "";
        const deliverySmsHint = typeof rec?.deliverySmsHint === "string" ? rec.deliverySmsHint.trim().slice(0, 800) : "";
        const includeImages = Boolean(rec?.includeImages);
        const royaltyFreeImages = typeof rec?.royaltyFreeImages === "boolean" ? rec.royaltyFreeImages : true;
        const includeImagesWhereNeeded = Boolean(rec?.includeImagesWhereNeeded);
        const fontKey = normalizeNewsletterFontKey(rec?.fontKey);

        return {
          enabled,
          frequencyDays,
          cursor,
          requireApproval,
          channels,
          topics,
          promptAnswers,
          audience,
          fontKey,
          royaltyFreeImages,
          ...(deliveryEmailHint ? { deliveryEmailHint } : {}),
          ...(deliverySmsHint ? { deliverySmsHint } : {}),
          ...(includeImages ? { includeImages } : {}),
          ...(includeImagesWhereNeeded ? { includeImagesWhereNeeded } : {}),
        } as any;
      }

      function parseStored(value: unknown): { external: ReturnType<typeof parseKindSettings>; internal: ReturnType<typeof parseKindSettings> } {
        const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        return { external: parseKindSettings(rec?.external), internal: parseKindSettings(rec?.internal) };
      }

      const kind = clampKind((args as any)?.kind);

      const setup = await prisma.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
        select: { id: true, dataJson: true, updatedAt: true },
      });

      const parsed = parseStored(setup?.dataJson);
      const kindSettings = kind === "INTERNAL" ? parsed.internal : parsed.external;

      const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
      let lastGeneratedAt: Date | null = null;
      if (site?.id) {
        const last = await prisma.clientNewsletter.findFirst({
          where: { siteId: site.id, kind },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        lastGeneratedAt = last?.createdAt ?? null;
      }

      const nextDueAt = lastGeneratedAt
        ? new Date(lastGeneratedAt.getTime() + kindSettings.frequencyDays * 24 * 60 * 60 * 1000)
        : new Date();

      return {
        status: 200,
        json: {
          ok: true,
          kind,
          settings: {
            ...kindSettings,
            lastGeneratedAt: lastGeneratedAt ? lastGeneratedAt.toISOString() : null,
            nextDueAt: nextDueAt.toISOString(),
          },
        },
      };
    }

    case "newsletter.automation.settings.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      type NewsletterKind = "EXTERNAL" | "INTERNAL";
      type StoredKindSettings = {
        enabled?: boolean;
        frequencyDays?: number;
        cursor?: number;
        requireApproval?: boolean;
        channels?: { email?: boolean; sms?: boolean };
        topics?: string[];
        promptAnswers?: Record<string, string>;
        deliveryEmailHint?: string;
        deliverySmsHint?: string;
        includeImages?: boolean;
        royaltyFreeImages?: boolean;
        includeImagesWhereNeeded?: boolean;
        fontKey?: string;
        audience?: {
          tagIds?: string[];
          contactIds?: string[];
          emails?: string[];
          userIds?: string[];
          sendAllUsers?: boolean;
        };
      };

      type StoredSettings = { external: StoredKindSettings; internal: StoredKindSettings };

      function clampKind(raw: unknown): NewsletterKind {
        const s = typeof raw === "string" ? raw : "external";
        return s.toLowerCase().trim() === "internal" ? "INTERNAL" : "EXTERNAL";
      }

      function normalizeStrings(items: unknown, max: number) {
        if (!Array.isArray(items)) return [];
        const out: string[] = [];
        const seen = new Set<string>();
        for (const item of items) {
          if (typeof item !== "string") continue;
          const t = item.trim();
          if (!t) continue;
          const key = t.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(t);
          if (out.length >= max) break;
        }
        return out;
      }

      function parseKindSettings(value: unknown) {
        const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        const enabled = Boolean(rec?.enabled);
        const frequencyDays =
          typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
            ? Math.min(365, Math.max(1, Math.floor(rec.frequencyDays)))
            : 7;
        const cursor = typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0;
        const requireApproval = Boolean(rec?.requireApproval);

        const channelsRec = rec?.channels && typeof rec.channels === "object" ? (rec.channels as Record<string, unknown>) : null;
        const channels = {
          email: channelsRec ? Boolean(channelsRec.email ?? true) : true,
          sms: channelsRec ? Boolean(channelsRec.sms ?? true) : true,
        };

        const topics = normalizeStrings(rec?.topics, 50);

        const promptAnswersRaw = rec?.promptAnswers && typeof rec.promptAnswers === "object" ? (rec.promptAnswers as Record<string, unknown>) : null;
        const promptAnswers: Record<string, string> = {};
        if (promptAnswersRaw) {
          for (const [k, v] of Object.entries(promptAnswersRaw)) {
            if (typeof v !== "string") continue;
            const vv = v.trim();
            if (!vv) continue;
            promptAnswers[String(k).slice(0, 60)] = vv.slice(0, 2000);
          }
        }

        const audienceRaw = rec?.audience && typeof rec.audience === "object" ? (rec.audience as Record<string, unknown>) : null;
        const audience = {
          tagIds: normalizeStrings(audienceRaw?.tagIds, 200),
          contactIds: normalizeStrings(audienceRaw?.contactIds, 200),
          emails: normalizeStrings(audienceRaw?.emails, 200),
          userIds: normalizeStrings(audienceRaw?.userIds, 200),
          sendAllUsers: Boolean(audienceRaw?.sendAllUsers),
        };

        const deliveryEmailHint = typeof rec?.deliveryEmailHint === "string" ? rec.deliveryEmailHint.trim().slice(0, 1500) : "";
        const deliverySmsHint = typeof rec?.deliverySmsHint === "string" ? rec.deliverySmsHint.trim().slice(0, 800) : "";
        const includeImages = Boolean(rec?.includeImages);
        const royaltyFreeImages = typeof rec?.royaltyFreeImages === "boolean" ? rec.royaltyFreeImages : true;
        const includeImagesWhereNeeded = Boolean(rec?.includeImagesWhereNeeded);
        const fontKey = normalizeNewsletterFontKey(rec?.fontKey);

        return {
          enabled,
          frequencyDays,
          cursor,
          requireApproval,
          channels,
          topics,
          promptAnswers,
          audience,
          fontKey,
          royaltyFreeImages,
          ...(deliveryEmailHint ? { deliveryEmailHint } : {}),
          ...(deliverySmsHint ? { deliverySmsHint } : {}),
          ...(includeImages ? { includeImages } : {}),
          ...(includeImagesWhereNeeded ? { includeImagesWhereNeeded } : {}),
        } as any;
      }

      function parseStored(value: unknown): { external: ReturnType<typeof parseKindSettings>; internal: ReturnType<typeof parseKindSettings> } {
        const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        return { external: parseKindSettings(rec?.external), internal: parseKindSettings(rec?.internal) };
      }

      const kind = clampKind((args as any)?.kind);

      const existing = await prisma.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
        select: { dataJson: true },
      });

      const prev = parseStored(existing?.dataJson);
      const prevKind = kind === "INTERNAL" ? prev.internal : prev.external;
      const nextFontKey = normalizeNewsletterFontKey((args as any).fontKey ?? (prevKind as any).fontKey ?? "brand");

      const nextKind: StoredKindSettings = {
        enabled: Boolean((args as any).enabled),
        frequencyDays: Number((args as any).frequencyDays),
        cursor: (prevKind as any).cursor,
        requireApproval: Boolean((args as any).requireApproval),
        fontKey: nextFontKey,
        channels: {
          email: (args as any).channels ? Boolean((args as any).channels.email ?? true) : (prevKind as any).channels.email,
          sms: (args as any).channels ? Boolean((args as any).channels.sms ?? true) : (prevKind as any).channels.sms,
        },
        topics: normalizeStrings((args as any).topics ?? (prevKind as any).topics, 50),
        promptAnswers: (args as any).promptAnswers ? (args as any).promptAnswers : (prevKind as any).promptAnswers,
        deliveryEmailHint:
          typeof (args as any).deliveryEmailHint === "string" ? String((args as any).deliveryEmailHint).trim().slice(0, 1500) : (prevKind as any).deliveryEmailHint,
        deliverySmsHint:
          typeof (args as any).deliverySmsHint === "string" ? String((args as any).deliverySmsHint).trim().slice(0, 800) : (prevKind as any).deliverySmsHint,
        includeImages:
          typeof (args as any).includeImages === "boolean" ? Boolean((args as any).includeImages) : Boolean((prevKind as any).includeImages),
        royaltyFreeImages:
          typeof (args as any).royaltyFreeImages === "boolean"
            ? Boolean((args as any).royaltyFreeImages)
            : typeof (prevKind as any).royaltyFreeImages === "boolean"
              ? Boolean((prevKind as any).royaltyFreeImages)
              : true,
        includeImagesWhereNeeded:
          typeof (args as any).includeImagesWhereNeeded === "boolean"
            ? Boolean((args as any).includeImagesWhereNeeded)
            : Boolean((prevKind as any).includeImagesWhereNeeded),
        audience: {
          tagIds: normalizeStrings((args as any).audience?.tagIds ?? (prevKind as any).audience.tagIds, 200),
          contactIds: normalizeStrings((args as any).audience?.contactIds ?? (prevKind as any).audience.contactIds, 200),
          emails: normalizeStrings((args as any).audience?.emails ?? (prevKind as any).audience.emails, 200),
          userIds: normalizeStrings((args as any).audience?.userIds ?? (prevKind as any).audience.userIds, 200),
          sendAllUsers: Boolean((args as any).audience?.sendAllUsers ?? (prevKind as any).audience.sendAllUsers),
        },
      };

      const next: StoredSettings = {
        external: kind === "EXTERNAL" ? nextKind : prev.external,
        internal: kind === "INTERNAL" ? nextKind : prev.internal,
      };

      const row = await prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
        create: { ownerId, serviceSlug: "newsletter", status: "IN_PROGRESS", dataJson: next },
        update: { dataJson: next },
        select: { id: true, dataJson: true, updatedAt: true },
      });

      const normalized = parseStored(row.dataJson);
      const normalizedKind = kind === "INTERNAL" ? normalized.internal : normalized.external;

      return { status: 200, json: { ok: true, kind, settings: normalizedKind, updatedAt: row.updatedAt.toISOString() } };
    }

    case "newsletter.generate_now": {
      const kindRaw = typeof args.kind === "string" ? args.kind.trim().toLowerCase() : "external";
      const kind = kindRaw === "internal" ? ("INTERNAL" as const) : ("EXTERNAL" as const);

      const [site, profile] = await Promise.all([
        prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }),
        prisma.businessProfile.findUnique({
          where: { ownerId },
          select: { businessName: true, websiteUrl: true, industry: true, businessModel: true, primaryGoals: true, targetCustomer: true, brandVoice: true },
        }),
      ]);

      if (!site?.id) return { status: 409, json: { ok: false, error: "Newsletter site not configured yet" } };

      const needCredits = PORTAL_CREDIT_COSTS.newsletterGenerateDraft;
      const consumed = await consumeCredits(ownerId, needCredits);
      if (!consumed.ok) return { status: 402, json: { ok: false, error: "INSUFFICIENT_CREDITS" } };

      const primaryGoals = Array.isArray(profile?.primaryGoals)
        ? (profile?.primaryGoals as unknown[]).filter((x) => typeof x === "string").map((x) => String(x)).slice(0, 10)
        : undefined;

      const draft = await generateClientNewsletterDraft({
        kind,
        businessName: profile?.businessName,
        websiteUrl: profile?.websiteUrl,
        industry: profile?.industry,
        businessModel: profile?.businessModel,
        primaryGoals,
        targetCustomer: profile?.targetCustomer,
        brandVoice: profile?.brandVoice,
        promptAnswers: {},
      } as any);

      const slug = await uniqueNewsletterSlug(site.id, kind, draft.title);
      const newsletter = await prisma.clientNewsletter.create({
        data: { siteId: site.id, kind, status: "DRAFT", slug, title: draft.title, excerpt: draft.excerpt, content: draft.content, smsText: draft.smsText ?? undefined },
        select: { id: true },
      });

      return { status: 200, json: { ok: true, newsletterId: newsletter.id, creditsRemaining: consumed.state.balance } };
    }

    case "automations.run": {
      const automationId = String(args.automationId || "").trim();
      if (!automationId) return { status: 400, json: { ok: false, error: "Invalid input" } };
      await runOwnerAutomationByIdForEvent({
        ownerId,
        automationId,
        triggerKind: "manual",
        contact: args.contact,
      }).catch(() => null);
      return { status: 200, json: { ok: true } };
    }

    case "automations.create": {
      const name = String(args.name || "").trim().slice(0, 80);
      if (!name) return { status: 400, json: { ok: false, error: "Invalid name" } };

      const needCredits = PORTAL_CREDIT_COSTS.automationCreate;
      const charged = await consumeCredits(ownerId, needCredits);
      if (!charged.ok) {
        return { status: 402, json: { ok: false, error: "Insufficient credits", credits: charged.state.balance } };
      }

      const row = await prisma.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "automations" } },
        select: { dataJson: true },
      });

      const dataJson = (row?.dataJson ?? null) as any;
      const existing = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? (dataJson as Record<string, unknown>) : {};
      const list = Array.isArray((existing as any).automations) ? ((existing as any).automations as any[]) : [];

      const id = `a_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const createdAtIso = new Date().toISOString();
      const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, email: true, name: true } }).catch(() => null);

      const automation = {
        id,
        name,
        paused: false,
        createdAtIso,
        updatedAtIso: createdAtIso,
        createdBy: {
          userId: actorUserId,
          email: String(actor?.email || "").slice(0, 200) || undefined,
          name: String(actor?.name || "").slice(0, 200) || undefined,
        },
        nodes: [
          {
            id: "trigger",
            type: "trigger",
            label: "Manual trigger",
            x: 80,
            y: 120,
            config: { kind: "trigger", triggerKind: "manual" },
          },
        ],
        edges: [],
      };

      const nextAutomations = [automation, ...list].slice(0, 50);

      const nextData = {
        ...existing,
        version: typeof (existing as any).version === "number" ? (existing as any).version : 1,
        automations: nextAutomations,
      };

      await prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "automations" } },
        create: { ownerId, serviceSlug: "automations", status: "COMPLETE", dataJson: nextData as any },
        update: { status: "COMPLETE", dataJson: nextData as any },
        select: { id: true },
      });

      return { status: 200, json: { ok: true, automationId: id, creditsRemaining: charged.state.balance } };
    }

    case "contacts.list": {
      await ensurePortalContactsSchema().catch(() => null);
      const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.max(1, Math.min(100, Math.floor(args.limit))) : 20;

      const rows = await (prisma as any).portalContact
        .findMany({
          where: { ownerId },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: { id: true, name: true, email: true, phone: true, updatedAt: true },
        })
        .catch(() => [] as any[]);

      return {
        status: 200,
        json: {
          ok: true,
          contacts: (rows || []).map((r: any) => ({
            id: String(r.id),
            name: r.name ? String(r.name) : null,
            email: r.email ? String(r.email) : null,
            phone: r.phone ? String(r.phone) : null,
          })),
        },
      };
    }

    case "contacts.create": {
      await ensurePortalContactsSchema().catch(() => null);

      const name = sanitizeHumanName(args.name, 80);
      if (!name) return { status: 400, json: { ok: false, error: "Name is required" } };

      const email = typeof args.email === "string" && args.email.trim() ? String(args.email).trim().slice(0, 120) : null;
      const phone = typeof args.phone === "string" && args.phone.trim() ? String(args.phone).trim().slice(0, 40) : null;
      if (phone) {
        const norm = normalizePhoneKey(phone);
        if (norm.error) return { status: 400, json: { ok: false, error: norm.error } };
      }

      const tags = splitTagsFlexible(args.tags);
      const customVariablesRaw = args.customVariables && typeof args.customVariables === "object" && !Array.isArray(args.customVariables)
        ? (args.customVariables as Record<string, string>)
        : null;

      const customVariables = customVariablesRaw
        ? Object.fromEntries(Object.entries(customVariablesRaw).slice(0, 30).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 120)]))
        : null;

      await ensurePortalContactTagsReady().catch(() => null);

      const contactId = await findOrCreatePortalContact({
        ownerId,
        name,
        email,
        phone,
        customVariables,
      });

      if (!contactId) return { status: 400, json: { ok: false, error: "Could not create contact" } };

      if (tags.length) {
        for (const tagName of tags) {
          const tag = await createOwnerContactTag({ ownerId, name: tagName }).catch(() => null);
          if (!tag) continue;
          await addContactTagAssignment({ ownerId, contactId, tagId: tag.id }).catch(() => null);
        }
      }

      return { status: 200, json: { ok: true, contactId } };
    }

    case "people.users.list": {
      const memberId = String(actorUserId || "").trim() || ownerId;

      const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true, name: true } });
      const members = await listPortalAccountMembers(ownerId).catch(() => [] as any[]);
      const invites = await listPortalAccountInvites(ownerId).catch(() => [] as any[]);

      const mergedMembers = [
        ...(owner
          ? [
              {
                userId: owner.id,
                role: "OWNER",
                user: { id: owner.id, email: owner.email, name: owner.name, role: "CLIENT", active: true },
                implicit: true,
              },
            ]
          : []),
        ...members.map((m) => ({
          userId: m.userId,
          role: m.role,
          user: m.user,
          permissionsJson: m.permissionsJson,
          implicit: false,
        })),
      ].filter((m, idx, arr) => arr.findIndex((x) => x.userId === m.userId) === idx);

      const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
      return { status: 200, json: { ok: true, ownerId, memberId, myRole, members: mergedMembers, invites } };
    }

    case "people.users.invite": {
      const memberId = String(actorUserId || "").trim() || ownerId;
      const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
      if (myRole !== "OWNER" && myRole !== "ADMIN") return { status: 403, json: { ok: false, error: "Forbidden" } };

      const emailRaw = typeof args.email === "string" ? args.email : "";
      const email = emailRaw.toLowerCase().trim();
      if (!email) return { status: 400, json: { ok: false, error: "Invalid input" } };

      const role = args.role === "ADMIN" ? "ADMIN" : "MEMBER";
      const permissionsJson = normalizePortalPermissions((args as any)?.permissions, role);

      const invite = await createPortalAccountInvite({ ownerId, email, role, permissionsJson }).catch(() => null);
      if (!invite) return { status: 500, json: { ok: false, error: "Failed to create invite" } };

      const base =
        process.env.NODE_ENV === "production"
          ? "https://purelyautomation.com"
          : String(process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
      const link = `${base}/portalinvite/${invite.token}`;

      try {
        await sendEmail({
          to: email,
          subject: "You’ve been invited to Purely Automation",
          text: `You’ve been invited to access a Purely Automation client portal.\n\nAccept invite: ${link}\n\nThis invite expires on ${new Date(invite.expiresAt).toLocaleString()}.`,
        });
      } catch {
        // ignore
      }

      return { status: 200, json: { ok: true, invite, link } };
    }

    case "people.users.update": {
      const memberId = String(actorUserId || "").trim() || ownerId;
      const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
      if (myRole !== "OWNER" && myRole !== "ADMIN") return { status: 403, json: { ok: false, error: "Forbidden" } };

      const targetUserId = String((args as any)?.userId || "").trim();
      if (!targetUserId) return { status: 400, json: { ok: false, error: "Invalid user" } };
      if (targetUserId === ownerId) return { status: 400, json: { ok: false, error: "Owner permissions cannot be changed." } };

      const existing = await (prisma as any).portalAccountMember.findUnique({
        where: { ownerId_userId: { ownerId, userId: targetUserId } },
        select: { role: true, permissionsJson: true },
      });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      const roleRaw = typeof existing?.role === "string" ? String(existing.role) : null;
      const currentRole = roleRaw === "ADMIN" || roleRaw === "MEMBER" ? roleRaw : "MEMBER";

      const nextRole = (args as any)?.role === "ADMIN" ? "ADMIN" : (args as any)?.role === "MEMBER" ? "MEMBER" : currentRole;

      const nextPermissionsJson =
        nextRole === "ADMIN"
          ? null
          : normalizePortalPermissions(
              (args as any)?.permissions !== undefined ? (args as any)?.permissions : (existing?.permissionsJson as any),
              nextRole,
            );

      await (prisma as any).portalAccountMember.update({
        where: { ownerId_userId: { ownerId, userId: targetUserId } },
        data: { role: nextRole, permissionsJson: nextPermissionsJson },
        select: { id: true },
      });

      return { status: 200, json: { ok: true } };
    }

    case "people.users.delete": {
      const memberId = String(actorUserId || "").trim() || ownerId;
      const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
      if (myRole !== "OWNER" && myRole !== "ADMIN") return { status: 403, json: { ok: false, error: "Forbidden" } };

      const targetUserId = String((args as any)?.userId || "").trim();
      if (!targetUserId) return { status: 400, json: { ok: false, error: "Invalid user" } };
      if (targetUserId === ownerId) return { status: 400, json: { ok: false, error: "Owner cannot be removed." } };
      if (targetUserId === memberId) return { status: 400, json: { ok: false, error: "You can’t remove yourself." } };

      const deleted = await (prisma as any).portalAccountMember.deleteMany({ where: { ownerId, userId: targetUserId } });
      if (!deleted?.count) return { status: 404, json: { ok: false, error: "Not found" } };
      return { status: 200, json: { ok: true } };
    }

    case "people.leads.update": {
      const leadId = String((args as any)?.leadId || "").trim();
      if (!leadId) return { status: 400, json: { ok: false, error: "Invalid lead id" } };

      const hasAnyChange =
        (args as any).businessName !== undefined ||
        (args as any).email !== undefined ||
        (args as any).phone !== undefined ||
        (args as any).website !== undefined ||
        (args as any).contactId !== undefined;
      if (!hasAnyChange) return { status: 400, json: { ok: false, error: "No changes provided" } };

      const data: any = {};

      if ((args as any).businessName !== undefined) {
        const businessName = String((args as any).businessName || "").trim();
        if (!businessName) return { status: 400, json: { ok: false, error: "Invalid businessName" } };
        data.businessName = businessName;
      }

      if ((args as any).email !== undefined) {
        const raw = (args as any).email === null ? null : String((args as any).email || "").trim();
        const email = raw ? raw.toLowerCase() : null;
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: 400, json: { ok: false, error: "Invalid email" } };
        data.email = email;
      }

      if ((args as any).phone !== undefined) {
        const raw = (args as any).phone === null ? null : String((args as any).phone || "").trim();
        if (!raw) data.phone = null;
        else {
          const res = normalizePhoneStrict(raw);
          if (!res.ok) return { status: 400, json: { ok: false, error: "Invalid phone" } };
          data.phone = res.e164;
        }
      }

      if ((args as any).website !== undefined) {
        const raw = (args as any).website === null ? null : String((args as any).website || "").trim();
        if (!raw) data.website = null;
        else {
          try {
            const u = new URL(raw);
            if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Invalid protocol");
          } catch {
            return { status: 400, json: { ok: false, error: "Invalid website URL" } };
          }
          data.website = raw;
        }
      }

      if ((args as any).contactId !== undefined) {
        const raw = (args as any).contactId === null ? null : String((args as any).contactId || "").trim();
        data.contactId = raw ? raw : null;
      }

      try {
        const updated = await prisma.portalLead.updateMany({ where: { id: leadId, ownerId }, data });
        if (!updated.count) return { status: 404, json: { ok: false, error: "Not found" } };
        return { status: 200, json: { ok: true } };
      } catch {
        return { status: 500, json: { ok: false, error: "Update failed" } };
      }
    }

    case "people.contacts.custom_variable_keys.get": {
      function isMissingRelationError(e: unknown) {
        const msg = e instanceof Error ? e.message : String(e ?? "");
        return /does not exist|relation .* does not exist|no such table/i.test(msg);
      }

      try {
        const rows = await prisma.$queryRaw<Array<{ key: string | null }>>`
          SELECT DISTINCT jsonb_object_keys("customVariables") AS key
          FROM "PortalContact"
          WHERE "ownerId" = ${ownerId}
            AND "customVariables" IS NOT NULL
            AND jsonb_typeof("customVariables") = 'object'
          LIMIT 250;
        `;

        const out: string[] = [];
        const seen = new Set<string>();
        for (const r of rows || []) {
          const key = normalizePortalContactCustomVarKey(String(r?.key ?? ""));
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push(key);
          if (out.length >= 50) break;
        }

        out.sort((a, b) => a.localeCompare(b));
        return { status: 200, json: { ok: true, keys: out } };
      } catch (e) {
        if (isMissingRelationError(e)) return { status: 200, json: { ok: true, keys: [] } };
        return { status: 200, json: { ok: true, keys: [] } };
      }
    }

    case "people.contacts.duplicates.get": {
      const limitGroups = typeof (args as any)?.limitGroups === "number" ? (args as any).limitGroups : 100;
      const summaryOnly = Boolean((args as any)?.summaryOnly);
      const n = Math.max(1, Math.min(200, Number(limitGroups) || 100));

      const res = await listDuplicatePortalContactsByPhoneKey({ ownerId, limitGroups: n });
      if (!res.ok) return { status: 500, json: { ok: false, error: res.error } };

      if (summaryOnly) {
        const groups = res.groups;
        const groupsNeedingChoice = groups.filter((g) => g.needsEmailChoice).length;
        const totalDuplicateContacts = groups.reduce((sum, g) => sum + g.contacts.length, 0);
        return { status: 200, json: { ok: true, groupsCount: groups.length, groupsNeedingChoice, totalDuplicateContacts } };
      }

      return { status: 200, json: { ok: true, groups: res.groups } };
    }

    case "people.contacts.merge": {
      const primaryContactId = String((args as any)?.primaryContactId || "").trim();
      const mergeContactIds = Array.isArray((args as any)?.mergeContactIds) ? (args as any).mergeContactIds : [];
      const primaryEmail = typeof (args as any)?.primaryEmail === "string" ? String((args as any).primaryEmail).trim() : null;

      if (!primaryContactId || !mergeContactIds.length) return { status: 400, json: { ok: false, error: "Invalid input" } };

      const res = await mergePortalContacts({
        ownerId,
        primaryContactId,
        mergeContactIds: mergeContactIds.map((x: any) => String(x)).filter(Boolean).slice(0, 50),
        primaryEmail: primaryEmail || null,
      });

      if (!res.ok) {
        const status = res.code === "EMAIL_CONFLICT" ? 409 : res.code === "PHONE_MISMATCH" ? 400 : 400;
        return { status, json: { ok: false, error: res.error, code: res.code, details: res.details } };
      }

      return { status: 200, json: res };
    }

    case "people.contacts.custom_variables.patch": {
      const contactId = String((args as any)?.contactId || "").trim();
      if (!contactId) return { status: 400, json: { ok: false, error: "Invalid contact id" } };

      const key = normalizePortalContactCustomVarKey(String((args as any)?.key || ""));
      if (!key) return { status: 400, json: { ok: false, error: "Invalid key" } };

      const value = String((args as any)?.value ?? "").trim();

      const existing = await prisma.portalContact
        .findFirst({ where: { ownerId, id: contactId }, select: { id: true, customVariables: true } })
        .catch(() => null);

      if (!existing?.id) return { status: 404, json: { ok: false, error: "Not found" } };

      const base: Record<string, string> =
        existing.customVariables && typeof existing.customVariables === "object" && !Array.isArray(existing.customVariables)
          ? ({ ...(existing.customVariables as Record<string, string>) } as Record<string, string>)
          : {};

      if (!value) delete base[key];
      else base[key] = value;

      const customVariablesUpdate: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = Object.keys(base).length
        ? (base as Prisma.InputJsonValue)
        : Prisma.DbNull;

      await prisma.portalContact.updateMany({ where: { ownerId, id: contactId }, data: { customVariables: customVariablesUpdate } });
      return { status: 200, json: { ok: true, key, value } };
    }

    case "inbox.send_sms": {
      const to = String(args.to || "").trim();
      const body = String(args.body || "").trim();
      if (!to || !body) return { status: 400, json: { ok: false, error: "Missing to/body" } };

      const sent = await sendPortalInboxMessageNow({
        ownerId,
        channel: "sms",
        to,
        body,
        threadId: typeof args.threadId === "string" ? String(args.threadId) : undefined,
        baseUrl: (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, ""),
      });

      if (!sent.ok) return { status: 400, json: { ok: false, error: sent.error } };
      return { status: 200, json: { ok: true, threadId: sent.threadId } };
    }

    case "inbox.send_email": {
      const to = String(args.to || "").trim();
      const subject = String(args.subject || "").trim();
      const body = String(args.body || "").trim();
      if (!to || !subject || !body) return { status: 400, json: { ok: false, error: "Missing to/subject/body" } };

      const sent = await sendPortalInboxMessageNow({
        ownerId,
        channel: "email",
        to,
        subject,
        body,
        threadId: typeof args.threadId === "string" ? String(args.threadId) : undefined,
      });

      if (!sent.ok) return { status: 400, json: { ok: false, error: sent.error } };
      return { status: 200, json: { ok: true, threadId: sent.threadId } };
    }

    case "reviews.send_request_for_booking": {
      const bookingId = String(args.bookingId || "").trim();
      if (!bookingId) return { status: 400, json: { ok: false, error: "Missing bookingId" } };

      const result = await sendReviewRequestForBooking({ ownerId, bookingId });
      if (!result.ok) {
        const status = result.error === "Insufficient credits" ? 402 : 400;
        return { status, json: { ok: false, error: result.error } };
      }
      return { status: 200, json: { ok: true } };
    }

    case "reviews.send_request_for_contact": {
      const contactId = String(args.contactId || "").trim();
      if (!contactId) return { status: 400, json: { ok: false, error: "Missing contactId" } };

      const result = await sendReviewRequestForContact({ ownerId, contactId });
      if (!result.ok) return { status: 400, json: { ok: false, error: result.error } };
      return { status: 200, json: { ok: true } };
    }

    case "reviews.reply": {
      const reviewId = String(args.reviewId || "").trim();
      const replyRaw = typeof args.reply === "string" ? args.reply : "";
      const reply = String(replyRaw).trim().slice(0, 2000);
      if (!reviewId) return { status: 400, json: { ok: false, error: "Missing reviewId" } };

      const [hasReply, hasReplyAt] = await Promise.all([
        hasPublicColumn("PortalReview", "businessReply"),
        hasPublicColumn("PortalReview", "businessReplyAt"),
      ]);
      if (!hasReply) return { status: 409, json: { ok: false, error: "Replies are not enabled in this environment yet." } };

      const updated = await (prisma as any).portalReview.updateMany({
        where: { id: reviewId, ownerId },
        data: {
          businessReply: reply ? reply : null,
          ...(hasReplyAt ? { businessReplyAt: reply ? new Date() : null } : {}),
        },
      });

      if (!updated?.count) return { status: 404, json: { ok: false, error: "Not found" } };
      return { status: 200, json: { ok: true } };
    }

    case "reviews.settings.get": {
      const data = await getReviewRequestsServiceData(ownerId);
      return { status: 200, json: { ok: true, settings: data.settings } };
    }

    case "reviews.settings.update": {
      const settings = parseReviewRequestsSettings((args as any)?.settings);
      const saved = await setReviewRequestsSettings(ownerId, settings);
      return { status: 200, json: { ok: true, settings: saved } };
    }

    case "reviews.site.get": {
      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      async function ensurePublicSlug(desiredName: string) {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const base = slugify(profile?.businessName ?? desiredName) || "site";
        const desired = base.length >= 3 ? base : "site";

        let slug = desired;
        if (canUseSlugColumn) {
          const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug } }).catch(() => null)) as any;
          if (collision && collision.ownerId !== ownerId) slug = `${desired}-${ownerId.slice(0, 6)}`;
        }
        return slug;
      }

      const select: any = {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      };

      let site = (await prisma.clientBlogSite
        .findUnique({ where: { ownerId }, select } as any)
        .catch(() => null)) as any;

      const currentSlug = (site as any)?.slug as string | null | undefined;
      if (site && canUseSlugColumn && !currentSlug) {
        const slug = await ensurePublicSlug(String(site.name || "Site"));
        site = (await (prisma.clientBlogSite as any).update({ where: { ownerId }, data: { slug }, select } as any)) as any;
      }

      let fallbackSlug: string | null = null;
      if (site && !canUseSlugColumn) {
        fallbackSlug = await getStoredBlogSiteSlug(ownerId);
        if (!fallbackSlug) fallbackSlug = await ensureStoredBlogSiteSlug(ownerId, String(site.name || "Site"));
      }

      return {
        status: 200,
        json: {
          ok: true,
          site: site
            ? {
                ...(site as any),
                slug: canUseSlugColumn ? ((site as any).slug ?? null) : fallbackSlug,
              }
            : null,
        },
      };
    }

    case "reviews.site.update": {
      function normalizeDomain(raw: string | null | undefined) {
        const v = String(raw || "").trim().toLowerCase();
        if (!v) return null;
        const withoutProtocol = v.replace(/^https?:\/\//, "");
        const withoutPath = withoutProtocol.split("/")[0] ?? "";
        const d = withoutPath.replace(/:\d+$/, "").replace(/\.$/, "");
        return d.length ? d : null;
      }

      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      async function ensurePublicSlug(desiredName: string) {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const base = slugify(profile?.businessName ?? desiredName) || "site";
        const desired = base.length >= 3 ? base : "site";

        let slug = desired;
        if (canUseSlugColumn) {
          const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug } }).catch(() => null)) as any;
          if (collision && collision.ownerId !== ownerId) slug = `${desired}-${ownerId.slice(0, 6)}`;
        }
        return slug;
      }

      const select: any = {
        id: true,
        name: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
        ...(canUseSlugColumn ? { slug: true } : {}),
      };

      const existing = (await prisma.clientBlogSite
        .findUnique({ where: { ownerId }, select } as any)
        .catch(() => null)) as any;

      const primaryDomain = normalizeDomain((args as any)?.primaryDomain);

      if (existing) {
        const currentPrimaryDomain = normalizeDomain((existing as any)?.primaryDomain);
        const domainChanged = primaryDomain !== currentPrimaryDomain;
        const tokenMissing = Boolean(primaryDomain) && !String((existing as any)?.verificationToken || "").trim();
        const nextVerificationToken =
          domainChanged && primaryDomain
            ? crypto.randomBytes(18).toString("hex")
            : tokenMissing
              ? crypto.randomBytes(18).toString("hex")
              : (existing as any)?.verificationToken;

        const updated = (await (prisma.clientBlogSite as any).update({
          where: { ownerId },
          data: {
            primaryDomain,
            ...(domainChanged
              ? { verifiedAt: null, verificationToken: nextVerificationToken }
              : tokenMissing
                ? { verificationToken: nextVerificationToken }
                : {}),
            ...(primaryDomain ? {} : domainChanged ? { verifiedAt: null } : {}),
          },
          select,
        })) as any;

        return {
          status: 200,
          json: {
            ok: true,
            site: {
              ...(updated as any),
              slug: canUseSlugColumn ? ((updated as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
            },
          },
        };
      }

      const token = crypto.randomBytes(18).toString("hex");

      const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
      const name = String(profile?.businessName || "Hosted site").trim() || "Hosted site";

      const slug = await ensurePublicSlug(name);

      if (!canUseSlugColumn) {
        try {
          await ensureStoredBlogSiteSlug(ownerId, name);
        } catch {
          // ignore
        }
      }

      if (canUseSlugColumn && slug) {
        const collision = (await (prisma.clientBlogSite as any)
          .findUnique({ where: { slug }, select: { ownerId: true } })
          .catch(() => null)) as any;
        if (collision && collision.ownerId !== ownerId) {
          return { status: 409, json: { ok: false, error: "That link is already taken." } };
        }
      }

      const charged = await consumeCreditsOnce(ownerId, PORTAL_CREDIT_COSTS.reviewPageEnableOnce, "reviews_page_enable_v1");
      if (!charged.ok) return { status: 402, json: { ok: false, error: "Insufficient credits" } };

      const created = (await (prisma.clientBlogSite as any).create({
        data: {
          ownerId,
          name,
          primaryDomain,
          verificationToken: token,
          ...(canUseSlugColumn ? { slug } : {}),
        },
        select,
      })) as any;

      if (!canUseSlugColumn) {
        const stored = await getStoredBlogSiteSlug(ownerId);
        if (!stored) {
          try {
            await setStoredBlogSiteSlug(ownerId, slugify(name) || "site");
          } catch {
            // ignore
          }
        }
      }

      return {
        status: 200,
        json: {
          ok: true,
          site: {
            ...(created as any),
            slug: canUseSlugColumn ? ((created as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
          },
        },
      };
    }

    case "reviews.inbox.list": {
      const includeArchived = Boolean((args as any)?.includeArchived);

      const [hasBusinessReply, hasBusinessReplyAt] = await Promise.all([
        hasPublicColumn("PortalReview", "businessReply"),
        hasPublicColumn("PortalReview", "businessReplyAt"),
      ]);

      const select: any = {
        id: true,
        rating: true,
        name: true,
        body: true,
        email: true,
        phone: true,
        photoUrls: true,
        archivedAt: true,
        createdAt: true,
      };
      if (hasBusinessReply) select.businessReply = true;
      if (hasBusinessReplyAt) select.businessReplyAt = true;

      const reviews = await (prisma as any).portalReview.findMany({
        where: {
          ownerId,
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select,
      });

      return { status: 200, json: { ok: true, reviews } };
    }

    case "reviews.archive": {
      const reviewId = String((args as any)?.reviewId || "").trim();
      const archived = Boolean((args as any)?.archived);
      if (!reviewId) return { status: 400, json: { ok: false, error: "Missing reviewId" } };

      const review = await prisma.portalReview.findUnique({ where: { id: reviewId }, select: { id: true, ownerId: true } });
      if (!review || review.ownerId !== ownerId) return { status: 404, json: { ok: false, error: "Not found" } };

      await prisma.portalReview.update({ where: { id: review.id }, data: { archivedAt: archived ? new Date() : null }, select: { id: true } });
      return { status: 200, json: { ok: true } };
    }

    case "reviews.bookings.list": {
      const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true } });
      if (!site) return { status: 200, json: { ok: true, upcoming: [], recent: [] } };

      const now = new Date();
      const hasCalendarId = await hasPublicColumn("PortalBooking", "calendarId").catch(() => false);

      const select: Record<string, boolean> = {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        canceledAt: true,
      };
      if (hasCalendarId) (select as any).calendarId = true;

      const [upcoming, recent] = await Promise.all([
        prisma.portalBooking.findMany({
          where: { siteId: site.id, status: "SCHEDULED", startAt: { gte: now } },
          orderBy: { startAt: "asc" },
          take: 25,
          select: select as any,
        }),
        prisma.portalBooking.findMany({
          where: { siteId: site.id, OR: [{ status: "CANCELED" }, { startAt: { lt: now } }] },
          orderBy: { startAt: "desc" },
          take: 25,
          select: select as any,
        }),
      ]);

      return { status: 200, json: { ok: true, upcoming: upcoming || [], recent: recent || [] } };
    }

    case "reviews.contacts.search": {
      const q = typeof (args as any)?.q === "string" ? String((args as any).q).trim() : "";
      const takeRaw = typeof (args as any)?.take === "number" ? (args as any).take : 20;
      const take = Math.max(1, Math.min(50, Number(takeRaw) || 20));

      try {
        const where: any = { ownerId };
        if (q) {
          where.OR = [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ];
        }

        const rows = await (prisma as any).portalContact.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take,
          select: { id: true, name: true, email: true, phone: true, updatedAt: true },
        });

        const contacts = (rows || []).map((c: any) => ({
          id: String(c.id),
          name: String(c.name || "").trim(),
          email: c.email ? String(c.email) : null,
          phone: c.phone ? String(c.phone) : null,
          updatedAtIso: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
        }));

        return { status: 200, json: { ok: true, contacts } };
      } catch {
        return { status: 200, json: { ok: true, contacts: [] } };
      }
    }

    case "reviews.events.list": {
      const limitRaw = typeof (args as any)?.limit === "number" ? (args as any).limit : 50;
      const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
      const events = await listReviewRequestEvents(ownerId, limit);
      return { status: 200, json: { ok: true, events } };
    }

    case "reviews.handle.get": {
      const canUse = await hasPublicColumn("ClientBlogSite", "slug");
      const site = (await prisma.clientBlogSite.findUnique({
        where: { ownerId },
        select: { id: true, name: true, ...(canUse ? { slug: true } : {}) },
      } as any)) as any;

      if (site) {
        if (canUse) {
          const handle = (site.slug as string | null | undefined) || (site.id as string);
          return { status: 200, json: { ok: true, handle } };
        }

        let fallback = await getStoredBlogSiteSlug(ownerId);
        if (!fallback) fallback = await ensureStoredBlogSiteSlug(ownerId, String(site.name || ""));
        return { status: 200, json: { ok: true, handle: fallback || String(site.id) } };
      }

      const bookingSite = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { slug: true } });
      if ((bookingSite as any)?.slug) return { status: 200, json: { ok: true, handle: String((bookingSite as any).slug) } };
      return { status: 200, json: { ok: true, handle: null } };
    }

    case "reviews.questions.list": {
      const hasTable = await hasPublicColumn("PortalReviewQuestion", "id");
      if (!hasTable) return { status: 200, json: { ok: true, questions: [] } };

      const rows = await (prisma as any).portalReviewQuestion.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, name: true, question: true, answer: true, answeredAt: true, createdAt: true },
      });

      const questions = (Array.isArray(rows) ? rows : []).map((q: any) => ({
        id: String(q.id),
        name: String(q.name || ""),
        question: String(q.question || ""),
        answer: q.answer ? String(q.answer) : null,
        answeredAt: q.answeredAt ? new Date(q.answeredAt).toISOString() : null,
        createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : new Date().toISOString(),
      }));

      return { status: 200, json: { ok: true, questions } };
    }

    case "reviews.questions.answer": {
      const id = String((args as any)?.id || "").trim();
      const answerRaw = typeof (args as any)?.answer === "string" ? (args as any).answer : "";
      const answer = String(answerRaw).trim().slice(0, 2000);
      if (!id) return { status: 400, json: { ok: false, error: "Missing id" } };

      const hasTable = await hasPublicColumn("PortalReviewQuestion", "id");
      if (!hasTable) return { status: 409, json: { ok: false, error: "Q&A is not enabled in this environment yet." } };

      const updated = await (prisma as any).portalReviewQuestion.updateMany({
        where: { id, ownerId },
        data: { answer: answer ? answer : null, answeredAt: answer ? new Date() : null },
      });

      if (!updated?.count) return { status: 404, json: { ok: false, error: "Not found" } };
      return { status: 200, json: { ok: true } };
    }

    case "booking.calendar.create": {
      const title = String(args.title || "").trim().slice(0, 80);
      if (!title) return { status: 400, json: { ok: false, error: "Invalid title" } };
      const id = normalizeSlug(args.id) || normalizeSlug(title) || `cal-${Date.now()}`;

      const prev = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] as any[] }));
      const prevCalendars = Array.isArray((prev as any)?.calendars) ? ((prev as any).calendars as any[]) : [];
      const exists = prevCalendars.some((c) => String(c?.id || "") === id);
      if (exists) return { status: 409, json: { ok: false, error: "Calendar id already exists" } };

      const needCredits = PORTAL_CREDIT_COSTS.bookingCalendarCreate;
      const charged = await consumeCredits(ownerId, needCredits);
      if (!charged.ok) return { status: 402, json: { ok: false, error: "Insufficient credits", credits: charged.state.balance } };

      const nextCalendars = [...prevCalendars, {
        id,
        enabled: true,
        title,
        description: typeof args.description === "string" ? args.description.trim().slice(0, 400) : undefined,
        durationMinutes: typeof args.durationMinutes === "number" && Number.isFinite(args.durationMinutes) ? Math.min(180, Math.max(10, Math.floor(args.durationMinutes))) : undefined,
        meetingLocation: typeof args.meetingLocation === "string" ? args.meetingLocation.trim().slice(0, 120) : undefined,
        meetingDetails: typeof args.meetingDetails === "string" ? args.meetingDetails.trim().slice(0, 600) : undefined,
        notificationEmails: Array.isArray(args.notificationEmails) ? args.notificationEmails.filter((x: any) => typeof x === "string").map((x: string) => x.trim()).filter(Boolean).slice(0, 20) : undefined,
      }];

      const saved = await setBookingCalendarsConfig(ownerId, { version: 1, calendars: nextCalendars });
      return { status: 200, json: { ok: true, config: saved, calendarId: id } };
    }

    case "booking.calendars.get": {
      const config = await getBookingCalendarsConfig(ownerId);
      return { status: 200, json: { ok: true, config } };
    }

    case "booking.calendars.update": {
      const prev = await getBookingCalendarsConfig(ownerId).catch(() => null);
      const prevIds = new Set(
        Array.isArray((prev as any)?.calendars)
          ? ((prev as any).calendars as any[])
              .map((c) => (typeof c?.id === "string" ? c.id.trim() : ""))
              .filter(Boolean)
          : [],
      );

      const nextIds = (args.calendars as any[]).map((c) => String(c.id).trim());
      const newCount = nextIds.filter((id) => id && !prevIds.has(id)).length;
      const needCredits = newCount * PORTAL_CREDIT_COSTS.bookingCalendarCreate;

      if (needCredits > 0) {
        const charged = await consumeCredits(ownerId, needCredits);
        if (!charged.ok) {
          return { status: 402, json: { ok: false, error: "Insufficient credits" } };
        }
      }

      const saved = await setBookingCalendarsConfig(ownerId, {
        version: 1,
        calendars: (args.calendars as any[]).map((c) => ({ ...c, enabled: c.enabled ?? true })),
      });
      return { status: 200, json: { ok: true, config: saved } };
    }

    case "booking.settings.get": {
      const flags = await getBookingSiteColumnFlags();

      const [siteRaw, serviceSetup] = await Promise.all([
        ensureBookingSite(ownerId, flags),
        prisma.portalServiceSetup.findUnique({
          where: { ownerId_serviceSlug: { ownerId, serviceSlug: "booking" } },
          select: { dataJson: true },
        }),
      ]);
      const site = siteRaw as any;
      const setupData = (serviceSetup?.dataJson as any) || {};

      return {
        status: 200,
        json: {
          ok: true,
          site: {
            id: site.id,
            slug: site.slug,
            enabled: site.enabled,
            title: site.title,
            description: site.description,
            durationMinutes: site.durationMinutes,
            timeZone: site.timeZone,
            photoUrl: flags.photoUrl ? (site.photoUrl ?? null) : null,
            meetingLocation: flags.meetingLocation ? (site.meetingLocation ?? null) : null,
            meetingDetails: flags.meetingDetails ? (site.meetingDetails ?? null) : null,
            appointmentPurpose: flags.appointmentPurpose ? (site.appointmentPurpose ?? null) : null,
            toneDirection: flags.toneDirection ? (site.toneDirection ?? null) : null,
            notificationEmails: flags.notificationEmails ? ((site.notificationEmails as unknown) ?? null) : null,
            meetingPlatform: typeof setupData.meetingPlatform === "string" ? setupData.meetingPlatform : "OTHER",
            updatedAt: site.updatedAt,
          },
        },
      };
    }

    case "booking.settings.update": {
      const flags = await getBookingSiteColumnFlags();
      const current = (await ensureBookingSite(ownerId, flags)) as any;

      let nextSlug = args.slug ? slugify(args.slug) : undefined;
      if (nextSlug && nextSlug.length < 3) nextSlug = undefined;

      if (nextSlug && nextSlug !== current.slug) {
        for (let i = 0; i < 8; i += 1) {
          const collision = await prisma.portalBookingSite.findUnique({ where: { slug: nextSlug! } });
          if (!collision) break;
          nextSlug = withRandomSuffix(nextSlug!, 80);
        }
      }

      const data: Record<string, unknown> = {
        enabled: args.enabled ?? undefined,
        title: args.title ?? undefined,
        description: args.description === null ? null : args.description ?? undefined,
        durationMinutes: args.durationMinutes ?? undefined,
        timeZone: args.timeZone ?? undefined,
        slug: nextSlug ?? undefined,
      };

      if (flags.photoUrl) {
        data.photoUrl = args.photoUrl === null ? null : args.photoUrl ?? undefined;
      }
      if (flags.meetingLocation) {
        data.meetingLocation = args.meetingLocation === null ? null : args.meetingLocation ?? undefined;
      }
      if (flags.meetingDetails) {
        data.meetingDetails = args.meetingDetails === null ? null : args.meetingDetails ?? undefined;
      }
      if (flags.appointmentPurpose) {
        data.appointmentPurpose = args.appointmentPurpose === null ? null : args.appointmentPurpose ?? undefined;
      }
      if (flags.toneDirection) {
        data.toneDirection = args.toneDirection === null ? null : args.toneDirection ?? undefined;
      }
      if (flags.notificationEmails) {
        data.notificationEmails =
          args.notificationEmails === null
            ? Prisma.DbNull
            : args.notificationEmails
              ? ((args.notificationEmails as any[]).length ? args.notificationEmails : Prisma.DbNull)
              : undefined;
      }

      if (args.meetingPlatform) {
        const existing = await prisma.portalServiceSetup.findUnique({
          where: { ownerId_serviceSlug: { ownerId, serviceSlug: "booking" } },
          select: { dataJson: true },
        });
        const base = (existing?.dataJson as any) || {};
        await prisma.portalServiceSetup.upsert({
          where: { ownerId_serviceSlug: { ownerId, serviceSlug: "booking" } },
          create: {
            ownerId,
            serviceSlug: "booking",
            dataJson: { ...base, meetingPlatform: args.meetingPlatform },
            status: "COMPLETE",
          },
          update: { dataJson: { ...base, meetingPlatform: args.meetingPlatform } },
        });
      }

      const updatedRaw = await prisma.portalBookingSite.update({
        where: { ownerId },
        data: data as any,
        select: bookingSiteSelect(flags),
      });
      const updated = updatedRaw as any;

      const serviceSetup = await prisma.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "booking" } },
        select: { dataJson: true },
      });
      const setupData = (serviceSetup?.dataJson as any) || {};

      return {
        status: 200,
        json: {
          ok: true,
          site: {
            id: updated.id,
            slug: updated.slug,
            enabled: updated.enabled,
            title: updated.title,
            description: updated.description,
            durationMinutes: updated.durationMinutes,
            timeZone: updated.timeZone,
            photoUrl: flags.photoUrl ? (updated.photoUrl ?? null) : null,
            meetingLocation: flags.meetingLocation ? (updated.meetingLocation ?? null) : null,
            meetingDetails: flags.meetingDetails ? (updated.meetingDetails ?? null) : null,
            appointmentPurpose: flags.appointmentPurpose ? (updated.appointmentPurpose ?? null) : null,
            toneDirection: flags.toneDirection ? (updated.toneDirection ?? null) : null,
            notificationEmails: flags.notificationEmails ? ((updated.notificationEmails as unknown) ?? null) : null,
            meetingPlatform: typeof setupData.meetingPlatform === "string" ? setupData.meetingPlatform : "OTHER",
            updatedAt: updated.updatedAt,
          },
        },
      };
    }

    case "booking.form.get": {
      const config = await getBookingFormConfig(ownerId);
      return { status: 200, json: { ok: true, config } };
    }

    case "booking.form.update": {
      const current = await getBookingFormConfig(ownerId);

      const next = {
        ...current,
        thankYouMessage: args.thankYouMessage ?? current.thankYouMessage,
        phone: {
          enabled: args.phone?.enabled ?? current.phone.enabled,
          required: args.phone?.required ?? current.phone.required,
        },
        notes: {
          enabled: args.notes?.enabled ?? current.notes.enabled,
          required: args.notes?.required ?? current.notes.required,
        },
        questions:
          args.questions?.map((q: any) => ({
            id: q.id,
            label: q.label,
            required: Boolean(q.required),
            kind: (q.kind ?? "short") as any,
            options: q.options,
          })) ?? current.questions,
      } as const;

      const normalized = {
        ...next,
        phone: { ...next.phone, required: next.phone.enabled ? next.phone.required : false },
        notes: { ...next.notes, required: next.notes.enabled ? next.notes.required : false },
      };

      const saved = await setBookingFormConfig(ownerId, normalized);
      return { status: 200, json: { ok: true, config: saved } };
    }

    case "booking.site.get": {
      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      let site = (await prisma.clientBlogSite
        .findUnique({
          where: { ownerId },
          select: {
            id: true,
            name: true,
            primaryDomain: true,
            verifiedAt: true,
            verificationToken: true,
            updatedAt: true,
            ...(canUseSlugColumn ? { slug: true } : {}),
          } as any,
        })
        .catch(() => null)) as any;

      const currentSlug = (site as any)?.slug as string | null | undefined;
      if (site && canUseSlugColumn && !currentSlug) {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const base = slugify(profile?.businessName ?? String(site.name || "Site")) || "site";
        const desired = base.length >= 3 ? base : "site";
        let slug = desired;
        const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug } }).catch(() => null)) as any;
        if (collision && String(collision.ownerId) !== ownerId) slug = `${desired}-${ownerId.slice(0, 6)}`;

        site = (await (prisma.clientBlogSite as any).update({
          where: { ownerId },
          data: { slug },
          select: {
            id: true,
            name: true,
            primaryDomain: true,
            verifiedAt: true,
            verificationToken: true,
            updatedAt: true,
            ...(canUseSlugColumn ? { slug: true } : {}),
          } as any,
        })) as any;
      }

      let fallbackSlug: string | null = null;
      if (site && !canUseSlugColumn) {
        fallbackSlug = await getStoredBlogSiteSlug(ownerId);
        if (!fallbackSlug) {
          fallbackSlug = await ensureStoredBlogSiteSlug(ownerId, String(site.name || "Site"));
        }
      }

      return {
        status: 200,
        json: {
          ok: true,
          site: site
            ? {
                ...(site as any),
                slug: canUseSlugColumn ? ((site as any).slug ?? null) : fallbackSlug,
              }
            : null,
        },
      };
    }

    case "booking.site.update": {
      const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");

      const existing = (await prisma.clientBlogSite
        .findUnique({
          where: { ownerId },
          select: {
            id: true,
            name: true,
            primaryDomain: true,
            verifiedAt: true,
            verificationToken: true,
            updatedAt: true,
            ...(canUseSlugColumn ? { slug: true } : {}),
          } as any,
        })
        .catch(() => null)) as any;

      const primaryDomain = normalizeDomain((args.primaryDomain ?? "") as any);

      if (existing) {
        const currentPrimaryDomain = normalizeDomain((existing as any)?.primaryDomain);
        const domainChanged = primaryDomain !== currentPrimaryDomain;
        const tokenMissing = Boolean(primaryDomain) && !String((existing as any)?.verificationToken || "").trim();
        const nextVerificationToken =
          domainChanged && primaryDomain
            ? crypto.randomBytes(18).toString("hex")
            : tokenMissing
              ? crypto.randomBytes(18).toString("hex")
              : (existing as any)?.verificationToken;

        const updated = (await (prisma.clientBlogSite as any).update({
          where: { ownerId },
          data: {
            primaryDomain,
            ...(domainChanged
              ? { verifiedAt: null, verificationToken: nextVerificationToken }
              : tokenMissing
                ? { verificationToken: nextVerificationToken }
                : {}),
            ...(primaryDomain ? {} : domainChanged ? { verifiedAt: null } : {}),
          },
          select: {
            id: true,
            name: true,
            primaryDomain: true,
            verifiedAt: true,
            verificationToken: true,
            updatedAt: true,
            ...(canUseSlugColumn ? { slug: true } : {}),
          } as any,
        })) as any;

        return {
          status: 200,
          json: {
            ok: true,
            site: {
              ...(updated as any),
              slug: canUseSlugColumn ? ((updated as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
            },
          },
        };
      }

      const token = crypto.randomBytes(18).toString("hex");
      const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
      const name = String(profile?.businessName || "Hosted site").trim() || "Hosted site";
      const slug = await ensureUniquePublicSiteSlug(ownerId, name).then((r) => r.slug);

      if (!canUseSlugColumn && slug) {
        try {
          await ensureStoredBlogSiteSlug(ownerId, name);
        } catch {
          // ignore
        }
      }

      if (canUseSlugColumn && slug) {
        const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } })) as any;
        if (collision && String(collision.ownerId) !== ownerId) {
          return { status: 409, json: { ok: false, error: "That link is already taken." } };
        }
      }

      const created = (await (prisma.clientBlogSite as any).create({
        data: {
          ownerId,
          name,
          primaryDomain,
          verificationToken: token,
          ...(canUseSlugColumn ? { slug } : {}),
        },
        select: {
          id: true,
          name: true,
          primaryDomain: true,
          verifiedAt: true,
          verificationToken: true,
          updatedAt: true,
          ...(canUseSlugColumn ? { slug: true } : {}),
        } as any,
      })) as any;

      if (!canUseSlugColumn) {
        const stored = await getStoredBlogSiteSlug(ownerId);
        if (!stored) {
          try {
            await setStoredBlogSiteSlug(ownerId, slugify(name) || "site");
          } catch {
            // ignore
          }
        }
      }

      return {
        status: 200,
        json: {
          ok: true,
          site: {
            ...(created as any),
            slug: canUseSlugColumn ? ((created as any).slug ?? null) : (await getStoredBlogSiteSlug(ownerId)),
          },
        },
      };
    }

    case "booking.suggestions.slots": {
      const site = await (prisma as any).portalBookingSite.findUnique({ where: { ownerId }, select: { id: true, ownerId: true } });
      if (!site) {
        return { status: 200, json: { ok: true, slots: [] } };
      }

      const now = new Date();
      const base = args.startAtIso ? new Date(args.startAtIso) : now;
      const rangeStart = Number.isNaN(base.getTime()) ? now : base;
      const rangeEnd = new Date(rangeStart.getTime() + (args.days ?? 14) * 24 * 60 * 60_000);

      const [blocks, bookings] = await Promise.all([
        prisma.availabilityBlock.findMany({
          where: { userId: site.ownerId, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
          select: { startAt: true, endAt: true },
        }),
        (prisma as any).portalBooking.findMany({
          where: { siteId: site.id, status: "SCHEDULED", startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
          select: { startAt: true, endAt: true },
        }),
      ]);

      const slots = computeAvailableSlots({
        startAt: args.startAtIso ?? null,
        days: args.days ?? 14,
        durationMinutes: args.durationMinutes ?? 30,
        limit: args.limit ?? 25,
        coverageBlocks: blocks,
        existing: bookings,
      });

      return { status: 200, json: { ok: true, slots } };
    }

    case "booking.reminders.settings.get": {
      const calendarId = args.calendarId ?? null;
      const [selected, twilio, events] = await Promise.all([
        getAppointmentReminderSettingsForCalendar(ownerId, calendarId),
        getOwnerTwilioSmsConfigMasked(ownerId),
        listAppointmentReminderEvents(ownerId, 50),
      ]);

      const builtinVariables = [
        "contactName",
        "contactEmail",
        "contactPhone",
        "businessName",
        "bookingTitle",
        "calendarTitle",
        "when",
        "timeZone",
        "startAt",
        "endAt",
      ];

      return {
        status: 200,
        json: {
          ok: true,
          settings: selected.settings,
          calendarId: selected.calendarId ?? null,
          isOverride: selected.isOverride,
          twilio,
          events,
          builtinVariables,
        },
      };
    }

    case "booking.reminders.settings.update": {
      const calendarId = args.calendarId ?? null;
      const raw = args && typeof args === "object" ? (args as any).settings ?? args : null;
      const settings = parseAppointmentReminderSettings(raw);

      const next = await setAppointmentReminderSettingsForCalendar(ownerId, calendarId, settings);
      const [twilio, events] = await Promise.all([
        getOwnerTwilioSmsConfigMasked(ownerId),
        listAppointmentReminderEvents(ownerId, 50),
      ]);

      const builtinVariables = [
        "contactName",
        "contactEmail",
        "contactPhone",
        "businessName",
        "bookingTitle",
        "calendarTitle",
        "when",
        "timeZone",
        "startAt",
        "endAt",
      ];

      return { status: 200, json: { ok: true, settings: next, calendarId: calendarId ?? null, twilio, events, builtinVariables } };
    }

    case "booking.reminders.ai.generate_step": {
      const { kind, prompt, existingSubject, existingBody } = args as any;

      const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
      const needCredits = PORTAL_CREDIT_COSTS.aiDraftStep;
      const consumed = await consumeCredits(ownerId, needCredits);
      if (!consumed.ok) {
        return {
          status: 402,
          json: { ok: false, error: "INSUFFICIENT_CREDITS", code: "INSUFFICIENT_CREDITS", credits: consumed.state.balance },
        };
      }

      const system =
        kind === "SMS"
          ? "You write short, practical appointment reminder SMS messages for a small business."
          : "You write friendly, concise appointment reminder emails for a small business.";

      const user = [
        "Draft the copy for an appointment reminder step.",
        businessContext ? businessContext : "",
        `Channel: ${kind}`,
        "",
        "Allowed variables (keep braces exactly): {name}, {when}.",
        "You may also use dotted portal variables like {contact.firstName} and {business.name} if helpful.",
        kind === "SMS" ? "Keep it under 320 characters if possible." : "",
        kind === "EMAIL" ? "Return a subject and body." : "",
        "",
        existingSubject ? `Existing subject: ${existingSubject}` : "",
        existingBody ? `Existing body: ${existingBody}` : "",
        prompt ? `Extra instruction: ${prompt}` : "",
        "",
        kind === "EMAIL"
          ? "Prefer returning JSON: {\"subject\": \"...\", \"body\": \"...\"}. If you don't return JSON, start with 'Subject: ...' on the first line."
          : "Return the SMS body only (no JSON needed).",
      ]
        .filter(Boolean)
        .join("\n");

      const content = await generateText({ system, user });

      if (kind === "EMAIL") {
        const fromJson = tryParseJsonDraft(content);
        if (fromJson?.body || fromJson?.subject) {
          return {
            status: 200,
            json: {
              ok: true,
              subject: (fromJson.subject || "").slice(0, 200),
              body: (fromJson.body || "").slice(0, 8000),
            },
          };
        }

        const parsedFallback = parseSubjectBodyFallback(content);
        return {
          status: 200,
          json: {
            ok: true,
            subject: (parsedFallback.subject || "").slice(0, 200),
            body: (parsedFallback.body || "").slice(0, 8000),
          },
        };
      }

      return { status: 200, json: { ok: true, body: String(content || "").trim().slice(0, 8000) } };
    }

    case "booking.bookings.list": {
      const take = typeof args.take === "number" && Number.isFinite(args.take) ? Math.max(1, Math.min(50, Math.floor(args.take))) : 25;

      const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true } });
      if (!site) return { status: 200, json: { ok: true, upcoming: [], recent: [] } };

      const now = new Date();
      await ensurePortalContactTagsReady().catch(() => null);

      const [hasCalendarId, hasContactId] = await Promise.all([
        hasPublicColumn("PortalBooking", "calendarId"),
        hasPublicColumn("PortalBooking", "contactId"),
      ]);

      const select: Record<string, boolean> = {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        notes: true,
        createdAt: true,
        canceledAt: true,
      };
      if (hasCalendarId) select.calendarId = true;
      if (hasContactId) select.contactId = true;

      const [upcoming, recent] = await Promise.all([
        prisma.portalBooking.findMany({
          where: { siteId: site.id, status: "SCHEDULED", startAt: { gte: now } },
          orderBy: { startAt: "asc" },
          take,
          select: select as any,
        }),
        prisma.portalBooking.findMany({
          where: { siteId: site.id, OR: [{ status: "CANCELED" }, { startAt: { lt: now } }] },
          orderBy: { startAt: "desc" },
          take,
          select: select as any,
        }),
      ]);

      if (hasContactId) {
        const all = ([...(upcoming || []), ...(recent || [])] as any[]).filter(Boolean);
        const missing = all.filter((b) => !b.contactId && typeof b.contactName === "string" && b.contactName.trim());
        for (const b of missing.slice(0, 15)) {
          try {
            const contactId = await findOrCreatePortalContact({
              ownerId,
              name: String(b.contactName || "").slice(0, 80),
              email: b.contactEmail ? String(b.contactEmail) : null,
              phone: b.contactPhone ? String(b.contactPhone) : null,
            });
            if (!contactId) continue;
            await prisma.portalBooking.updateMany({ where: { id: String(b.id), siteId: site.id }, data: { contactId } });
            b.contactId = contactId;
          } catch {
            // ignore
          }
        }
      }

      const all = [...(upcoming || []), ...(recent || [])] as any[];
      const contactIds = Array.from(new Set(all.map((b) => String((b as any).contactId || "")).filter(Boolean)));

      const tagsByContactId = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
      if (contactIds.length) {
        try {
          const rows = await (prisma as any).portalContactTagAssignment.findMany({
            where: { ownerId, contactId: { in: contactIds } },
            take: 4000,
            select: { contactId: true, tag: { select: { id: true, name: true, color: true } } },
          });
          for (const r of rows || []) {
            const cid = String(r.contactId);
            const t = r.tag;
            if (!t) continue;
            const list = tagsByContactId.get(cid) || [];
            list.push({ id: String(t.id), name: String(t.name), color: t.color ? String(t.color) : null });
            tagsByContactId.set(cid, list);
          }
        } catch {
          // ignore
        }
      }

      const withTags = (list: any[]) =>
        (list || []).map((b: any) => ({
          ...b,
          contactId: b.contactId ? String(b.contactId) : null,
          contactTags: b.contactId ? tagsByContactId.get(String(b.contactId)) || [] : [],
        }));

      return { status: 200, json: { ok: true, upcoming: withTags(upcoming as any), recent: withTags(recent as any) } };
    }

    case "booking.cancel": {
      const bookingId = String(args.bookingId || "").trim();
      if (!bookingId) return { status: 400, json: { ok: false, error: "Missing bookingId" } };

      const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true, title: true, timeZone: true } });
      if (!site) return { status: 404, json: { ok: false, error: "Not found" } };

      const booking = await prisma.portalBooking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.siteId !== site.id) return { status: 404, json: { ok: false, error: "Not found" } };

      if (booking.status !== "SCHEDULED") {
        return { status: 200, json: { ok: true, booking } };
      }

      const updated = await prisma.portalBooking.update({ where: { id: bookingId }, data: { status: "CANCELED", canceledAt: new Date() } });

      try {
        await cancelFollowUpsForBooking(String(ownerId), String(updated.id));
      } catch {
        // ignore
      }

      try {
        if (updated.contactEmail) {
          const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
          const fromName = profile?.businessName?.trim() || "Purely Automation";
          const when = new Intl.DateTimeFormat(undefined, {
            timeZone: site.timeZone,
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(updated.startAt));

          const body = [
            `Your booking was canceled: ${site.title}`,
            "",
            `When: ${when} (${site.timeZone})`,
            "",
            "If you have questions, reply to this email.",
          ].join("\n");

          await trySendTransactionalEmail({ to: [updated.contactEmail], subject: `Booking canceled: ${site.title}`, text: body, fromName }).catch(() => null);
        }
      } catch {
        // ignore
      }

      return { status: 200, json: { ok: true, booking: updated } };
    }

    case "booking.reschedule": {
      const bookingId = String(args.bookingId || "").trim();
      const startAtIso = String(args.startAtIso || "").trim();
      const forceAvailability = Boolean(args.forceAvailability);
      if (!bookingId) return { status: 400, json: { ok: false, error: "Missing bookingId" } };
      if (!startAtIso) return { status: 400, json: { ok: false, error: "Missing startAtIso" } };

      const site = await (prisma as any).portalBookingSite.findUnique({
        where: { ownerId },
        select: { id: true, slug: true, title: true, durationMinutes: true, timeZone: true },
      });
      if (!site) return { status: 404, json: { ok: false, error: "Not found" } };

      const booking = await (prisma as any).portalBooking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.siteId !== site.id) return { status: 404, json: { ok: false, error: "Not found" } };

      if (booking.status !== "SCHEDULED") {
        return { status: 200, json: { ok: true, booking } };
      }

      const startAt = new Date(startAtIso);
      if (Number.isNaN(startAt.getTime())) return { status: 400, json: { ok: false, error: "Please choose a valid time." } };

      const durationMs = new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime();
      const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : Number(site.durationMinutes) * 60_000;
      const endAt = new Date(startAt.getTime() + safeDurationMs);

      const existing = await (prisma as any).portalBooking.findMany({
        where: {
          siteId: site.id,
          status: "SCHEDULED",
          id: { not: booking.id },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { startAt: true, endAt: true },
      });

      const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;
      for (const b of existing || []) {
        if (overlaps(startAt, endAt, b.startAt, b.endAt)) {
          return { status: 409, json: { ok: false, error: "That time conflicts with another booking." } };
        }
      }

      const coverage = await prisma.availabilityBlock.findFirst({
        where: { userId: ownerId, startAt: { lte: startAt }, endAt: { gte: endAt } },
        select: { id: true },
      });

      if (!coverage) {
        if (forceAvailability) {
          await prisma.availabilityBlock.create({ data: { userId: ownerId, startAt, endAt }, select: { id: true } });
        } else {
          return { status: 409, json: { ok: false, error: "No availability covers that time. Enable Force availability to schedule it anyway.", noAvailability: true } };
        }
      }

      const updated = await (prisma as any).portalBooking.update({ where: { id: booking.id }, data: { startAt, endAt } });

      try {
        await scheduleFollowUpsForBooking(String(ownerId), String(updated.id));
      } catch {
        // ignore
      }

      const rescheduleToken = signBookingRescheduleToken({ bookingId: String(updated.id), contactEmail: String(updated.contactEmail || "") });
      const origin = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const rescheduleUrl = rescheduleToken
        ? new URL(
            `/book/${encodeURIComponent(String(site.slug))}/reschedule/${encodeURIComponent(String(updated.id))}?t=${encodeURIComponent(rescheduleToken)}`,
            origin,
          ).toString()
        : null;

      try {
        const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
        const fromName = profile?.businessName?.trim() || "Purely Automation";
        const when = `${new Intl.DateTimeFormat(undefined, {
          timeZone: site.timeZone,
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(startAt)} (${site.timeZone})`;

        if (updated.contactEmail) {
          await trySendTransactionalEmail({
            to: [updated.contactEmail],
            subject: `Booking rescheduled: ${site.title}`,
            text: [
              `Your booking was rescheduled: ${site.title}`,
              "",
              `New time: ${when}`,
              rescheduleUrl ? "" : null,
              rescheduleUrl ? `Reschedule link: ${rescheduleUrl}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
            fromName,
          }).catch(() => null);
        }

        if (updated.contactPhone) {
          await sendOwnerTwilioSms({ ownerId, to: updated.contactPhone, body: `Rescheduled: ${site.title} - ${when}`.slice(0, 900) }).catch(() => null);
        }
      } catch {
        // ignore
      }

      return { status: 200, json: { ok: true, booking: updated, rescheduleUrl } };
    }

    case "booking.contact": {
      const bookingId = String(args.bookingId || "").trim();
      const messageTemplate = String(args.message || "").trim().slice(0, 2000);
      const subjectTemplate = typeof args.subject === "string" ? String(args.subject).trim().slice(0, 120) : null;
      const sendEmailRequested = Boolean(args.sendEmail);
      const sendSmsRequested = Boolean(args.sendSms);
      if (!bookingId) return { status: 400, json: { ok: false, error: "Missing bookingId" } };
      if (!messageTemplate) return { status: 400, json: { ok: false, error: "Missing message" } };
      if (!sendEmailRequested && !sendSmsRequested) return { status: 400, json: { ok: false, error: "Choose Email and/or Text." } };

      const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true, title: true, timeZone: true } });
      if (!site) return { status: 404, json: { ok: false, error: "Not found" } };

      const booking = await prisma.portalBooking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.siteId !== site.id) return { status: 404, json: { ok: false, error: "Not found" } };

      const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
      const fromName = profile?.businessName?.trim() || site.title || "Purely Automation";

      const subjectT = subjectTemplate || `Follow-up: ${site.title}`;

      const when = (() => {
        try {
          return new Date(booking.startAt).toLocaleString(undefined, {
            timeZone: site.timeZone,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
        } catch {
          return new Date(booking.startAt).toLocaleString();
        }
      })();

      const vars = {
        ...buildPortalTemplateVars({
          contact: {
            id: (booking as any).contactId ?? null,
            name: (booking as any).contactName ?? null,
            email: (booking as any).contactEmail ?? null,
            phone: (booking as any).contactPhone ?? null,
          },
          business: { name: fromName },
        }),
        when,
        timeZone: site.timeZone,
        startAt: new Date(booking.startAt).toISOString(),
        endAt: new Date(booking.endAt).toISOString(),
        bookingTitle: site.title,
        calendarTitle: site.title,
      };

      const subject = renderTextTemplate(subjectT, vars).trim().slice(0, 120) || subjectT;
      const message = renderTextTemplate(messageTemplate, vars);

      const sent = { email: false, sms: false };

      if (sendEmailRequested) {
        if (!booking.contactEmail) return { status: 400, json: { ok: false, error: "This booking has no email address." } };
        await sendTransactionalEmail({ to: booking.contactEmail, subject, text: message, fromName });
        sent.email = true;
      }

      if (sendSmsRequested) {
        if (!booking.contactPhone) return { status: 400, json: { ok: false, error: "This booking has no phone number." } };
        const res = await sendOwnerTwilioSms({ ownerId, to: booking.contactPhone, body: message.slice(0, 900) });
        if (!res.ok) return { status: 400, json: { ok: false, error: res.error || "Texting is not configured yet." } };
        sent.sms = true;
      }

      return { status: 200, json: { ok: true, sent } };
    }

    case "nurture.campaigns.list": {
      const take = typeof args.take === "number" && Number.isFinite(args.take) ? Math.max(1, Math.min(200, Math.floor(args.take))) : 200;

      await ensurePortalNurtureSchema();

      const campaigns = await prisma.portalNurtureCampaign.findMany({
        where: { ownerId },
        select: { id: true, name: true, status: true, updatedAt: true, createdAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take,
      });

      const campaignIds = campaigns.map((c) => String(c.id));
      const [stepsAgg, enrollAgg] = await Promise.all([
        prisma.portalNurtureStep.groupBy({
          by: ["campaignId"],
          where: { ownerId, campaignId: { in: campaignIds } },
          _count: { _all: true },
        }),
        prisma.portalNurtureEnrollment.groupBy({
          by: ["campaignId", "status"],
          where: { ownerId, campaignId: { in: campaignIds } },
          _count: { _all: true },
        }),
      ]);

      const stepsCountByCampaign = new Map<string, number>();
      for (const row of stepsAgg || []) {
        stepsCountByCampaign.set(String((row as any).campaignId), Number((row as any)?._count?._all ?? 0));
      }

      const enrollCountsByCampaign = new Map<string, { active: number; completed: number; stopped: number }>();
      for (const row of enrollAgg || []) {
        const id = String((row as any).campaignId);
        const next = enrollCountsByCampaign.get(id) ?? { active: 0, completed: 0, stopped: 0 };
        const status = String((row as any).status);
        const count = Number((row as any)?._count?._all ?? 0);
        if (status === "ACTIVE") next.active += count;
        else if (status === "COMPLETED") next.completed += count;
        else if (status === "STOPPED") next.stopped += count;
        enrollCountsByCampaign.set(id, next);
      }

      return {
        status: 200,
        json: {
          ok: true,
          campaigns: campaigns.map((c) => {
            const enroll = enrollCountsByCampaign.get(String(c.id)) ?? { active: 0, completed: 0, stopped: 0 };
            return {
              id: c.id,
              name: c.name,
              status: c.status,
              createdAtIso: c.createdAt.toISOString(),
              updatedAtIso: c.updatedAt.toISOString(),
              stepsCount: stepsCountByCampaign.get(String(c.id)) ?? 0,
              enrollments: enroll,
            };
          }),
        },
      };
    }

    case "nurture.campaigns.create": {
      await ensurePortalNurtureSchema();

      const now = new Date();
      const id = crypto.randomUUID();
      const name = typeof args.name === "string" && args.name.trim() ? String(args.name).trim().slice(0, 80) : "New campaign";

      await prisma.portalNurtureCampaign.create({
        data: {
          id,
          ownerId,
          name,
          status: "DRAFT",
          smsFooter: "Reply STOP to opt out.",
          emailFooter: "",
          createdAt: now,
          updatedAt: now,
        },
      });

      const stepId = crypto.randomUUID();
      await prisma.portalNurtureStep.create({
        data: {
          id: stepId,
          ownerId,
          campaignId: id,
          ord: 0,
          kind: "SMS",
          delayMinutes: 0,
          body: "Hey {contact.name}, just checking in. Any questions I can help with?",
          createdAt: now,
          updatedAt: now,
        },
      });

      return { status: 200, json: { ok: true, id } };
    }

    case "nurture.campaigns.get": {
      const campaignId = String(args.campaignId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };

      await ensurePortalNurtureSchema();

      const campaign = await prisma.portalNurtureCampaign.findFirst({
        where: { ownerId, id: campaignId },
        select: {
          id: true,
          name: true,
          status: true,
          audienceTagIdsJson: true,
          smsFooter: true,
          emailFooter: true,
          createdAt: true,
          updatedAt: true,
          steps: {
            select: { id: true, ord: true, kind: true, delayMinutes: true, subject: true, body: true, updatedAt: true },
            orderBy: [{ ord: "asc" }],
          },
        },
      });

      if (!campaign) return { status: 404, json: { ok: false, error: "Not found" } };

      const audienceTagIds = readStringArray(campaign.audienceTagIdsJson);

      return {
        status: 200,
        json: {
          ok: true,
          campaign: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            audienceTagIds,
            smsFooter: campaign.smsFooter,
            emailFooter: campaign.emailFooter,
            createdAtIso: campaign.createdAt.toISOString(),
            updatedAtIso: campaign.updatedAt.toISOString(),
            steps: (campaign.steps || []).map((s) => ({
              id: s.id,
              ord: s.ord,
              kind: s.kind,
              delayMinutes: s.delayMinutes,
              subject: s.subject,
              body: s.body,
              updatedAtIso: s.updatedAt.toISOString(),
            })),
          },
        },
      };
    }

    case "nurture.campaigns.update": {
      const campaignId = String(args.campaignId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };

      await ensurePortalNurtureSchema();

      const existing = await prisma.portalNurtureCampaign.findFirst({
        where: { ownerId, id: campaignId },
        select: { id: true, status: true, installPaidAt: true, stripeSubscriptionId: true },
      });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      const now = new Date();
      const data: any = { updatedAt: now };

      if (args.name !== undefined) data.name = String(args.name || "").trim().slice(0, 80);
      if (args.status !== undefined) data.status = args.status;
      if (args.audienceTagIds !== undefined) data.audienceTagIdsJson = Array.isArray(args.audienceTagIds) ? args.audienceTagIds : [];
      if (args.smsFooter !== undefined) data.smsFooter = String(args.smsFooter ?? "").slice(0, 300);
      if (args.emailFooter !== undefined) data.emailFooter = String(args.emailFooter ?? "").slice(0, 2000);

      const nextStatus = args.status as any;
      const isActivating = nextStatus === "ACTIVE" && existing.status !== "ACTIVE";

      if (isActivating) {
        const intake = await prisma.portalServiceSetup
          .findUnique({
            where: { ownerId_serviceSlug: { ownerId, serviceSlug: "onboarding-intake" } },
            select: { dataJson: true },
          })
          .catch(() => null);

        const intakeRec = intake?.dataJson && typeof intake.dataJson === "object" && !Array.isArray(intake.dataJson)
          ? (intake.dataJson as Record<string, unknown>)
          : {};

        const selectedPlanIds = Array.isArray((intakeRec as any).selectedPlanIds)
          ? (intakeRec as any).selectedPlanIds
              .map((x: any) => (typeof x === "string" ? x.trim() : ""))
              .filter(Boolean)
              .slice(0, 50)
          : [];

        const rawQty = (intakeRec as any).selectedPlanQuantities && typeof (intakeRec as any).selectedPlanQuantities === "object"
          ? (intakeRec as any).selectedPlanQuantities
          : {};

        const purchasedSlots = (() => {
          if (!selectedPlanIds.includes("nurture")) return 0;
          const n = Number((rawQty as any)?.nurture ?? 1);
          if (!Number.isFinite(n)) return 1;
          return Math.max(1, Math.min(10, Math.trunc(n)));
        })();

        if (purchasedSlots > 0) {
          const activeCount = await prisma.portalNurtureCampaign.count({ where: { ownerId, status: "ACTIVE" } });
          const willBeActiveCount = Number(activeCount) + 1;
          if (willBeActiveCount <= purchasedSlots) {
            data.installPaidAt = existing.installPaidAt ?? now;
            data.stripeSubscriptionId = null;
          }
        }

        const ownerUser = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }).catch(() => null);
        const email = ownerUser?.email ? String(ownerUser.email) : "";

        const stripeReady = Boolean(isStripeConfigured() && email);
        if (process.env.NODE_ENV === "production" && !stripeReady) {
          return { status: 503, json: { ok: false, error: "Billing is unavailable right now." } };
        }

        const origin = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

        if (data.installPaidAt || data.stripeSubscriptionId === null) {
          // Onboarding already covered activation.
        } else {
          if (stripeReady && existing.stripeSubscriptionId) {
            try {
              const sub = await stripeGet<any>(`/v1/subscriptions/${encodeURIComponent(String(existing.stripeSubscriptionId))}`);
              const status = String(sub?.status ?? "");
              if (["active", "trialing", "past_due"].includes(status)) {
                // ok
              } else {
                throw new Error("Subscription inactive");
              }
            } catch {
              // fall through
            }
          }

          if (stripeReady) {
            const includeInstall = !existing.installPaidAt;
            const customer = await getOrCreateStripeCustomerId(String(email));

            const successUrl = new URL(
              `/portal/app/services/nurture-campaigns?billing=success&campaignId=${encodeURIComponent(campaignId)}&session_id={CHECKOUT_SESSION_ID}`,
              origin,
            ).toString();
            const cancelUrl = new URL(
              `/portal/app/services/nurture-campaigns?billing=cancel&campaignId=${encodeURIComponent(campaignId)}`,
              origin,
            ).toString();

            const params: Record<string, unknown> = {
              mode: "subscription",
              customer,
              success_url: successUrl,
              cancel_url: cancelUrl,
              allow_promotion_codes: true,
              "metadata[kind]": includeInstall ? "nurture_install_and_monthly" : "nurture_monthly",
              "metadata[ownerId]": ownerId,
              "metadata[campaignId]": campaignId,
              "subscription_data[metadata][kind]": "nurture_campaign",
              "subscription_data[metadata][ownerId]": ownerId,
              "subscription_data[metadata][campaignId]": campaignId,
            };

            let i = 0;
            if (includeInstall) {
              params[`line_items[${i}][quantity]`] = 1;
              params[`line_items[${i}][price_data][currency]`] = "usd";
              params[`line_items[${i}][price_data][unit_amount]`] = 9900;
              params[`line_items[${i}][price_data][product_data][name]`] = "Nurture Campaign setup";
              params[`line_items[${i}][price_data][product_data][description]`] = "One-time install fee for this campaign.";
              i += 1;
            }

            params[`line_items[${i}][quantity]`] = 1;
            params[`line_items[${i}][price_data][currency]`] = "usd";
            params[`line_items[${i}][price_data][unit_amount]`] = 2900;
            params[`line_items[${i}][price_data][recurring][interval]`] = "month";
            params[`line_items[${i}][price_data][product_data][name]`] = "Nurture Campaign (monthly)";
            params[`line_items[${i}][price_data][product_data][description]`] = "Monthly subscription for this active campaign.";

            const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", params);
            return { status: 402, json: { ok: false, error: "Billing required", code: "BILLING_REQUIRED", url: checkout.url } };
          }
        }
      }

      const updated = await prisma.portalNurtureCampaign.updateMany({ where: { ownerId, id: campaignId }, data });
      if (!updated.count) return { status: 404, json: { ok: false, error: "Not found" } };

      return { status: 200, json: { ok: true } };
    }

    case "nurture.campaigns.delete": {
      const campaignId = String(args.campaignId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };
      await ensurePortalNurtureSchema();
      await prisma.portalNurtureCampaign.deleteMany({ where: { ownerId, id: campaignId } });
      return { status: 200, json: { ok: true } };
    }

    case "nurture.campaigns.steps.add": {
      const campaignId = String(args.campaignId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };
      const kind = (args.kind === "EMAIL" || args.kind === "TAG" || args.kind === "SMS") ? args.kind : "SMS";

      await ensurePortalNurtureSchema();

      const campaign = await prisma.portalNurtureCampaign.findFirst({ where: { ownerId, id: campaignId }, select: { id: true } });
      if (!campaign) return { status: 404, json: { ok: false, error: "Not found" } };

      const ord = await prisma.portalNurtureStep.count({ where: { ownerId, campaignId } });
      const now = new Date();
      const id = crypto.randomUUID();

      if (kind === "TAG") {
        await prisma.portalNurtureStep.create({
          data: {
            id,
            ownerId,
            campaignId,
            ord,
            kind,
            delayMinutes: ord === 0 ? 0 : 60 * 24,
            subject: null,
            body: "TAG:",
            createdAt: now,
            updatedAt: now,
          },
        });

        await prisma.portalNurtureCampaign.updateMany({ where: { ownerId, id: campaignId }, data: { updatedAt: now } });
        return { status: 200, json: { ok: true, id } };
      }

      await prisma.portalNurtureStep.create({
        data: {
          id,
          ownerId,
          campaignId,
          ord,
          kind,
          delayMinutes: ord === 0 ? 0 : 60 * 24,
          subject: kind === "EMAIL" ? "Quick question" : null,
          body:
            kind === "EMAIL"
              ? "Hi {contact.name},\n\nJust checking in. Do you want help getting this set up?\n\n- {business.name}"
              : "Hey {contact.name}, just checking in. Want help getting this set up?",
          createdAt: now,
          updatedAt: now,
        },
      });

      await prisma.portalNurtureCampaign.updateMany({ where: { ownerId, id: campaignId }, data: { updatedAt: now } });
      return { status: 200, json: { ok: true, id } };
    }

    case "nurture.steps.update": {
      const stepId = String(args.stepId || "").trim();
      if (!stepId) return { status: 400, json: { ok: false, error: "Missing stepId" } };

      await ensurePortalNurtureSchema();

      const existing = await prisma.portalNurtureStep.findFirst({
        where: { ownerId, id: stepId },
        select: { id: true, campaignId: true, ord: true, kind: true, body: true },
      });

      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      const now = new Date();

      const nextKind = (args.kind ?? existing.kind) as any;
      const nextBody = args.body ?? existing.body;
      if (nextKind === "TAG" && typeof nextBody === "string" && !nextBody.startsWith("TAG:")) {
        return { status: 400, json: { ok: false, error: 'TAG steps must have body like "TAG:<tagId>"' } };
      }

      if (args.ord !== undefined && args.ord !== existing.ord) {
        const steps = await prisma.portalNurtureStep.findMany({
          where: { ownerId, campaignId: existing.campaignId },
          select: { id: true, ord: true },
          orderBy: [{ ord: "asc" }],
        });

        const toMove = steps.find((s) => s.id === existing.id);
        if (!toMove) return { status: 404, json: { ok: false, error: "Not found" } };

        const without = steps.filter((s) => s.id !== existing.id);
        const nextIndex = Math.max(0, Math.min(without.length, Number(args.ord)));
        without.splice(nextIndex, 0, toMove);

        await prisma.$transaction(
          without.map((s, idx) =>
            prisma.portalNurtureStep.update({
              where: { id: s.id },
              data: { ord: idx, updatedAt: now },
            }),
          ),
        );
      }

      const data: any = { updatedAt: now };
      if (args.kind !== undefined) data.kind = args.kind;
      if (args.delayMinutes !== undefined) data.delayMinutes = args.delayMinutes;
      if (args.subject !== undefined) data.subject = args.subject;
      if (args.body !== undefined) data.body = args.body;

      if (nextKind === "TAG") {
        data.subject = null;
        data.body = typeof nextBody === "string" ? nextBody : "TAG:";
      }

      await prisma.portalNurtureStep.updateMany({ where: { ownerId, id: stepId }, data });
      return { status: 200, json: { ok: true } };
    }

    case "nurture.steps.delete": {
      const stepId = String(args.stepId || "").trim();
      if (!stepId) return { status: 400, json: { ok: false, error: "Missing stepId" } };

      await ensurePortalNurtureSchema();

      const step = await prisma.portalNurtureStep.findFirst({ where: { ownerId, id: stepId }, select: { id: true, campaignId: true } });
      if (!step) return { status: 200, json: { ok: true } };

      const now = new Date();
      await prisma.portalNurtureStep.deleteMany({ where: { ownerId, id: stepId } });

      const remaining = await prisma.portalNurtureStep.findMany({
        where: { ownerId, campaignId: step.campaignId },
        select: { id: true },
        orderBy: [{ ord: "asc" }],
      });

      await prisma.$transaction(
        remaining.map((s, idx) =>
          prisma.portalNurtureStep.update({
            where: { id: s.id },
            data: { ord: idx, updatedAt: now },
          }),
        ),
      );

      return { status: 200, json: { ok: true } };
    }

    case "nurture.campaigns.enroll": {
      const campaignId = String(args.campaignId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };
      const dryRun = Boolean(args.dryRun);

      await ensurePortalNurtureSchema();

      const campaign = await prisma.portalNurtureCampaign.findFirst({
        where: { ownerId, id: campaignId },
        select: { id: true, status: true, audienceTagIdsJson: true },
      });
      if (!campaign) return { status: 404, json: { ok: false, error: "Not found" } };
      if (campaign.status !== "ACTIVE") {
        return { status: 400, json: { ok: false, error: "Activate the campaign before enrolling contacts." } };
      }

      const tagIds = (
        Array.isArray(args.tagIds) && args.tagIds.length
          ? (args.tagIds as any[]).map((x) => String(x || "").trim()).filter(Boolean)
          : readStringArray(campaign.audienceTagIdsJson)
      ).filter(Boolean);

      if (!tagIds.length) {
        return { status: 400, json: { ok: false, error: "Select at least one audience tag before enrolling." } };
      }

      const matches = await prisma.portalContactTagAssignment.findMany({
        where: { ownerId, tagId: { in: tagIds } },
        select: { contactId: true },
        take: 5000,
      });
      const contactIds = Array.from(new Set((matches || []).map((m) => String((m as any).contactId))));

      if (dryRun) return { status: 200, json: { ok: true, wouldEnroll: contactIds.length } };

      const steps = await prisma.portalNurtureStep.findMany({
        where: { ownerId, campaignId },
        select: { ord: true, delayMinutes: true },
        orderBy: [{ ord: "asc" }],
        take: 1,
      });
      const firstDelay = steps.length ? Math.max(0, Number((steps[0] as any).delayMinutes) || 0) : 0;

      const now = new Date();
      const firstSendAt = new Date(now.getTime() + firstDelay * 60 * 1000);

      const batchSize = 200;
      for (let i = 0; i < contactIds.length; i += batchSize) {
        const batch = contactIds.slice(i, i + batchSize);
        await prisma.$transaction(
          batch.map((contactId) => {
            const id = crypto.randomUUID();
            return prisma.portalNurtureEnrollment.upsert({
              where: { campaignId_contactId: { campaignId, contactId } },
              create: {
                id,
                ownerId,
                campaignId,
                contactId,
                status: "ACTIVE",
                stepIndex: 0,
                nextSendAt: firstSendAt,
                createdAt: now,
                updatedAt: now,
              },
              update: {
                status: "ACTIVE",
                nextSendAt: firstSendAt,
                updatedAt: now,
              },
            });
          }),
        );
      }

      return { status: 200, json: { ok: true, enrolled: contactIds.length } };
    }

    case "nurture.billing.confirm_checkout": {
      const campaignId = String(args.campaignId || "").trim();
      const sessionId = String(args.sessionId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };
      if (!sessionId) return { status: 400, json: { ok: false, error: "Missing sessionId" } };

      if (!isStripeConfigured()) {
        return { status: 400, json: { ok: false, error: "Stripe is not configured" } };
      }

      await ensurePortalNurtureSchema();

      const campaign = await prisma.portalNurtureCampaign.findFirst({ where: { ownerId, id: campaignId }, select: { id: true, installPaidAt: true } });
      if (!campaign) return { status: 404, json: { ok: false, error: "Not found" } };

      const session = await stripeGet<any>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { "expand[]": ["subscription"] });

      const metaCampaignId = String(session?.metadata?.campaignId ?? "").trim();
      const metaOwnerId = String(session?.metadata?.ownerId ?? "").trim();
      if (!metaCampaignId || metaCampaignId !== campaignId || !metaOwnerId || metaOwnerId !== ownerId) {
        return { status: 400, json: { ok: false, error: "Mismatched checkout session" } };
      }

      const paymentStatus = String(session?.payment_status ?? "");
      const status = String(session?.status ?? "");
      if (!(paymentStatus === "paid" || status === "complete")) {
        return { status: 409, json: { ok: false, error: "Checkout not complete" } };
      }

      const subId =
        typeof session?.subscription === "string"
          ? session.subscription
          : typeof session?.subscription?.id === "string"
            ? session.subscription.id
            : "";

      const kind = String(session?.metadata?.kind ?? "");
      const includeInstall = kind === "nurture_install_and_monthly";

      const now = new Date();
      await prisma.portalNurtureCampaign.updateMany({
        where: { ownerId, id: campaignId },
        data: {
          stripeSubscriptionId: subId || undefined,
          installPaidAt: includeInstall ? (campaign.installPaidAt ?? now) : campaign.installPaidAt,
          updatedAt: now,
        },
      });

      return {
        status: 200,
        json: {
          ok: true,
          stripeSubscriptionId: subId || null,
          installPaidAtIso: includeInstall ? now.toISOString() : null,
        },
      };
    }

    case "nurture.ai.generate_step": {
      const kind = args.kind === "EMAIL" ? "EMAIL" : "SMS";
      const campaignName = typeof args.campaignName === "string" ? args.campaignName.trim().slice(0, 80) : "";
      const prompt = typeof args.prompt === "string" ? args.prompt.trim().slice(0, 2000) : "";
      const existingSubject = typeof args.existingSubject === "string" ? args.existingSubject.trim().slice(0, 200) : "";
      const existingBody = typeof args.existingBody === "string" ? args.existingBody.trim().slice(0, 8000) : "";

      const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
      const needCredits = PORTAL_CREDIT_COSTS.aiDraftStep;
      const consumed = await consumeCredits(ownerId, needCredits);
      if (!consumed.ok) {
        return { status: 402, json: { ok: false, error: "INSUFFICIENT_CREDITS", code: "INSUFFICIENT_CREDITS", credits: consumed.state.balance } };
      }

      const system = kind === "SMS" ? "You write short, practical SMS follow-ups for a small business." : "You write friendly, concise follow-up emails for a small business.";

      const user = [
        "Draft the copy for a nurture campaign step.",
        businessContext ? businessContext : "",
        campaignName ? `Campaign: ${campaignName}` : "",
        `Channel: ${kind}`,
        "",
        "Allowed variables (keep braces exactly): {contact.firstName}, {contact.name}, {contact.email}, {contact.phone}, {business.name}, {owner.email}, {owner.phone}.",
        kind === "SMS" ? "Keep it under 320 characters if possible." : "",
        kind === "EMAIL" ? "Return a subject and body." : "",
        "",
        existingSubject ? `Existing subject: ${existingSubject}` : "",
        existingBody ? `Existing body: ${existingBody}` : "",
        prompt ? `Extra instruction: ${prompt}` : "",
        "",
        kind === "EMAIL"
          ? 'Prefer returning JSON: {"subject": "...", "body": "..."}. If you don\'t return JSON, start with \'Subject: ...\' on the first line.'
          : "Return the SMS body only (no JSON needed).",
      ]
        .filter(Boolean)
        .join("\n");

      const content = await generateText({ system, user });

      if (kind === "EMAIL") {
        const fromJson = tryParseJsonDraft(content);
        if (fromJson?.body || fromJson?.subject) {
          return {
            status: 200,
            json: {
              ok: true,
              subject: String(fromJson.subject || "").slice(0, 200),
              body: String(fromJson.body || "").slice(0, 8000),
            },
          };
        }

        const parsedFallback = parseSubjectBodyFallback(content);
        return {
          status: 200,
          json: {
            ok: true,
            subject: String(parsedFallback.subject || "").slice(0, 200),
            body: String(parsedFallback.body || "").slice(0, 8000),
          },
        };
      }

      return { status: 200, json: { ok: true, body: String(content || "").trim().slice(0, 8000) } };
    }

    case "ai_outbound_calls.campaigns.list": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const lite = Boolean(args?.lite);

      // Ensure can be slow if the database is locked; schema existence is best-effort here.
      await ensurePortalAiOutboundCallsSchema().catch(() => null);

      function safeRecord(raw: unknown): Record<string, unknown> {
        return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      }

      function parseCallOutcomeTagging(raw: unknown) {
        const rec = safeRecord(raw);
        return {
          enabled: Boolean(rec.enabled),
          onCompletedTagIds: normalizeTagIdList(rec.onCompletedTagIds),
          onFailedTagIds: normalizeTagIdList(rec.onFailedTagIds),
          onSkippedTagIds: normalizeTagIdList(rec.onSkippedTagIds),
        };
      }

      function parseMessageOutcomeTagging(raw: unknown) {
        const rec = safeRecord(raw);
        return {
          enabled: Boolean(rec.enabled),
          onSentTagIds: normalizeTagIdList(rec.onSentTagIds),
          onFailedTagIds: normalizeTagIdList(rec.onFailedTagIds),
          onSkippedTagIds: normalizeTagIdList(rec.onSkippedTagIds),
        };
      }

      let campaigns: Array<any> = [];
      let supportsChatKnowledgeBase = true;

      try {
        campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
          where: { ownerId },
          select: {
            id: true,
            name: true,
            status: true,
            audienceTagIdsJson: true,
            chatAudienceTagIdsJson: true,
            voiceAgentId: true,
            manualVoiceAgentId: true,
            voiceAgentConfigJson: true,
            voiceId: true,
            knowledgeBaseJson: true,
            chatKnowledgeBaseJson: true,
            chatAgentId: true,
            manualChatAgentId: true,
            chatAgentConfigJson: true,
            messageChannelPolicy: true,
            callOutcomeTaggingJson: true,
            messageOutcomeTaggingJson: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 200,
        });
      } catch {
        supportsChatKnowledgeBase = false;
        campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
          where: { ownerId },
          select: {
            id: true,
            name: true,
            status: true,
            audienceTagIdsJson: true,
            chatAudienceTagIdsJson: true,
            voiceAgentId: true,
            manualVoiceAgentId: true,
            voiceAgentConfigJson: true,
            voiceId: true,
            knowledgeBaseJson: true,
            chatAgentId: true,
            manualChatAgentId: true,
            chatAgentConfigJson: true,
            messageChannelPolicy: true,
            callOutcomeTaggingJson: true,
            messageOutcomeTaggingJson: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 200,
        });
      }

      const campaignIds = campaigns.map((c) => c.id);
      const enrollAgg = lite
        ? []
        : await (async () => {
            if (!campaignIds.length) return [];
            try {
              return await prisma.portalAiOutboundCallEnrollment.groupBy({
                by: ["campaignId", "status"],
                where: { ownerId, campaignId: { in: campaignIds } },
                _count: { _all: true },
              });
            } catch {
              return [];
            }
          })();

      const countsByCampaign = new Map<string, { queued: number; completed: number }>();
      for (const row of enrollAgg) {
        const campaignId = String((row as any).campaignId);
        const status = String((row as any).status);
        const count = Number((row as any)?._count?._all ?? 0);
        const next = countsByCampaign.get(campaignId) ?? { queued: 0, completed: 0 };
        if (status === "QUEUED") next.queued += count;
        if (status === "COMPLETED") next.completed += count;
        countsByCampaign.set(campaignId, next);
      }

      return {
        status: 200,
        json: {
          ok: true,
          campaigns: campaigns.map((c) => {
            const counts = countsByCampaign.get(String(c.id)) ?? { queued: 0, completed: 0 };
            return {
              id: c.id,
              name: c.name,
              status: c.status,
              audienceTagIds: normalizeTagIdList((c as any).audienceTagIdsJson),
              chatAudienceTagIds: normalizeTagIdList((c as any).chatAudienceTagIdsJson),
              voiceAgentId: (c as any).voiceAgentId ? String((c as any).voiceAgentId) : "",
              manualVoiceAgentId: (c as any).manualVoiceAgentId ? String((c as any).manualVoiceAgentId) : "",
              voiceAgentConfig: parseVoiceAgentConfig((c as any).voiceAgentConfigJson),
              voiceId: typeof (c as any).voiceId === "string" ? String((c as any).voiceId) : "",
              knowledgeBase: (c as any).knowledgeBaseJson ?? null,
              messagesKnowledgeBase: supportsChatKnowledgeBase ? (c as any).chatKnowledgeBaseJson ?? null : null,
              chatAgentId: (c as any).chatAgentId ? String((c as any).chatAgentId) : "",
              manualChatAgentId: (c as any).manualChatAgentId ? String((c as any).manualChatAgentId) : "",
              chatAgentConfig: parseVoiceAgentConfig((c as any).chatAgentConfigJson),
              messageChannelPolicy: String((c as any).messageChannelPolicy || "BOTH"),
              callOutcomeTagging: parseCallOutcomeTagging((c as any).callOutcomeTaggingJson),
              messageOutcomeTagging: parseMessageOutcomeTagging((c as any).messageOutcomeTaggingJson),
              createdAtIso: (c as any).createdAt.toISOString(),
              updatedAtIso: (c as any).updatedAt.toISOString(),
              enrollQueued: counts.queued,
              enrollCompleted: counts.completed,
            };
          }),
        },
      };
    }

    case "ai_outbound_calls.campaigns.create": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      await ensurePortalAiOutboundCallsSchema();

      const now = new Date();
      const id = crypto.randomUUID();
      const name = typeof args?.name === "string" && args.name.trim() ? String(args.name).trim().slice(0, 80) : "New campaign";

      await prisma.portalAiOutboundCallCampaign.create({
        data: {
          id,
          ownerId,
          name,
          status: "DRAFT",
          // Call scripts have been removed from the product; keep column non-null for legacy rows.
          script: "",
          audienceTagIdsJson: [],
          chatAudienceTagIdsJson: [],
          voiceAgentId: null,
          chatAgentId: null,
          messageChannelPolicy: "BOTH",
          createdAt: now,
          updatedAt: now,
        },
        select: { id: true },
      });

      return { status: 200, json: { ok: true, id } };
    }

    case "ai_outbound_calls.campaigns.update": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const campaignId = String(args?.campaignId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };

      await ensurePortalAiOutboundCallsSchema();

      function safeRecord(raw: unknown): Record<string, unknown> {
        return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      }

      function parseCallOutcomeTagging(raw: unknown) {
        const rec = safeRecord(raw);
        return {
          enabled: Boolean(rec.enabled),
          onCompletedTagIds: normalizeTagIdList(rec.onCompletedTagIds),
          onFailedTagIds: normalizeTagIdList(rec.onFailedTagIds),
          onSkippedTagIds: normalizeTagIdList(rec.onSkippedTagIds),
        };
      }

      function parseMessageOutcomeTagging(raw: unknown) {
        const rec = safeRecord(raw);
        return {
          enabled: Boolean(rec.enabled),
          onSentTagIds: normalizeTagIdList(rec.onSentTagIds),
          onFailedTagIds: normalizeTagIdList(rec.onFailedTagIds),
          onSkippedTagIds: normalizeTagIdList(rec.onSkippedTagIds),
        };
      }

      const existing = await prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId, id: campaignId },
        select: {
          id: true,
          voiceAgentConfigJson: true,
          chatAgentConfigJson: true,
          callOutcomeTaggingJson: true,
          messageOutcomeTaggingJson: true,
          voiceId: true,
          knowledgeBaseJson: true,
          chatKnowledgeBaseJson: true,
        },
      });
      if (!existing) return { status: 404, json: { ok: false, error: "Not found" } };

      const data: any = { updatedAt: new Date() };
      if (args.name !== undefined) data.name = String(args.name || "").trim();
      if (args.status !== undefined) data.status = args.status;
      if (args.audienceTagIds !== undefined) data.audienceTagIdsJson = normalizeTagIdList(args.audienceTagIds);
      if (args.chatAudienceTagIds !== undefined) data.chatAudienceTagIdsJson = normalizeTagIdList(args.chatAudienceTagIds);
      if (args.messageChannelPolicy !== undefined) data.messageChannelPolicy = args.messageChannelPolicy;

      if (args.voiceAgentId !== undefined) {
        const id = String(args.voiceAgentId || "").trim().slice(0, 120);
        data.voiceAgentId = id ? id : null;
      }

      if (args.manualVoiceAgentId !== undefined) {
        const id = String(args.manualVoiceAgentId || "").trim().slice(0, 120);
        data.manualVoiceAgentId = id ? id : null;
      }

      if (args.voiceId !== undefined) {
        const voiceId = String(args.voiceId || "").trim().slice(0, 200);
        data.voiceId = voiceId ? voiceId : null;
      }

      if (args.chatAgentId !== undefined) {
        const id = String(args.chatAgentId || "").trim().slice(0, 120);
        data.chatAgentId = id ? id : null;
      }

      if (args.manualChatAgentId !== undefined) {
        const id = String(args.manualChatAgentId || "").trim().slice(0, 120);
        data.manualChatAgentId = id ? id : null;
      }

      if (args.voiceAgentConfig !== undefined) {
        const base = parseVoiceAgentConfig((existing as any).voiceAgentConfigJson);
        const patch = args.voiceAgentConfig || {};

        const next = {
          ...base,
          ...(patch.firstMessage !== undefined ? { firstMessage: String(patch.firstMessage || "").trim().slice(0, 360) } : {}),
          ...(patch.goal !== undefined ? { goal: String(patch.goal || "").trim().slice(0, 6000) } : {}),
          ...(patch.personality !== undefined ? { personality: String(patch.personality || "").trim().slice(0, 6000) } : {}),
          ...(patch.environment !== undefined ? { environment: String(patch.environment || "").trim().slice(0, 6000) } : {}),
          ...(patch.tone !== undefined ? { tone: String(patch.tone || "").trim().slice(0, 6000) } : {}),
          ...(patch.guardRails !== undefined ? { guardRails: String(patch.guardRails || "").trim().slice(0, 6000) } : {}),
          ...(patch.toolKeys !== undefined ? { toolKeys: normalizeToolKeyList(patch.toolKeys) } : {}),
          ...(patch.toolIds !== undefined ? { toolIds: normalizeToolIdList(patch.toolIds) } : {}),
        };

        data.voiceAgentConfigJson = next as any;
      }

      if (args.knowledgeBase !== undefined) {
        const baseRec = safeRecord((existing as any).knowledgeBaseJson);
        const base = {
          version: 1,
          seedUrl: typeof baseRec.seedUrl === "string" ? String(baseRec.seedUrl).trim().slice(0, 500) : "",
          crawlDepth:
            typeof baseRec.crawlDepth === "number" && Number.isFinite(baseRec.crawlDepth)
              ? Math.max(0, Math.min(3, Math.floor(baseRec.crawlDepth)))
              : 0,
          maxUrls:
            typeof baseRec.maxUrls === "number" && Number.isFinite(baseRec.maxUrls)
              ? Math.max(0, Math.min(100, Math.floor(baseRec.maxUrls)))
              : 0,
          text: typeof baseRec.text === "string" ? String(baseRec.text).trim().slice(0, 20000) : "",
          locators: Array.isArray(baseRec.locators) ? baseRec.locators : [],
        };

        const patch = args.knowledgeBase || {};
        const next = {
          ...base,
          ...(patch.seedUrl !== undefined ? { seedUrl: String(patch.seedUrl || "").trim().slice(0, 500) } : {}),
          ...(patch.crawlDepth !== undefined ? { crawlDepth: patch.crawlDepth } : {}),
          ...(patch.maxUrls !== undefined ? { maxUrls: patch.maxUrls } : {}),
          ...(patch.text !== undefined ? { text: String(patch.text || "").trim().slice(0, 20000) } : {}),
          ...(patch.locators !== undefined ? { locators: Array.isArray(patch.locators) ? patch.locators.slice(0, 200) : [] } : {}),
          updatedAtIso: new Date().toISOString(),
        };

        data.knowledgeBaseJson = next as any;
      }

      if (args.messagesKnowledgeBase !== undefined) {
        const baseRec = safeRecord((existing as any).chatKnowledgeBaseJson);
        const base = {
          version: 1,
          seedUrl: typeof baseRec.seedUrl === "string" ? String(baseRec.seedUrl).trim().slice(0, 500) : "",
          crawlDepth:
            typeof baseRec.crawlDepth === "number" && Number.isFinite(baseRec.crawlDepth)
              ? Math.max(0, Math.min(3, Math.floor(baseRec.crawlDepth)))
              : 0,
          maxUrls:
            typeof baseRec.maxUrls === "number" && Number.isFinite(baseRec.maxUrls)
              ? Math.max(0, Math.min(100, Math.floor(baseRec.maxUrls)))
              : 0,
          text: typeof baseRec.text === "string" ? String(baseRec.text).trim().slice(0, 20000) : "",
          locators: Array.isArray(baseRec.locators) ? baseRec.locators : [],
        };

        const patch = args.messagesKnowledgeBase || {};
        const next = {
          ...base,
          ...(patch.seedUrl !== undefined ? { seedUrl: String(patch.seedUrl || "").trim().slice(0, 500) } : {}),
          ...(patch.crawlDepth !== undefined ? { crawlDepth: patch.crawlDepth } : {}),
          ...(patch.maxUrls !== undefined ? { maxUrls: patch.maxUrls } : {}),
          ...(patch.text !== undefined ? { text: String(patch.text || "").trim().slice(0, 20000) } : {}),
          ...(patch.locators !== undefined ? { locators: Array.isArray(patch.locators) ? patch.locators.slice(0, 200) : [] } : {}),
          updatedAtIso: new Date().toISOString(),
        };

        data.chatKnowledgeBaseJson = next as any;
      }

      if (args.chatAgentConfig !== undefined) {
        const base = parseVoiceAgentConfig((existing as any).chatAgentConfigJson);
        const patch = args.chatAgentConfig || {};

        const next = {
          ...base,
          ...(patch.firstMessage !== undefined ? { firstMessage: String(patch.firstMessage || "").trim().slice(0, 360) } : {}),
          ...(patch.goal !== undefined ? { goal: String(patch.goal || "").trim().slice(0, 6000) } : {}),
          ...(patch.personality !== undefined ? { personality: String(patch.personality || "").trim().slice(0, 6000) } : {}),
          ...(patch.environment !== undefined ? { environment: String(patch.environment || "").trim().slice(0, 6000) } : {}),
          ...(patch.tone !== undefined ? { tone: String(patch.tone || "").trim().slice(0, 6000) } : {}),
          ...(patch.guardRails !== undefined ? { guardRails: String(patch.guardRails || "").trim().slice(0, 6000) } : {}),
          ...(patch.toolKeys !== undefined ? { toolKeys: normalizeToolKeyList(patch.toolKeys) } : {}),
          ...(patch.toolIds !== undefined ? { toolIds: normalizeToolIdList(patch.toolIds) } : {}),
        };

        data.chatAgentConfigJson = next as any;
      }

      if (args.callOutcomeTagging !== undefined) {
        const base = parseCallOutcomeTagging((existing as any).callOutcomeTaggingJson);
        const patch = args.callOutcomeTagging || {};

        const next = {
          ...base,
          ...(patch.enabled !== undefined ? { enabled: Boolean(patch.enabled) } : {}),
          ...(patch.onCompletedTagIds !== undefined ? { onCompletedTagIds: normalizeTagIdList(patch.onCompletedTagIds) } : {}),
          ...(patch.onFailedTagIds !== undefined ? { onFailedTagIds: normalizeTagIdList(patch.onFailedTagIds) } : {}),
          ...(patch.onSkippedTagIds !== undefined ? { onSkippedTagIds: normalizeTagIdList(patch.onSkippedTagIds) } : {}),
        };

        data.callOutcomeTaggingJson = next as any;
      }

      if (args.messageOutcomeTagging !== undefined) {
        const base = parseMessageOutcomeTagging((existing as any).messageOutcomeTaggingJson);
        const patch = args.messageOutcomeTagging || {};

        const next = {
          ...base,
          ...(patch.enabled !== undefined ? { enabled: Boolean(patch.enabled) } : {}),
          ...(patch.onSentTagIds !== undefined ? { onSentTagIds: normalizeTagIdList(patch.onSentTagIds) } : {}),
          ...(patch.onFailedTagIds !== undefined ? { onFailedTagIds: normalizeTagIdList(patch.onFailedTagIds) } : {}),
          ...(patch.onSkippedTagIds !== undefined ? { onSkippedTagIds: normalizeTagIdList(patch.onSkippedTagIds) } : {}),
        };

        data.messageOutcomeTaggingJson = next as any;
      }

      await prisma.portalAiOutboundCallCampaign.update({
        where: { id: campaignId },
        data,
        select: { id: true },
      });

      return { status: 200, json: { ok: true } };
    }

    case "ai_outbound_calls.campaigns.activity.get": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const campaignId = String(args?.campaignId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };

      await ensurePortalAiOutboundCallsSchema();

      const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId, id: campaignId },
        select: { id: true },
      });
      if (!campaign) return { status: 404, json: { ok: false, error: "Not found" } };

      const agg = await prisma.portalAiOutboundCallEnrollment.groupBy({
        by: ["status"],
        where: { ownerId, campaignId },
        _count: { _all: true },
      });

      const counts = { queued: 0, calling: 0, completed: 0, failed: 0, skipped: 0 };
      for (const row of agg) {
        const status = String((row as any).status || "");
        const count = Number((row as any)?._count?._all ?? 0);
        if (status === "QUEUED") counts.queued += count;
        if (status === "CALLING") counts.calling += count;
        if (status === "COMPLETED") counts.completed += count;
        if (status === "FAILED") counts.failed += count;
        if (status === "SKIPPED") counts.skipped += count;
      }

      const recent = await prisma.portalAiOutboundCallEnrollment.findMany({
        where: { ownerId, campaignId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 60,
        select: {
          id: true,
          status: true,
          nextCallAt: true,
          callSid: true,
          attemptCount: true,
          lastError: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          contact: { select: { id: true, name: true, phone: true, email: true } },
        },
      });

      return {
        status: 200,
        json: {
          ok: true,
          counts,
          recent: recent.map((e) => ({
            id: e.id,
            status: e.status,
            attemptCount: e.attemptCount,
            lastError: e.lastError,
            callSid: e.callSid,
            nextCallAtIso: e.nextCallAt ? e.nextCallAt.toISOString() : null,
            completedAtIso: e.completedAt ? e.completedAt.toISOString() : null,
            createdAtIso: e.createdAt.toISOString(),
            updatedAtIso: e.updatedAt.toISOString(),
            contact: {
              id: e.contact.id,
              name: e.contact.name,
              phone: e.contact.phone,
              email: e.contact.email,
            },
          })),
        },
      };
    }

    case "ai_outbound_calls.campaigns.messages_activity.get": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const campaignId = String(args?.campaignId || "").trim();
      if (!campaignId) return { status: 400, json: { ok: false, error: "Missing campaignId" } };
      const take = typeof args?.take === "number" && Number.isFinite(args.take) ? Math.max(1, Math.min(60, Math.floor(args.take))) : 60;

      await ensurePortalAiOutboundCallsSchema();

      const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId, id: campaignId },
        select: { id: true },
      });
      if (!campaign) return { status: 404, json: { ok: false, error: "Not found" } };

      const [statusAgg, sourceAgg, recent] = await Promise.all([
        prisma.portalAiOutboundMessageEnrollment.groupBy({
          by: ["status"],
          where: { ownerId, campaignId: campaign.id },
          _count: { _all: true },
        }),
        prisma.portalAiOutboundMessageEnrollment.groupBy({
          by: ["source"],
          where: { ownerId, campaignId: campaign.id },
          _count: { _all: true },
        }),
        prisma.portalAiOutboundMessageEnrollment.findMany({
          where: { ownerId, campaignId: campaign.id },
          select: {
            id: true,
            status: true,
            source: true,
            nextSendAt: true,
            sentFirstMessageAt: true,
            threadId: true,
            attemptCount: true,
            lastError: true,
            nextReplyAt: true,
            replyAttemptCount: true,
            replyLastError: true,
            updatedAt: true,
            createdAt: true,
            contact: { select: { id: true, name: true, email: true, phone: true } },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take,
        }),
      ]);

      const countsByStatus: Record<string, number> = {};
      for (const row of statusAgg) {
        countsByStatus[String((row as any).status)] = Number((row as any)?._count?._all ?? 0);
      }

      const countsBySource: Record<string, number> = {};
      for (const row of sourceAgg) {
        countsBySource[String((row as any).source)] = Number((row as any)?._count?._all ?? 0);
      }

      return {
        status: 200,
        json: {
          ok: true,
          countsByStatus,
          countsBySource,
          recent: recent.map((e) => ({
            id: String(e.id),
            status: String(e.status),
            source: String((e as any).source || "TAG"),
            nextSendAtIso: e.nextSendAt ? e.nextSendAt.toISOString() : null,
            sentFirstMessageAtIso: e.sentFirstMessageAt ? e.sentFirstMessageAt.toISOString() : null,
            threadId: e.threadId ? String(e.threadId) : null,
            attemptCount: Number((e as any).attemptCount || 0),
            lastError: (e as any).lastError ? String((e as any).lastError) : null,
            nextReplyAtIso: e.nextReplyAt ? e.nextReplyAt.toISOString() : null,
            replyAttemptCount: Number((e as any).replyAttemptCount || 0),
            replyLastError: (e as any).replyLastError ? String((e as any).replyLastError) : null,
            createdAtIso: e.createdAt.toISOString(),
            updatedAtIso: e.updatedAt.toISOString(),
            contact: e.contact
              ? {
                  id: String(e.contact.id),
                  name: e.contact.name ? String(e.contact.name) : null,
                  email: e.contact.email ? String(e.contact.email) : null,
                  phone: e.contact.phone ? String(e.contact.phone) : null,
                }
              : null,
          })),
        },
      };
    }

    case "ai_outbound_calls.contacts.search": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const q = typeof args?.q === "string" ? String(args.q).trim().slice(0, 80) : "";
      const take = typeof args?.take === "number" && Number.isFinite(args.take) ? Math.max(1, Math.min(20, Math.floor(args.take))) : 20;

      if (!q || q.length < 2) {
        return { status: 200, json: { ok: true, contacts: [] } };
      }

      const contacts = await prisma.portalContact.findMany({
        where: {
          ownerId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        },
        select: { id: true, name: true, email: true, phone: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take,
      });

      return {
        status: 200,
        json: {
          ok: true,
          contacts: contacts.map((c) => ({
            id: String(c.id),
            name: c.name ? String(c.name) : null,
            email: c.email ? String(c.email) : null,
            phone: c.phone ? String(c.phone) : null,
          })),
        },
      };
    }

    case "ai_outbound_calls.manual_calls.list": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const campaignId = typeof args?.campaignId === "string" ? String(args.campaignId).trim() : "";
      const reconcileTwilio = Boolean(args?.reconcileTwilio);

      await ensurePortalAiOutboundCallsSchema();

      const rows = await prisma.portalAiOutboundCallManualCall.findMany({
        where: {
          ownerId,
          ...(campaignId ? { campaignId } : {}),
        },
        select: {
          id: true,
          campaignId: true,
          toNumberE164: true,
          status: true,
          callSid: true,
          conversationId: true,
          recordingSid: true,
          recordingDurationSec: true,
          transcriptText: true,
          lastError: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 20,
      });

      async function fetchTwilioCallStatus(callSid: string): Promise<string | null> {
        const sid = String(callSid || "").trim();
        if (!sid) return null;

        const config = await getOwnerTwilioSmsConfig(ownerId);
        if (!config) return null;

        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
        const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

        const res = await fetch(url, { method: "GET", headers: { authorization: `Basic ${basic}` } }).catch(() => null as any);
        if (!res?.ok) return null;
        const text = await res.text().catch(() => "");

        try {
          const json = JSON.parse(text) as any;
          const status = typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";
          return status || null;
        } catch {
          return null;
        }
      }

      function mapTwilioToManualStatus(twilioStatus: string): "CALLING" | "COMPLETED" | "FAILED" {
        const s = String(twilioStatus || "").trim().toLowerCase();
        if (s === "completed") return "COMPLETED";
        if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";
        return "CALLING";
      }

      let statusMap = new Map<string, "COMPLETED" | "FAILED">();
      if (reconcileTwilio) {
        const now = Date.now();
        const toCheck = rows
          .filter((r) => r.status === "CALLING" && typeof (r as any).callSid === "string" && String((r as any).callSid).trim())
          .filter((r) => now - r.updatedAt.getTime() > 90_000)
          .slice(0, 3);

        const resolvedStatuses = await Promise.all(
          toCheck.map(async (r) => {
            const twStatus = await fetchTwilioCallStatus(String((r as any).callSid || ""));
            if (!twStatus) return null;
            const mapped = mapTwilioToManualStatus(twStatus);
            if (mapped === "CALLING") return null;

            await prisma.portalAiOutboundCallManualCall
              .update({
                where: { id: r.id },
                data: {
                  status: mapped,
                  ...(mapped === "FAILED" ? { lastError: `Call status: ${twStatus}`.slice(0, 500) } : {}),
                },
                select: { id: true },
              })
              .catch(() => null);

            return { id: r.id, status: mapped as "COMPLETED" | "FAILED" };
          }),
        );

        statusMap = new Map(resolvedStatuses.filter(Boolean).map((x: any) => [x.id, x.status] as const));
      }

      return {
        status: 200,
        json: {
          ok: true,
          manualCalls: rows.map((r) => ({
            ...(r as any),
            ...(statusMap.has(r.id) ? { status: statusMap.get(r.id) } : {}),
            createdAtIso: r.createdAt.toISOString(),
            updatedAtIso: r.updatedAt.toISOString(),
          })),
        },
      };
    }

    case "ai_outbound_calls.manual_calls.get": {
      if (!(await requireOwnerOrAdmin())) return { status: 403, json: { ok: false, error: "Forbidden" } };

      const id = String(args?.id || "").trim();
      if (!id) return { status: 400, json: { ok: false, error: "Missing id" } };
      const reconcileTwilio = Boolean(args?.reconcileTwilio);

      await ensurePortalAiOutboundCallsSchema();

      const row = await prisma.portalAiOutboundCallManualCall.findFirst({
        where: { ownerId, id },
        select: {
          id: true,
          campaignId: true,
          toNumberE164: true,
          status: true,
          callSid: true,
          conversationId: true,
          recordingSid: true,
          recordingDurationSec: true,
          transcriptText: true,
          lastError: true,
          webhookToken: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!row) return { status: 404, json: { ok: false, error: "Not found" } };

      async function fetchTwilioCallStatus(callSid: string): Promise<string | null> {
        const sid = String(callSid || "").trim();
        if (!sid) return null;

        const config = await getOwnerTwilioSmsConfig(ownerId);
        if (!config) return null;

        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
        const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

        const res = await fetch(url, { method: "GET", headers: { authorization: `Basic ${basic}` } }).catch(() => null as any);
        if (!res?.ok) return null;
        const text = await res.text().catch(() => "");

        try {
          const json = JSON.parse(text) as any;
          const status = typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";
          return status || null;
        } catch {
          return null;
        }
      }

      function mapTwilioToManualStatus(twilioStatus: string): "CALLING" | "COMPLETED" | "FAILED" {
        const s = String(twilioStatus || "").trim().toLowerCase();
        if (s === "completed") return "COMPLETED";
        if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";
        return "CALLING";
      }

      if (reconcileTwilio && row.status === "CALLING" && typeof (row as any).callSid === "string" && String((row as any).callSid).trim()) {
        const twStatus = await fetchTwilioCallStatus(String((row as any).callSid));
        if (twStatus) {
          const mapped = mapTwilioToManualStatus(twStatus);
          if (mapped !== "CALLING") {
            await prisma.portalAiOutboundCallManualCall
              .update({
                where: { id: row.id },
                data: {
                  status: mapped,
                  ...(mapped === "FAILED" ? { lastError: `Call status: ${twStatus}`.slice(0, 500) } : {}),
                },
                select: { id: true },
              })
              .catch(() => null);

            (row as any).status = mapped;
          }
        }
      }

      return {
        status: 200,
        json: {
          ok: true,
          manualCall: {
            ...(row as any),
            createdAtIso: row.createdAt.toISOString(),
            updatedAtIso: row.updatedAt.toISOString(),
          },
        },
      };
    }

    case "media.folder.ensure": {
      const name = sanitizeHumanName(args.name, 120);
      if (!name) return { status: 400, json: { ok: false, error: "Invalid folder name" } };
      const parentId = typeof args.parentId === "string" && args.parentId.trim() ? String(args.parentId).trim() : null;
      const color = typeof args.color === "string" && args.color.trim() ? String(args.color).trim().slice(0, 32) : null;

      if (parentId) {
        const parent = await (prisma as any).portalMediaFolder.findFirst({ where: { id: parentId, ownerId }, select: { id: true } });
        if (!parent) return { status: 404, json: { ok: false, error: "Parent folder not found" } };
      }

      const nameKey = normalizeNameKey(name);
      const existing = await (prisma as any).portalMediaFolder.findFirst({ where: { ownerId, parentId, nameKey }, select: { id: true, publicToken: true } });
      if (existing) {
        return { status: 200, json: { ok: true, folderId: existing.id, shareUrl: `/media/f/${existing.id}/${existing.publicToken}` } };
      }

      const tag = await newUniqueMediaFolderTag(ownerId);
      const created = await (prisma as any).portalMediaFolder.create({
        data: { ownerId, parentId, name, nameKey, tag, publicToken: newPublicToken(), color },
        select: { id: true, publicToken: true },
      });

      return { status: 200, json: { ok: true, folderId: created.id, shareUrl: `/media/f/${created.id}/${created.publicToken}` } };
    }

    case "media.items.move": {
      const itemIds = Array.isArray(args.itemIds) ? (args.itemIds as unknown[]).filter((x) => typeof x === "string").map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
      if (!itemIds.length) return { status: 400, json: { ok: false, error: "Missing itemIds" } };

      let folderId = typeof args.folderId === "string" && args.folderId.trim() ? String(args.folderId).trim() : null;
      const folderName = typeof args.folderName === "string" && args.folderName.trim() ? sanitizeHumanName(args.folderName, 120) : null;
      const parentId = typeof args.parentId === "string" && args.parentId.trim() ? String(args.parentId).trim() : null;

      if (!folderId && folderName) {
        const ensured = await runDirectAction({ action: "media.folder.ensure", ownerId, actorUserId, args: { name: folderName, parentId } } as any);
        if (!ensured.json?.ok || !ensured.json?.folderId) return { status: ensured.status, json: ensured.json };
        folderId = String(ensured.json.folderId);
      }

      if (folderId) {
        const folder = await (prisma as any).portalMediaFolder.findFirst({ where: { id: folderId, ownerId }, select: { id: true } });
        if (!folder) return { status: 404, json: { ok: false, error: "Folder not found" } };
      }

      const updated = await (prisma as any).portalMediaItem.updateMany({
        where: { ownerId, id: { in: itemIds } },
        data: { folderId },
      });

      return { status: 200, json: { ok: true, moved: updated?.count ?? itemIds.length, folderId } };
    }

    case "media.import_remote_image": {
      const urlRaw = typeof args.url === "string" ? args.url.trim() : "";
      if (!urlRaw) return { status: 400, json: { ok: false, error: "Missing url" } };

      const u = new URL(urlRaw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return { status: 400, json: { ok: false, error: "Invalid URL" } };

      let folderId = typeof args.folderId === "string" && args.folderId.trim() ? String(args.folderId).trim() : null;
      const folderName = typeof args.folderName === "string" && args.folderName.trim() ? sanitizeHumanName(args.folderName, 120) : null;
      const parentId = typeof args.parentId === "string" && args.parentId.trim() ? String(args.parentId).trim() : null;
      if (!folderId && folderName) {
        const ensured = await runDirectAction({ action: "media.folder.ensure", ownerId, actorUserId, args: { name: folderName, parentId } } as any);
        if (!ensured.json?.ok || !ensured.json?.folderId) return { status: ensured.status, json: ensured.json };
        folderId = String(ensured.json.folderId);
      }

      const resp = await fetch(u.toString(), { headers: { "user-agent": "purelyautomation/portal-media-import" } }).catch(() => null);
      if (!resp || !resp.ok) return { status: 502, json: { ok: false, error: "Failed to download" } };

      const contentType = String(resp.headers.get("content-type") || "application/octet-stream").slice(0, 120);
      const arrayBuffer = await resp.arrayBuffer();
      const bytes = Buffer.from(arrayBuffer);
      if (bytes.length > MAX_REMOTE_MEDIA_BYTES) {
        return { status: 400, json: { ok: false, error: `File too large (max ${Math.floor(MAX_REMOTE_MEDIA_BYTES / (1024 * 1024))}MB)` } };
      }
      if (!contentType.startsWith("image/")) {
        return { status: 400, json: { ok: false, error: "Only images are supported" } };
      }

      const nameFromUrl = (() => {
        const last = u.pathname.split("/").filter(Boolean).pop() || "image";
        try {
          return decodeURIComponent(last);
        } catch {
          return last;
        }
      })();
      const fileNameRaw = sanitizeHumanName(args.fileName, 240) || nameFromUrl || "image";
      const fileName = safeFilename(fileNameRaw);
      const mimeType = normalizeMimeType(contentType, fileName);

      const item = await mirrorUploadToMediaLibrary({ ownerId, folderId, fileName, mimeType, bytes });
      if (!item) return { status: 500, json: { ok: false, error: "Import failed" } };
      return { status: 200, json: { ok: true, item } };
    }

    case "dashboard.reset": {
      const scope = args.scope === "embedded" ? "embedded" : "default";
      const data = await resetPortalDashboard(ownerId, scope);
      return { status: 200, json: { ok: true, scope, data } };
    }

    case "dashboard.add_widget": {
      const scope = args.scope === "embedded" ? "embedded" : "default";
      const idRaw = typeof args.widgetId === "string" ? args.widgetId.trim() : "";
      if (!isDashboardWidgetId(idRaw)) return { status: 400, json: { ok: false, error: "Unknown widget" } };
      const data = await addPortalDashboardWidget(ownerId, scope, idRaw);
      return { status: 200, json: { ok: true, scope, widgetId: idRaw, data } };
    }

    case "dashboard.remove_widget": {
      const scope = args.scope === "embedded" ? "embedded" : "default";
      const idRaw = typeof args.widgetId === "string" ? args.widgetId.trim() : "";
      if (!isDashboardWidgetId(idRaw)) return { status: 400, json: { ok: false, error: "Unknown widget" } };
      const data = await removePortalDashboardWidget(ownerId, scope, idRaw);
      return { status: 200, json: { ok: true, scope, widgetId: idRaw, data } };
    }

    case "dashboard.optimize": {
      const scope = args.scope === "embedded" ? "embedded" : "default";
      const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { industry: true, businessModel: true } }).catch(() => null);
      const niche = sanitizeHumanName(args.niche, 120) || sanitizeHumanName(profile?.industry, 120) || sanitizeHumanName(profile?.businessModel, 120) || "";

      const widgetIds = dashboardWidgetsForNiche(niche);
      const data = await savePortalDashboardData(ownerId, scope, { version: 1, widgets: widgetIds.map((id) => ({ id })), layout: simpleDashboardLayout(widgetIds) } as any);
      return { status: 200, json: { ok: true, scope, niche: niche || null, data } };
    }
  }
}

function resultMarkdown(action: PortalAgentActionKey, json: any): { markdown: string; linkUrl?: string } {
  if (action === "tasks.create" && json?.ok && json?.taskId) {
    return {
      markdown: `Created a task.\n\n[Open tasks](/portal/app/tasks)`,
      linkUrl: "/portal/app/tasks",
    };
  }

  if (action === "funnel.create" && json?.ok && json?.funnel?.id) {
    const id = String(json.funnel.id);
    const url = `/portal/app/services/funnel-builder/funnels/${encodeURIComponent(id)}/edit`;
    return {
      markdown: `Created a funnel.\n\n[Open funnel editor](${url})`,
      linkUrl: url,
    };
  }

  if (action === "blogs.generate_now" && json?.ok && json?.postId) {
    return {
      markdown: `Generated a blog draft.\n\n[Open blogs](/portal/app/services/blogs)`,
      linkUrl: "/portal/app/services/blogs",
    };
  }

  if (action === "newsletter.generate_now" && json?.ok && json?.newsletterId) {
    return {
      markdown: `Generated a newsletter draft.\n\n[Open newsletter](/portal/app/services/newsletter)`,
      linkUrl: "/portal/app/services/newsletter",
    };
  }

  if (action === "automations.run" && json?.ok) {
    return {
      markdown: `Triggered the automation run.\n\n[Open automations](/portal/app/services/automations)`,
      linkUrl: "/portal/app/services/automations",
    };
  }

  if (action === "automations.create" && json?.ok && json?.automationId) {
    return {
      markdown: `Created an automation.\n\n[Open automations](/portal/app/services/automations)`,
      linkUrl: "/portal/app/services/automations",
    };
  }

  if (action === "contacts.list" && json?.ok) {
    const rows = Array.isArray(json.contacts) ? (json.contacts as any[]) : [];
    const lines = rows.slice(0, 20).map((c) => {
      const name = String(c?.name || "").trim() || "(No name)";
      const email = String(c?.email || "").trim();
      const phone = String(c?.phone || "").trim();
      const bits = [email, phone].filter(Boolean).join(" · ");
      return `- ${name}${bits ? ` (${bits})` : ""}`;
    });
    return {
      markdown: rows.length ? `Here are your recent contacts:\n\n${lines.join("\n")}` : "No contacts yet.",
    };
  }

  if (action === "contacts.create" && json?.ok && json?.contactId) {
    return {
      markdown: `Created the contact.\n\n[Open people](/portal/app/people)`,
      linkUrl: "/portal/app/people",
    };
  }

  if ((action === "people.users.list" || action === "people.contacts.custom_variable_keys.get") && json?.ok) {
    return {
      markdown: `Done.\n\n[Open people](/portal/app/people)`,
      linkUrl: "/portal/app/people",
    };
  }

  if (
    (action === "people.users.invite" ||
      action === "people.users.update" ||
      action === "people.users.delete" ||
      action === "people.leads.update" ||
      action === "people.contacts.duplicates.get" ||
      action === "people.contacts.merge" ||
      action === "people.contacts.custom_variables.patch") &&
    json?.ok
  ) {
    return {
      markdown: `Saved.\n\n[Open people](/portal/app/people)`,
      linkUrl: "/portal/app/people",
    };
  }

  if (action === "inbox.send_sms" && json?.ok) {
    return {
      markdown: `Sent the text.\n\n[Open Inbox](/portal/app/services/inbox/sms)`,
      linkUrl: "/portal/app/services/inbox/sms",
    };
  }

  if (action === "inbox.send_email" && json?.ok) {
    return {
      markdown: `Sent the email.\n\n[Open Inbox](/portal/app/services/inbox/email)`,
      linkUrl: "/portal/app/services/inbox/email",
    };
  }

  if ((action === "reviews.send_request_for_booking" || action === "reviews.send_request_for_contact") && json?.ok) {
    return {
      markdown: `Sent the review request.\n\n[Open reviews](/portal/app/services/reviews)`,
      linkUrl: "/portal/app/services/reviews",
    };
  }

  if (action === "reviews.reply" && json?.ok) {
    return {
      markdown: `Saved your review reply.\n\n[Open reviews](/portal/app/services/reviews)`,
      linkUrl: "/portal/app/services/reviews",
    };
  }

  if ((action === "reviews.settings.get" || action === "reviews.settings.update") && json?.ok) {
    return {
      markdown: `Review request settings ready.\n\n[Open reviews](/portal/app/services/reviews)`,
      linkUrl: "/portal/app/services/reviews",
    };
  }

  if ((action === "reviews.site.get" || action === "reviews.site.update") && json?.ok) {
    const slug = typeof json?.site?.slug === "string" ? json.site.slug : null;
    return {
      markdown: `Hosted reviews site ready${slug ? ` (slug: ${slug})` : ""}.\n\n[Open reviews](/portal/app/services/reviews)`,
      linkUrl: "/portal/app/services/reviews",
    };
  }

  if (action === "reviews.inbox.list" && json?.ok) {
    const rows = Array.isArray(json.reviews) ? (json.reviews as any[]) : [];
    return {
      markdown: `Fetched ${rows.length} review${rows.length === 1 ? "" : "s"}.\n\n[Open reviews](/portal/app/services/reviews)`,
      linkUrl: "/portal/app/services/reviews",
    };
  }

  if ((action === "reviews.archive" || action === "reviews.questions.answer") && json?.ok) {
    return {
      markdown: `Saved.\n\n[Open reviews](/portal/app/services/reviews)`,
      linkUrl: "/portal/app/services/reviews",
    };
  }

  if (
    (action === "reviews.bookings.list" ||
      action === "reviews.contacts.search" ||
      action === "reviews.events.list" ||
      action === "reviews.handle.get" ||
      action === "reviews.questions.list") &&
    json?.ok
  ) {
    return {
      markdown: `Done.\n\n[Open reviews](/portal/app/services/reviews)`,
      linkUrl: "/portal/app/services/reviews",
    };
  }

  if (action === "tasks.create_for_all" && json?.ok) {
    const count = typeof json.count === "number" ? json.count : null;
    return {
      markdown: `Created ${count ?? ""} tasks for your team.\n\n[Open tasks](/portal/app/tasks)`.replace(/\s+/g, " ").trim(),
      linkUrl: "/portal/app/tasks",
    };
  }

  if (action === "booking.calendar.create" && json?.ok) {
    return {
      markdown: `Created a booking calendar.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
  }

  if (action === "booking.calendars.get" && json?.ok) {
    return {
      markdown: `Fetched your booking calendars settings.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
  }

  if (action === "booking.calendars.update" && json?.ok) {
    return {
      markdown: `Updated your booking calendars.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
  }

  if ((action === "booking.settings.get" || action === "booking.settings.update") && json?.ok) {
    const slug = typeof json?.site?.slug === "string" ? json.site.slug : null;
    return {
      markdown: `Booking settings ready${slug ? ` (slug: ${slug})` : ""}.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
  }

  if ((action === "booking.form.get" || action === "booking.form.update") && json?.ok) {
    return {
      markdown: `Booking form settings saved.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
  }

  if ((action === "booking.site.get" || action === "booking.site.update") && json?.ok) {
    return {
      markdown: `Booking public site settings saved.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
  }

  if (action === "booking.suggestions.slots" && json?.ok) {
    const slots = Array.isArray(json.slots) ? (json.slots as any[]) : [];
    const lines = slots.slice(0, 10).map((s) => {
      const startAt = s?.startAt ? String(s.startAt) : "";
      const endAt = s?.endAt ? String(s.endAt) : "";
      return `- ${startAt}${endAt ? ` → ${endAt}` : ""}`;
    });
    return {
      markdown: slots.length ? `Here are available slot suggestions:\n\n${lines.join("\n")}` : "No available slots found in that window.",
    };
  }

  if ((action === "booking.reminders.settings.get" || action === "booking.reminders.settings.update") && json?.ok) {
    return {
      markdown: `Appointment reminder settings saved.\n\n[Open reminders](/portal/app/services/booking/reminders)`,
      linkUrl: "/portal/app/services/booking/reminders",
    };
  }

  if (action === "booking.reminders.ai.generate_step" && json?.ok) {
    const subject = typeof json.subject === "string" ? json.subject.trim() : "";
    const body = typeof json.body === "string" ? json.body.trim() : "";

    if (subject || body) {
      return {
        markdown: [
          subject ? "Drafted reminder email copy:" : "Drafted reminder copy:",
          subject ? "" : null,
          subject ? `Subject: ${subject}` : null,
          body ? "" : null,
          body ? body : null,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    return { markdown: "Drafted the reminder step copy." };
  }

  if (action === "booking.bookings.list" && json?.ok) {
    const upcoming = Array.isArray(json.upcoming) ? (json.upcoming as any[]) : [];
    const recent = Array.isArray(json.recent) ? (json.recent as any[]) : [];

    const fmt = (d: any) => {
      try {
        return new Date(d).toLocaleString();
      } catch {
        return String(d || "");
      }
    };

    const linesUpcoming = upcoming.slice(0, 10).map((b) => {
      const when = b?.startAt ? fmt(b.startAt) : "(no time)";
      const name = String(b?.contactName || "").trim() || "(No name)";
      const id = String(b?.id || "").trim();
      return `- ${when} — ${name}${id ? ` (bookingId: ${id})` : ""}`;
    });

    const linesRecent = recent.slice(0, 6).map((b) => {
      const when = b?.startAt ? fmt(b.startAt) : "(no time)";
      const name = String(b?.contactName || "").trim() || "(No name)";
      const status = String(b?.status || "").trim();
      const id = String(b?.id || "").trim();
      return `- ${when} — ${name}${status ? ` [${status}]` : ""}${id ? ` (bookingId: ${id})` : ""}`;
    });

    return {
      markdown: [
        upcoming.length ? "Upcoming bookings:" : "No upcoming bookings.",
        upcoming.length ? "" : null,
        upcoming.length ? linesUpcoming.join("\n") : null,
        "",
        recent.length ? "Recent bookings:" : "No recent bookings.",
        recent.length ? "" : null,
        recent.length ? linesRecent.join("\n") : null,
        "\n[Open booking](/portal/app/services/booking)",
      ]
        .filter(Boolean)
        .join("\n"),
      linkUrl: "/portal/app/services/booking",
    };
  }

  if (action === "booking.cancel" && json?.ok) {
    return {
      markdown: `Canceled the booking.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
  }

  if (action === "booking.reschedule" && json?.ok) {
    const url = typeof json.rescheduleUrl === "string" && json.rescheduleUrl.trim() ? json.rescheduleUrl.trim() : null;
    return {
      markdown: [
        "Rescheduled the booking.",
        url ? "" : null,
        url ? `Customer reschedule link: ${url}` : null,
        "\n[Open booking](/portal/app/services/booking)",
      ]
        .filter(Boolean)
        .join("\n"),
      linkUrl: "/portal/app/services/booking",
    };
  }

  if (action === "booking.contact" && json?.ok) {
    const sent = json?.sent && typeof json.sent === "object" ? json.sent : null;
    const email = Boolean((sent as any)?.email);
    const sms = Boolean((sent as any)?.sms);
    const channels = [email ? "email" : null, sms ? "text" : null].filter(Boolean).join(" + ") || "message";
    return {
      markdown: `Sent the booking follow-up via ${channels}.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
  }

  if (action === "media.folder.ensure" && json?.ok && json?.folderId) {
    return {
      markdown: `Ready.\n\n[Open Media Library](/portal/app/services/media-library)`,
      linkUrl: "/portal/app/services/media-library",
    };
  }

  if (action === "media.items.move" && json?.ok) {
    const moved = typeof json.moved === "number" ? json.moved : null;
    return {
      markdown: `Moved ${moved ?? ""} file(s) into the folder.\n\n[Open Media Library](/portal/app/services/media-library)`.replace(/\s+/g, " ").trim(),
      linkUrl: "/portal/app/services/media-library",
    };
  }

  if (action === "media.import_remote_image" && json?.ok && json?.item?.id) {
    return {
      markdown: `Imported the image into Media Library.\n\n[Open Media Library](/portal/app/services/media-library)`,
      linkUrl: "/portal/app/services/media-library",
    };
  }

  if (action === "dashboard.reset" && json?.ok) {
    return {
      markdown: `Reset your dashboard layout.\n\n[Open dashboard](/portal/app)`,
      linkUrl: "/portal/app",
    };
  }

  if ((action === "dashboard.add_widget" || action === "dashboard.remove_widget") && json?.ok) {
    return {
      markdown: `Updated your dashboard.\n\n[Open dashboard](/portal/app)`,
      linkUrl: "/portal/app",
    };
  }

  if (action === "dashboard.optimize" && json?.ok) {
    const niche = typeof json.niche === "string" && json.niche.trim() ? json.niche.trim() : null;
    return {
      markdown: `Optimized your dashboard${niche ? ` for ${niche}` : ""}.\n\n[Open dashboard](/portal/app)`,
      linkUrl: "/portal/app",
    };
  }

  if (action === "nurture.campaigns.create" && json?.ok && json?.id) {
    return {
      markdown: `Created the nurture campaign.\n\n[Open Nurture Campaigns](/portal/app/services/nurture-campaigns)`,
      linkUrl: "/portal/app/services/nurture-campaigns",
    };
  }

  if ((action === "nurture.campaigns.update" || action === "nurture.campaigns.delete") && json?.ok) {
    return {
      markdown: `Updated nurture campaigns.\n\n[Open Nurture Campaigns](/portal/app/services/nurture-campaigns)`,
      linkUrl: "/portal/app/services/nurture-campaigns",
    };
  }

  if (action === "nurture.campaigns.steps.add" && json?.ok && json?.id) {
    return {
      markdown: `Added the campaign step.\n\n[Open Nurture Campaigns](/portal/app/services/nurture-campaigns)`,
      linkUrl: "/portal/app/services/nurture-campaigns",
    };
  }

  if ((action === "nurture.steps.update" || action === "nurture.steps.delete") && json?.ok) {
    return {
      markdown: `Updated the nurture step.\n\n[Open Nurture Campaigns](/portal/app/services/nurture-campaigns)`,
      linkUrl: "/portal/app/services/nurture-campaigns",
    };
  }

  if (action === "nurture.campaigns.enroll" && json?.ok) {
    const enrolled = typeof json.enrolled === "number" ? json.enrolled : null;
    const wouldEnroll = typeof json.wouldEnroll === "number" ? json.wouldEnroll : null;
    const n = enrolled ?? wouldEnroll;
    const verb = enrolled !== null ? "Enrolled" : "Would enroll";
    return {
      markdown: `${verb} ${n ?? ""} contact(s).\n\n[Open Nurture Campaigns](/portal/app/services/nurture-campaigns)`.replace(/\s+/g, " ").trim(),
      linkUrl: "/portal/app/services/nurture-campaigns",
    };
  }

  if (action === "nurture.billing.confirm_checkout" && json?.ok) {
    return {
      markdown: `Confirmed billing for this campaign.\n\n[Open Nurture Campaigns](/portal/app/services/nurture-campaigns)`,
      linkUrl: "/portal/app/services/nurture-campaigns",
    };
  }

  if (action === "nurture.ai.generate_step" && json?.ok) {
    if (typeof json.subject === "string" || typeof json.body === "string") {
      const subject = typeof json.subject === "string" ? json.subject.trim() : "";
      const body = typeof json.body === "string" ? json.body.trim() : "";
      const parts = [
        "Drafted copy:",
        subject ? `\nSubject: ${subject}` : "",
        body ? `\n\n${body}` : "",
      ]
        .filter(Boolean)
        .join("");
      return { markdown: parts };
    }
    return { markdown: "Drafted the step copy." };
  }

  if (action === "nurture.campaigns.list" && json?.ok) {
    const rows = Array.isArray(json.campaigns) ? (json.campaigns as any[]) : [];
    const lines = rows.slice(0, 20).map((c) => {
      const name = String(c?.name || "").trim() || "(No name)";
      const status = String(c?.status || "").trim();
      const id = String(c?.id || "").trim();
      const stepsCount = typeof c?.stepsCount === "number" ? c.stepsCount : null;
      const bits = [status ? `(${status})` : null, stepsCount !== null ? `${stepsCount} steps` : null, id ? `campaignId: ${id}` : null]
        .filter(Boolean)
        .join(" · ");
      return `- ${name}${bits ? ` — ${bits}` : ""}`;
    });
    return {
      markdown: rows.length
        ? `Here are your nurture campaigns:\n\n${lines.join("\n")}\n\n[Open Nurture Campaigns](/portal/app/services/nurture-campaigns)`
        : "No nurture campaigns yet.",
      linkUrl: "/portal/app/services/nurture-campaigns",
    };
  }

  if (action === "nurture.campaigns.update" && json?.code === "BILLING_REQUIRED" && typeof json?.url === "string") {
    const url = String(json.url).trim();
    if (url) {
      return {
        markdown: `Billing required to activate this campaign.\n\nCheckout: ${url}`,
      };
    }
  }

  const err = typeof json?.error === "string" ? json.error : typeof json?.message === "string" ? json.message : null;
  return { markdown: err ? `Action failed: ${err}` : "Action finished." };
}

export async function executePortalAgentActionForThread(opts: {
  ownerId: string;
  actorUserId?: string;
  threadId: string;
  action: PortalAgentActionKey;
  args: Record<string, unknown>;
}) {
  const argsSchema = PortalAgentActionArgsSchemaByKey[opts.action];
  const argsParsed = argsSchema.safeParse(opts.args);
  if (!argsParsed.success) {
    return { ok: false as const, status: 400, error: "Invalid action args" };
  }

  const actorUserId = opts.actorUserId || opts.ownerId;
  const { json, status } = await runDirectAction({ action: opts.action, ownerId: opts.ownerId, actorUserId, args: argsParsed.data as any });
  const { markdown, linkUrl } = resultMarkdown(opts.action, json);

  const now = new Date();
  const assistantMsg = await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId: opts.ownerId,
      threadId: opts.threadId,
      role: "assistant",
      text: markdown,
      attachmentsJson: null,
      createdByUserId: null,
      sendAt: null,
      sentAt: now,
    },
    select: {
      id: true,
      role: true,
      text: true,
      attachmentsJson: true,
      createdAt: true,
      sendAt: true,
      sentAt: true,
    },
  });

  await (prisma as any).portalAiChatThread.update({ where: { id: opts.threadId }, data: { lastMessageAt: now } });

  return {
    ok: status >= 200 && status < 300,
    status,
    action: opts.action,
    result: json,
    assistantMessage: assistantMsg,
    linkUrl,
  };
}
