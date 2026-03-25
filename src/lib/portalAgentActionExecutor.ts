import crypto from "crypto";

import { prisma } from "@/lib/db";
import {
  PortalAgentActionArgsSchemaByKey,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import { runOwnerAutomationByIdForEvent } from "@/lib/portalAutomationsRunner";
import { generateClientBlogDraft } from "@/lib/clientBlogAutomation";
import { generateClientNewsletterDraft } from "@/lib/clientNewsletterAutomation";
import { uniqueNewsletterSlug } from "@/lib/portalNewsletter";
import { slugify } from "@/lib/slugify";
import { getBookingCalendarsConfig, setBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { findOrCreatePortalContact, normalizePhoneKey } from "@/lib/portalContacts";
import { addContactTagAssignment, createOwnerContactTag, ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { sendPortalInboxMessageNow } from "@/lib/portalInboxSend";
import { sendReviewRequestForBooking, sendReviewRequestForContact } from "@/lib/reviewRequests";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";
import { safeFilename, newPublicToken, newTag, normalizeMimeType, normalizeNameKey } from "@/lib/portalMedia";
import { addPortalDashboardWidget, isDashboardWidgetId, removePortalDashboardWidget, resetPortalDashboard, savePortalDashboardData, type DashboardWidgetId } from "@/lib/portalDashboard";
import { hasPublicColumn } from "@/lib/dbSchema";
import { cancelFollowUpsForBooking, scheduleFollowUpsForBooking } from "@/lib/followUpAutomation";
import { trySendTransactionalEmail, sendTransactionalEmail } from "@/lib/emailSender";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";
import { signBookingRescheduleToken } from "@/lib/bookingReschedule";
import { sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet, stripePost } from "@/lib/stripeFetch";
import { generateText } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";

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
