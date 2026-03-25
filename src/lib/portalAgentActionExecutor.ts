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

  if (action === "booking.calendar.create" && json?.ok) {
    return {
      markdown: `Created a booking calendar.\n\n[Open booking](/portal/app/services/booking)`,
      linkUrl: "/portal/app/services/booking",
    };
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
