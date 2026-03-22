import crypto from "crypto";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { slugify } from "@/lib/slugify";
import { ensureStoredBlogSiteSlug, setStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { parseReviewRequestsSettings, setReviewRequestsSettings } from "@/lib/reviewRequests";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getAiReceptionistServiceData, parseAiReceptionistSettings, setAiReceptionistSettings } from "@/lib/aiReceptionist";
import { parseAppointmentReminderSettings, setAppointmentReminderSettingsForCalendar } from "@/lib/appointmentReminders";
import { setFollowUpSettings } from "@/lib/followUpAutomation";
import { getMissedCallTextBackServiceData, parseMissedCallTextBackSettings, setMissedCallTextBackSettings } from "@/lib/missedCallTextBack";
import { addPortalDashboardWidget, isDashboardWidgetId } from "@/lib/portalDashboard";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { getPortalInboxSettings } from "@/lib/portalInbox";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import { ensureUploadsFolder } from "@/lib/portalMediaUploads";
import { newPublicToken, newTag, normalizeNameKey } from "@/lib/portalMedia";

import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";

export type ApplyResult = {
  ok: true;
  appliedIds: string[];
  skippedIds: string[];
} | {
  ok: false;
  error: string;
  appliedIds: string[];
  skippedIds: string[];
};

async function ensureUniqueBlogSlug(ownerId: string, desiredName: string): Promise<{ canUseSlugColumn: boolean; slug: string | null }> {
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  const base = slugify(desiredName) || "blog";
  const desired = base.length >= 3 ? base : "blog";

  if (!canUseSlugColumn) return { canUseSlugColumn, slug: desired };

  let slug = desired;
  const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } }).catch(() => null)) as any;
  if (collision && String(collision.ownerId) !== ownerId) {
    slug = `${desired}-${ownerId.slice(0, 6)}`;
  }
  return { canUseSlugColumn, slug };
}

async function applyBlogsCreateSite(ownerId: string, payload: Record<string, unknown>) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const desiredName = name || "Hosted site";

  const existing = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }).catch(() => null);
  if (existing?.id) return;

  const { canUseSlugColumn, slug } = await ensureUniqueBlogSlug(ownerId, desiredName);

  if (!canUseSlugColumn && slug) {
    try {
      await ensureStoredBlogSiteSlug(ownerId, desiredName);
      await setStoredBlogSiteSlug(ownerId, slug);
    } catch {
      // ignore
    }
  }

  const verificationToken = crypto.randomBytes(18).toString("hex");
  await (prisma.clientBlogSite as any).create({
    data: {
      ownerId,
      name: desiredName,
      primaryDomain: null,
      verifiedAt: null,
      verificationToken,
      ...(canUseSlugColumn ? { slug } : {}),
    },
    select: { id: true },
  });
}

async function applyBlogsAutomationSettings(ownerId: string, payload: Record<string, unknown>) {
  const enabled = payload.enabled === true;
  const frequencyDays = typeof payload.frequencyDays === "number" && Number.isFinite(payload.frequencyDays)
    ? Math.min(30, Math.max(1, Math.floor(payload.frequencyDays)))
    : 7;
  const autoPublish = payload.autoPublish === true;
  const topics = Array.isArray(payload.topics)
    ? payload.topics.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean).slice(0, 50)
    : [];

  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
    select: { dataJson: true },
  }).catch(() => null);

  const prev = existing?.dataJson && typeof existing.dataJson === "object" ? (existing.dataJson as any) : null;
  const cursor = typeof prev?.cursor === "number" && Number.isFinite(prev.cursor) ? Math.max(0, Math.floor(prev.cursor)) : 0;
  const lastRunAt = typeof prev?.lastRunAt === "string" ? prev.lastRunAt : undefined;

  const next = { enabled, frequencyDays, topics, cursor, autoPublish, lastRunAt };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
    create: { ownerId, serviceSlug: "blogs", status: "IN_PROGRESS", dataJson: next },
    update: { dataJson: next },
    select: { id: true },
  });
}

async function ensureBookingSite(ownerId: string): Promise<{ id: string; enabled: boolean; slug: string } | null> {
  const existing = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true, enabled: true, slug: true } }).catch(() => null);
  if (existing?.id) return existing;

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true, timeZone: true } }).catch(() => null),
    prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }).catch(() => null),
  ]);

  const base = slugify(profile?.businessName ?? user?.name ?? user?.email?.split("@")[0] ?? "booking");
  const desired = base.length >= 3 ? base : "booking";

  let slug = desired;
  const collision = await prisma.portalBookingSite.findUnique({ where: { slug }, select: { ownerId: true } }).catch(() => null);
  if (collision?.ownerId && String(collision.ownerId) !== ownerId) {
    slug = `${desired}-${ownerId.slice(0, 6)}`;
  }

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
    select: { id: true, enabled: true, slug: true },
  }).catch(() => null);

  return created;
}

async function applyBookingConfigureSite(ownerId: string, payload: Record<string, unknown>) {
  const enabled = payload.enabled === true;
  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 80) : "Book a call";
  const description = typeof payload.description === "string" ? payload.description.trim().slice(0, 400) : "";
  const durationMinutes =
    typeof payload.durationMinutes === "number" && Number.isFinite(payload.durationMinutes)
      ? Math.min(180, Math.max(10, Math.floor(payload.durationMinutes)))
      : 30;
  const meetingPlatform = typeof payload.meetingPlatform === "string" ? payload.meetingPlatform.trim().slice(0, 40) : "OTHER";

  const site = await ensureBookingSite(ownerId);
  if (site?.id) {
    await prisma.portalBookingSite.update({
      where: { ownerId },
      data: {
        enabled,
        title,
        description: description ? description : null,
        durationMinutes,
      },
      select: { id: true },
    });
  }

  const existing = await prisma.portalServiceSetup
    .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "booking" } }, select: { dataJson: true } })
    .catch(() => null);
  const base = existing?.dataJson && typeof existing.dataJson === "object" && !Array.isArray(existing.dataJson)
    ? (existing.dataJson as Record<string, unknown>)
    : {};

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "booking" } },
    create: { ownerId, serviceSlug: "booking", status: "COMPLETE", dataJson: { ...base, meetingPlatform } },
    update: { status: "COMPLETE", dataJson: { ...base, meetingPlatform } },
    select: { id: true },
  });
}

async function applyReviewsConfigureSettings(ownerId: string, payload: Record<string, unknown>) {
  const settingsRaw = payload.settings;
  const settings = parseReviewRequestsSettings(settingsRaw);
  await setReviewRequestsSettings(ownerId, settings);
}

async function applyNewsletterConfigureAutomation(ownerId: string, payload: Record<string, unknown>) {
  const rec = payload && typeof payload === "object" ? (payload as any) : null;
  const external = rec?.external && typeof rec.external === "object" ? rec.external : {};
  const internal = rec?.internal && typeof rec.internal === "object" ? rec.internal : {};

  const normalizeKind = (k: any) => {
    const enabled = Boolean(k?.enabled);
    const frequencyDays = typeof k?.frequencyDays === "number" && Number.isFinite(k.frequencyDays)
      ? Math.min(365, Math.max(1, Math.floor(k.frequencyDays)))
      : 7;
    const cursor = typeof k?.cursor === "number" && Number.isFinite(k.cursor) ? Math.max(0, Math.floor(k.cursor)) : 0;
    const requireApproval = Boolean(k?.requireApproval);
    const fontKey = typeof k?.fontKey === "string" ? k.fontKey.trim().slice(0, 40) : "brand";
    const channels = {
      email: Boolean(k?.channels?.email ?? true),
      sms: Boolean(k?.channels?.sms ?? false),
    };
    const topics = Array.isArray(k?.topics)
      ? k.topics.filter((t: any) => typeof t === "string").map((t: string) => t.trim()).filter(Boolean).slice(0, 50)
      : [];
    const promptAnswers = k?.promptAnswers && typeof k.promptAnswers === "object" && !Array.isArray(k.promptAnswers) ? k.promptAnswers : {};
    const audience = k?.audience && typeof k.audience === "object" && !Array.isArray(k.audience)
      ? {
          tagIds: Array.isArray(k.audience.tagIds) ? k.audience.tagIds.slice(0, 200) : [],
          contactIds: Array.isArray(k.audience.contactIds) ? k.audience.contactIds.slice(0, 200) : [],
          emails: Array.isArray(k.audience.emails) ? k.audience.emails.slice(0, 200) : [],
          userIds: Array.isArray(k.audience.userIds) ? k.audience.userIds.slice(0, 200) : [],
          sendAllUsers: Boolean(k.audience.sendAllUsers),
        }
      : { tagIds: [], contactIds: [], emails: [], userIds: [], sendAllUsers: false };

    return {
      enabled,
      frequencyDays,
      cursor,
      requireApproval,
      fontKey,
      channels,
      topics,
      promptAnswers,
      audience,
      includeImages: Boolean(k?.includeImages),
      royaltyFreeImages: typeof k?.royaltyFreeImages === "boolean" ? Boolean(k.royaltyFreeImages) : true,
      includeImagesWhereNeeded: Boolean(k?.includeImagesWhereNeeded),
    };
  };

  const next = {
    external: normalizeKind(external),
    internal: normalizeKind(internal),
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
    create: { ownerId, serviceSlug: "newsletter", status: "IN_PROGRESS", dataJson: next as any },
    update: { dataJson: next as any, status: "IN_PROGRESS" },
    select: { id: true },
  });
}

async function applyNurtureCreateStarterCampaign(ownerId: string, payload: Record<string, unknown>) {
  await ensurePortalNurtureSchema().catch(() => null);
  const existing = await prisma.portalNurtureCampaign.findFirst({ where: { ownerId }, select: { id: true } }).catch(() => null);
  if (existing?.id) return;

  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 120) : "Starter Nurture";
  const stepsRaw = Array.isArray((payload as any).steps) ? ((payload as any).steps as any[]) : [];

  const steps = stepsRaw
    .map((s) => (s && typeof s === "object" ? (s as any) : null))
    .filter(Boolean)
    .map((s) => {
      const ord = typeof s.ord === "number" && Number.isFinite(s.ord) ? Math.max(0, Math.floor(s.ord)) : 0;
      const kind = s.kind === "EMAIL" ? "EMAIL" : "SMS";
      const delayMinutes = typeof s.delayMinutes === "number" && Number.isFinite(s.delayMinutes)
        ? Math.min(60 * 24 * 365, Math.max(0, Math.floor(s.delayMinutes)))
        : 0;
      const subject = typeof s.subject === "string" ? s.subject.trim().slice(0, 200) : null;
      const body = typeof s.body === "string" ? s.body.trim().slice(0, 20000) : "";
      if (!body) return null;
      return { ord, kind, delayMinutes, subject: subject || null, body };
    })
    .filter(Boolean) as Array<{ ord: number; kind: "SMS" | "EMAIL"; delayMinutes: number; subject: string | null; body: string }>;

  const sorted = steps.slice().sort((a, b) => a.ord - b.ord).slice(0, 25);

  await prisma.portalNurtureCampaign.create({
    data: {
      ownerId,
      name,
      status: "DRAFT",
      steps: {
        create: sorted.map((s) => ({
          ownerId,
          ord: s.ord,
          kind: s.kind as any,
          delayMinutes: s.delayMinutes,
          subject: s.subject,
          body: s.body,
        })),
      },
    },
    select: { id: true },
  });
}

async function applyLeadOutboundCreateCampaign(ownerId: string, payload: Record<string, unknown>) {
  await ensurePortalAiOutboundCallsSchema().catch(() => null);

  const existing = await prisma.portalAiOutboundCallCampaign.findFirst({ where: { ownerId }, select: { id: true } }).catch(() => null);
  if (existing?.id) return;

  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 120) : "Outbound Follow Up";
  const script = typeof payload.script === "string" ? payload.script.trim().slice(0, 8000) : "Hi, this is an automated call.";
  const policy = payload.messageChannelPolicy === "SMS" || payload.messageChannelPolicy === "EMAIL" ? payload.messageChannelPolicy : "BOTH";

  await prisma.portalAiOutboundCallCampaign.create({
    data: {
      ownerId,
      name,
      status: "DRAFT",
      script,
      messageChannelPolicy: policy as any,
    },
    select: { id: true },
  });
}

async function applyAiReceptionistConfigureSettings(ownerId: string, payload: Record<string, unknown>) {
  const patch = (payload as any)?.settingsPatch;
  const current = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const prev = current?.settings ?? null;
  const next = parseAiReceptionistSettings(patch, prev);
  await setAiReceptionistSettings(ownerId, next);
}

function newAutomationsToken() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 32);
}

async function applyAutomationsInitialize(ownerId: string, payload: Record<string, unknown>) {
  const row = await prisma.portalServiceSetup
    .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "automations" } }, select: { dataJson: true } })
    .catch(() => null);

  const dataJson = (row?.dataJson ?? null) as any;
  const existingTokenRaw = typeof dataJson?.webhookToken === "string" ? String(dataJson.webhookToken).trim() : "";
  const webhookToken = existingTokenRaw.length >= 12 ? existingTokenRaw : newAutomationsToken();
  const existingAutomations = Array.isArray(dataJson?.automations) ? (dataJson.automations as any[]) : [];

  const seedIfEmpty = Boolean((payload as any).seedIfEmpty);
  const starter = (payload as any).starterAutomation && typeof (payload as any).starterAutomation === "object" ? (payload as any).starterAutomation : null;

  const [user] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true } }).catch(() => null),
  ]);
  const viewer = { userId: ownerId, email: String(user?.email || ""), name: String(user?.name || "") };

  const nextAutomations = existingAutomations.length
    ? existingAutomations
    : seedIfEmpty && starter
      ? [
          {
            ...starter,
            paused: true,
            createdBy: starter.createdBy ?? viewer,
            createdAtIso: starter.createdAtIso ?? new Date().toISOString(),
            updatedAtIso: starter.updatedAtIso ?? new Date().toISOString(),
          },
        ]
      : [];

  const nextData = {
    ...(dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? dataJson : {}),
    version: 1,
    webhookToken,
    automations: nextAutomations,
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "automations" } },
    create: { ownerId, serviceSlug: "automations", status: "COMPLETE", dataJson: nextData as any },
    update: { status: "COMPLETE", dataJson: nextData as any },
    select: { id: true },
  });
}

async function applyLeadScrapingConfigureSettings(ownerId: string, payload: Record<string, unknown>) {
  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "lead-scraping" } },
    create: { ownerId, serviceSlug: "lead-scraping", status: "IN_PROGRESS", dataJson: payload as any },
    update: { status: "IN_PROGRESS", dataJson: payload as any },
    select: { id: true },
  });
}

async function applyBookingConfigureReminders(ownerId: string, payload: Record<string, unknown>) {
  const raw = (payload as any)?.settings ?? payload;
  const settings = parseAppointmentReminderSettings(raw);
  await setAppointmentReminderSettingsForCalendar(ownerId, null, settings);
}

async function applyFollowUpSeedTemplates(ownerId: string, payload: Record<string, unknown>) {
  const patch = (payload as any)?.settingsPatch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return;
  await setFollowUpSettings(ownerId, patch as any);
}

async function applyMissedCallTextBackConfigureSettings(ownerId: string, payload: Record<string, unknown>) {
  const patch = (payload as any)?.settingsPatch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return;
  const current = await getMissedCallTextBackServiceData(ownerId).catch(() => null);
  const merged = parseMissedCallTextBackSettings({
    ...(current?.settings ?? {}),
    ...(patch as any),
    // Never rotate tokens from suggested setup.
    webhookToken: (current as any)?.settings?.webhookToken,
  });
  await setMissedCallTextBackSettings(ownerId, merged);
}

async function applyDashboardAddWidgets(ownerId: string, payload: Record<string, unknown>) {
  const widgetIdsRaw = Array.isArray((payload as any).widgetIds) ? ((payload as any).widgetIds as unknown[]) : [];
  const widgetIds = widgetIdsRaw.filter(isDashboardWidgetId).slice(0, 25);
  for (const id of widgetIds) {
    await addPortalDashboardWidget(ownerId, "default", id).catch(() => null);
  }
}

async function applyInboxInitialize(ownerId: string) {
  await ensurePortalInboxSchema().catch(() => null);
  // Persist a stable token if missing.
  await getPortalInboxSettings(ownerId).catch(() => null);
}

function clampText(raw: unknown, max: number): string {
  return String(raw ?? "").trim().slice(0, max);
}

async function applyTasksSeedStarterTasks(ownerId: string, payload: Record<string, unknown>) {
  await ensurePortalTasksSchema().catch(() => null);

  const rows = (await prisma
    .$queryRaw`select count(1)::int as "count" from "PortalTask" where "ownerId" = ${ownerId}`
    .catch(() => [])) as Array<{ count: number }>;
  const count = typeof rows?.[0]?.count === "number" ? rows[0].count : 0;
  if (count > 0) return;

  const tasksRaw = Array.isArray((payload as any)?.tasks) ? ((payload as any).tasks as any[]) : [];
  const tasks = tasksRaw
    .map((t) => (t && typeof t === "object" ? (t as any) : null))
    .filter(Boolean)
    .map((t) => {
      const title = clampText(t.title, 160);
      const description = clampText(t.description, 5000);
      const dueOffsetDays = typeof t.dueOffsetDays === "number" && Number.isFinite(t.dueOffsetDays) ? Math.max(0, Math.floor(t.dueOffsetDays)) : null;
      if (!title) return null;
      return { title, description, dueOffsetDays };
    })
    .filter(Boolean)
    .slice(0, 10) as Array<{ title: string; description: string; dueOffsetDays: number | null }>;

  const now = new Date();

  for (const t of tasks) {
    const id = crypto.randomUUID().replace(/-/g, "");
    const dueAt = typeof t.dueOffsetDays === "number" ? new Date(now.getTime() + t.dueOffsetDays * 24 * 60 * 60 * 1000) : null;
    await prisma.$executeRaw`
      INSERT INTO "PortalTask" ("id","ownerId","createdByUserId","title","description","status","assignedToUserId","dueAt","createdAt","updatedAt")
      VALUES (${id},${ownerId},${ownerId},${t.title},${t.description || null},'OPEN',NULL,${dueAt},DEFAULT,${now})
    `;
  }
}

async function ensureRootMediaFolder(ownerId: string, name: string, color: string | null) {
  const nameKey = normalizeNameKey(name);
  const existing = await (prisma as any).portalMediaFolder.findFirst({
    where: { ownerId, parentId: null, nameKey },
    select: { id: true },
  });
  if (existing?.id) return;

  for (let i = 0; i < 4; i += 1) {
    try {
      await (prisma as any).portalMediaFolder.create({
        data: {
          ownerId,
          parentId: null,
          name,
          nameKey,
          tag: newTag(),
          publicToken: newPublicToken(),
          color,
        },
        select: { id: true },
      });
      return;
    } catch {
      // Likely a tag collision or race. Retry.
    }
  }
}

async function applyMediaLibraryCreateStarterFolders(ownerId: string, payload: Record<string, unknown>) {
  const foldersRaw = Array.isArray((payload as any)?.folders) ? ((payload as any).folders as any[]) : [];
  const folders = foldersRaw
    .map((f) => (f && typeof f === "object" ? (f as any) : null))
    .filter(Boolean)
    .map((f) => {
      const name = clampText(f.name, 80);
      const color = typeof f.color === "string" ? clampText(f.color, 20) : null;
      if (!name) return null;
      return { name, color };
    })
    .filter(Boolean)
    .slice(0, 10) as Array<{ name: string; color: string | null }>;

  // Always ensure the uploads folder exists.
  await ensureUploadsFolder(ownerId).catch(() => null);

  for (const f of folders) {
    if (normalizeNameKey(f.name) === normalizeNameKey("Uploads")) {
      await ensureUploadsFolder(ownerId).catch(() => null);
      continue;
    }
    await ensureRootMediaFolder(ownerId, f.name, f.color ?? null);
  }
}

function normalizeFunnelSlug(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const cleaned = s
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .slice(0, 60);
  if (!cleaned || cleaned.length < 2) return null;
  return cleaned;
}

function withRandomSuffix(base: string, maxLen = 60) {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const suffix = `-${digits}`;
  const headMax = Math.max(1, maxLen - suffix.length);
  const head = base.length > headMax ? base.slice(0, headMax).replace(/-+$/g, "") : base;
  return `${head}${suffix}`;
}

async function applyFunnelBuilderCreateStarterFunnel(ownerId: string, payload: Record<string, unknown>) {
  const existingCount = await prisma.creditFunnel.count({ where: { ownerId } }).catch(() => 0);
  if (existingCount > 0) return;

  const totalCost = PORTAL_CREDIT_COSTS.funnelCreate + PORTAL_CREDIT_COSTS.funnelPageCreate;
  const charged = await consumeCredits(ownerId, totalCost);
  if (!charged.ok) throw new Error("Insufficient credits");

  const nameRaw = typeof payload.name === "string" ? payload.name.trim() : "";
  const name = (nameRaw || "Starter lead funnel").slice(0, 120);

  const desiredBase =
    normalizeFunnelSlug(payload.slug) ?? normalizeFunnelSlug(slugify(name)) ?? `funnel-${ownerId.slice(0, 6)}`;

  let funnel: { id: string; slug: string } | null = null;
  let candidate = desiredBase;

  for (let i = 0; i < 8; i += 1) {
    funnel = await prisma.creditFunnel
      .create({
        data: { ownerId, slug: candidate, name },
        select: { id: true, slug: true },
      })
      .catch((e) => {
        const msg = String((e as any)?.message || "");
        if (msg.includes("CreditFunnel_slug_key") || msg.toLowerCase().includes("unique")) return null;
        throw e;
      });

    if (funnel) break;
    candidate = withRandomSuffix(desiredBase);
  }

  if (!funnel) throw new Error("Unable to create funnel");

  const page = payload.page && typeof payload.page === "object" && !Array.isArray(payload.page) ? (payload.page as any) : null;
  const pageSlug = normalizeFunnelSlug(page?.slug) ?? "home";
  const pageTitle = typeof page?.title === "string" ? page.title.trim().slice(0, 120) : "Home";
  const contentMarkdown = typeof page?.contentMarkdown === "string" ? page.contentMarkdown.slice(0, 20000) : "";

  await prisma.creditFunnelPage.create({
    data: {
      funnelId: funnel.id,
      slug: pageSlug,
      title: pageTitle || pageSlug,
      contentMarkdown: contentMarkdown || "# Welcome\n\nTell us what you are looking for and we will follow up shortly.",
      sortOrder: 0,
    },
    select: { id: true },
  });
}

export async function applySuggestedSetupActions(opts: {
  ownerId: string;
  actions: SuggestedSetupAction[];
}): Promise<ApplyResult> {
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const action of opts.actions) {
    try {
      if (action.kind === "blogs.createSite") {
        await applyBlogsCreateSite(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "blogs.setAutomationSettings") {
        await applyBlogsAutomationSettings(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "booking.configureSite") {
        await applyBookingConfigureSite(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "booking.configureReminders") {
        await applyBookingConfigureReminders(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "reviews.configureSettings") {
        await applyReviewsConfigureSettings(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "newsletter.configureAutomation") {
        await applyNewsletterConfigureAutomation(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "nurture.createStarterCampaign") {
        await applyNurtureCreateStarterCampaign(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "leadOutbound.createCampaign") {
        await applyLeadOutboundCreateCampaign(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "aiReceptionist.configureSettings") {
        await applyAiReceptionistConfigureSettings(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "automations.initialize") {
        await applyAutomationsInitialize(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "leadScraping.configureSettings") {
        await applyLeadScrapingConfigureSettings(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "followUp.seedTemplates") {
        await applyFollowUpSeedTemplates(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "missedCallTextback.configureSettings") {
        await applyMissedCallTextBackConfigureSettings(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "dashboard.addWidgets") {
        await applyDashboardAddWidgets(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "inbox.initialize") {
        await applyInboxInitialize(opts.ownerId);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "tasks.seedStarterTasks") {
        await applyTasksSeedStarterTasks(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "mediaLibrary.createStarterFolders") {
        await applyMediaLibraryCreateStarterFolders(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      if (action.kind === "funnelBuilder.createStarterFunnel") {
        await applyFunnelBuilderCreateStarterFunnel(opts.ownerId, action.payload);
        appliedIds.push(action.id);
        continue;
      }

      skippedIds.push(action.id);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Apply failed",
        appliedIds,
        skippedIds: [...skippedIds, action.id],
      };
    }
  }

  return { ok: true, appliedIds, skippedIds };
}
