import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { slugify } from "@/lib/slugify";
import { baseUrlFromRequest, sendEmail, sendSms } from "@/lib/leadOutbound";
import { ensureStoredBlogSiteSlug, getStoredBlogSiteSlug } from "@/lib/blogSiteSlug";

export type NewsletterKind = "EXTERNAL" | "INTERNAL";
type NewsletterSiteSelect = Record<string, boolean>;

async function ensureUniqueNewsletterSiteSlug(ownerId: string, desiredName: string): Promise<{ canUseSlugColumn: boolean; slug: string | null }> {
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  const base = slugify(desiredName) || "site";
  const desired = base.length >= 3 ? base : "site";

  if (!canUseSlugColumn) return { canUseSlugColumn, slug: desired };

  let slug = desired;
  const collision = (await (prisma.clientBlogSite as any).findUnique({ where: { slug }, select: { ownerId: true } }).catch(() => null)) as any;
  if (collision?.ownerId && String(collision.ownerId) !== ownerId) slug = `${desired}-${ownerId.slice(0, 6)}`;

  return { canUseSlugColumn, slug };
}

export async function ensureNewsletterSiteForOwner(opts: {
  ownerId: string;
  desiredName?: string | null;
  select?: NewsletterSiteSelect;
}) {
  const ownerId = String(opts.ownerId || "").trim();
  const desiredName = String(opts.desiredName || "").trim() || "Newsletter site";
  const slugMeta = await ensureUniqueNewsletterSiteSlug(ownerId, desiredName);

  const select: NewsletterSiteSelect = {
    id: true,
    name: true,
    ...(slugMeta.canUseSlugColumn ? { slug: true } : {}),
    ...(opts.select || {}),
  };

  let site = (await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: select as any }).catch(() => null)) as any;
  if (site) {
    if (slugMeta.canUseSlugColumn && Object.prototype.hasOwnProperty.call(select, "slug") && !String((site as any)?.slug || "").trim()) {
      const nextSlug = await ensureUniqueNewsletterSiteSlug(ownerId, String((site as any)?.name || desiredName));
      site = (await (prisma.clientBlogSite as any).update({ where: { ownerId }, data: { slug: nextSlug.slug }, select: select as any }).catch(() => site)) as any;
    }

    if (!slugMeta.canUseSlugColumn && Object.prototype.hasOwnProperty.call(opts.select || {}, "slug")) {
      let fallbackSlug = await getStoredBlogSiteSlug(ownerId);
      if (!fallbackSlug) fallbackSlug = await ensureStoredBlogSiteSlug(ownerId, String((site as any)?.name || desiredName));
      return { ...(site as any), slug: fallbackSlug } as any;
    }

    return site as any;
  }

  const [profile, user] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } }).catch(() => null),
    prisma.user.findUnique({ where: { id: ownerId }, select: { name: true, email: true } }).catch(() => null),
  ]);

  const name =
    String(profile?.businessName || "").trim() ||
    desiredName ||
    String(user?.name || "").trim() ||
    String(user?.email || "").trim().split("@")[0] ||
    "Newsletter site";

  if (!slugMeta.canUseSlugColumn) {
    await ensureStoredBlogSiteSlug(ownerId, name).catch(() => null);
  }

  const created = (await (prisma.clientBlogSite as any).create({
    data: {
      ownerId,
      name,
      primaryDomain: null,
      verificationToken: crypto.randomBytes(18).toString("hex"),
      ...(slugMeta.canUseSlugColumn && slugMeta.slug ? { slug: slugMeta.slug } : {}),
    },
    select: select as any,
  })) as any;

  if (!slugMeta.canUseSlugColumn && Object.prototype.hasOwnProperty.call(opts.select || {}, "slug")) {
    const fallbackSlug = (await getStoredBlogSiteSlug(ownerId)) || (await ensureStoredBlogSiteSlug(ownerId, name));
    return { ...(created as any), slug: fallbackSlug } as any;
  }

  return created as any;
}

export type StoredAudience = {
  tagIds?: string[];
  contactIds?: string[];
  emails?: string[];
  userIds?: string[];
  sendAllUsers?: boolean;
};

export function buildNewsletterEmailText(opts: {
  excerpt: string;
  link: string;
}) {
  return [opts.excerpt, "", `Read online: ${opts.link}`, "", "-", "Sent via Purely Automation"].join("\n");
}

export function buildNewsletterSmsText(opts: {
  smsText: string | null;
  link: string;
}) {
  const baseText = (opts.smsText || "New newsletter is ready.").trim() || "New newsletter is ready.";
  return `${baseText} ${opts.link}`.slice(0, 900);
}

export async function uniqueNewsletterSlug(siteId: string, kind: NewsletterKind, desired: string) {
  const base = slugify(desired) || "newsletter";
  let attempt = base;
  for (let i = 0; i < 50; i += 1) {
    const exists = await prisma.clientNewsletter.findUnique({
      where: { siteId_kind_slug: { siteId, kind, slug: attempt } },
      select: { id: true },
    });
    if (!exists) return attempt;
    attempt = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

export async function resolveNewsletterRecipients(ownerId: string, kind: NewsletterKind, audience: StoredAudience) {
  const tagIds = Array.isArray(audience?.tagIds) ? audience.tagIds.map(String).filter(Boolean).slice(0, 200) : [];
  const contactIds = new Set(
    Array.isArray(audience?.contactIds) ? audience.contactIds.map(String).filter(Boolean).slice(0, 200) : [],
  );

  if (tagIds.length) {
    const rows = await prisma.portalContactTagAssignment.findMany({
      where: { ownerId, tagId: { in: tagIds } },
      select: { contactId: true },
      take: 2000,
    });
    for (const r of rows) contactIds.add(r.contactId);
  }

  const contacts = contactIds.size
    ? await prisma.portalContact.findMany({
        where: { ownerId, id: { in: Array.from(contactIds) } },
        select: { id: true, name: true, email: true, phone: true },
        take: 2000,
      })
    : [];

  const manualEmails = Array.isArray(audience?.emails)
    ? audience.emails.map((e) => String(e || "").trim()).filter(Boolean).slice(0, 200)
    : [];

  let userEmails: string[] = [];
  if (kind === "INTERNAL") {
    const sendAllUsers = Boolean((audience as any)?.sendAllUsers);
    const userIds = Array.isArray(audience?.userIds)
      ? audience.userIds.map(String).filter(Boolean).slice(0, 200)
      : [];

    const memberWhere = sendAllUsers ? { ownerId } : userIds.length ? { ownerId, userId: { in: userIds } } : null;
    if (memberWhere) {
      const members = await prisma.portalAccountMember.findMany({
        where: memberWhere as any,
        select: { user: { select: { email: true } } },
        take: 5000,
      });
      userEmails = members.map((m) => m.user.email).filter(Boolean);
    }
  }

  const emailTo = Array.from(
    new Set(
      [...contacts.map((c) => c.email).filter(Boolean), ...manualEmails, ...userEmails]
        .map((e) => String(e || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 2000);

  const smsTo = Array.from(
    new Set(
      contacts
        .map((c) => c.phone)
        .filter(Boolean)
        .map((p) => String(p || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 2000);

  return { contacts, emailTo, smsTo };
}

export function publicNewsletterPath(siteHandle: string, kind: NewsletterKind, newsletterSlug: string) {
  const base = kind === "INTERNAL" ? "internal-newsletters" : "newsletters";
  return `/${siteHandle}/${base}/${newsletterSlug}`;
}

function normalizeDomain(raw: unknown): string | null {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    ?.replace(/:\d+$/, "")
    ?.replace(/\.$/, "");
  return v ? v : null;
}

async function resolveVerifiedNewsletterCustomDomain(ownerId: string): Promise<string | null> {
  const site = await (prisma.clientBlogSite as any)
    .findUnique({ where: { ownerId }, select: { primaryDomain: true, verifiedAt: true } })
    .catch(() => null);

  const primary = normalizeDomain(site?.primaryDomain);
  if (!primary) return null;

  // Blog-style verification.
  if (site?.verifiedAt) return primary;

  // Funnel-domain verification (domains come from Funnel Builder settings).
  const candidates = primary.startsWith("www.") ? [primary, primary.slice(4)] : [primary, `www.${primary}`];

  const credit = await prisma.creditCustomDomain
    .findFirst({ where: { ownerId, domain: { in: candidates }, status: "VERIFIED" }, select: { domain: true } })
    .catch(() => null);

  return credit?.domain ? String(credit.domain).trim().toLowerCase() : null;
}

export function publicNewsletterUrl(req: Request | undefined, siteHandle: string, kind: NewsletterKind, newsletterSlug: string) {
  return `${baseUrlFromRequest(req)}${publicNewsletterPath(siteHandle, kind, newsletterSlug)}`;
}

export async function sendNewsletterToAudience(opts: {
  req?: Request;
  ownerId: string;
  kind: NewsletterKind;
  siteHandle: string;
  newsletter: { title: string; excerpt: string; slug: string; smsText: string | null };
  channels: { email: boolean; sms: boolean };
  audience: StoredAudience;
  fromName: string;
}) {
  const { emailTo, smsTo } = await resolveNewsletterRecipients(opts.ownerId, opts.kind, opts.audience);

  const customDomain = await resolveVerifiedNewsletterCustomDomain(opts.ownerId);
  const customPathBase = opts.kind === "INTERNAL" ? "internal-newsletters" : "newsletters";
  const link = customDomain
    ? `https://${customDomain}/${customPathBase}/${opts.newsletter.slug}`
    : publicNewsletterUrl(opts.req, opts.siteHandle, opts.kind, opts.newsletter.slug);

  const emailResults: Array<{ to: string; ok: boolean; error?: string }> = [];
  const smsResults: Array<{ to: string; ok: boolean; error?: string }> = [];

  if (opts.channels.email) {
    const subject = opts.newsletter.title;
    const text = buildNewsletterEmailText({ excerpt: opts.newsletter.excerpt, link });

    for (const to of emailTo) {
      try {
        await sendEmail({ to, subject, text, fromName: opts.fromName, ownerId: opts.ownerId });
        emailResults.push({ to, ok: true });
      } catch (e) {
        emailResults.push({ to, ok: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }
  }

  if (opts.channels.sms) {
    const body = buildNewsletterSmsText({ smsText: opts.newsletter.smsText ?? null, link });

    for (const to of smsTo) {
      try {
        await sendSms({ ownerId: opts.ownerId, to, body });
        smsResults.push({ to, ok: true });
      } catch (e) {
        smsResults.push({ to, ok: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }
  }

  return {
    email: { requested: emailTo.length, sent: emailResults.filter((r) => r.ok).length, results: emailResults.slice(0, 200) },
    sms: { requested: smsTo.length, sent: smsResults.filter((r) => r.ok).length, results: smsResults.slice(0, 200) },
  };
}
