import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";
import { baseUrlFromRequest, sendEmail, sendSms } from "@/lib/leadOutbound";

export type NewsletterKind = "EXTERNAL" | "INTERNAL";

export type StoredAudience = {
  tagIds?: string[];
  contactIds?: string[];
  emails?: string[];
  userIds?: string[];
};

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
    const userIds = Array.isArray(audience?.userIds)
      ? audience.userIds.map(String).filter(Boolean).slice(0, 200)
      : [];

    if (userIds.length) {
      const members = await prisma.portalAccountMember.findMany({
        where: { ownerId, userId: { in: userIds } },
        select: { user: { select: { email: true } } },
        take: 2000,
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

  const link = publicNewsletterUrl(opts.req, opts.siteHandle, opts.kind, opts.newsletter.slug);

  const emailResults: Array<{ to: string; ok: boolean; error?: string }> = [];
  const smsResults: Array<{ to: string; ok: boolean; error?: string }> = [];

  if (opts.channels.email) {
    const subject = opts.newsletter.title;
    const text = [
      opts.newsletter.excerpt,
      "",
      `Read online: ${link}`,
      "",
      "—",
      "Sent via Purely Automation",
    ].join("\n");

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
    const baseText = (opts.newsletter.smsText || "New newsletter is ready.").trim() || "New newsletter is ready.";
    const body = `${baseText} ${link}`.slice(0, 900);

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
