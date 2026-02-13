import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { sendNewsletterToAudience } from "@/lib/portalNewsletter";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoredSettings = {
  external?: any;
  internal?: any;
};

function parseStored(value: unknown): StoredSettings {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return { external: rec?.external ?? {}, internal: rec?.internal ?? {} };
}

export async function POST(req: Request, ctx: { params: Promise<{ newsletterId: string }> }) {
  const auth = await requireClientSessionForService("newsletter", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const { newsletterId } = await ctx.params;

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, slug: true, name: true, ownerId: true } });
  if (!site?.id) {
    return NextResponse.json({ ok: false, error: "Newsletter site not configured" }, { status: 404 });
  }

  const newsletter = await prisma.clientNewsletter.findFirst({
    where: { id: newsletterId, siteId: site.id },
    select: { id: true, kind: true, status: true, slug: true, title: true, excerpt: true, smsText: true },
  });

  if (!newsletter) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (newsletter.status === "SENT") {
    return NextResponse.json({ ok: false, error: "Already sent" }, { status: 409 });
  }

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
    select: { dataJson: true },
  });

  const stored = parseStored(setup?.dataJson);
  const kindKey = newsletter.kind === "INTERNAL" ? "internal" : "external";
  const k = (stored as any)[kindKey] && typeof (stored as any)[kindKey] === "object" ? (stored as any)[kindKey] : {};

  const channels = {
    email: Boolean(k?.channels?.email ?? true),
    sms: Boolean(k?.channels?.sms ?? true),
  };

  const audience = (k?.audience && typeof k.audience === "object" ? k.audience : {}) as any;

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });

  const fromName = profile?.businessName || site.name || "Purely Automation";
  const siteHandle = (site as any).slug ?? site.id;

  const results = await sendNewsletterToAudience({
    req,
    ownerId,
    kind: newsletter.kind,
    siteHandle,
    newsletter: {
      title: newsletter.title,
      excerpt: newsletter.excerpt,
      slug: newsletter.slug,
      smsText: newsletter.smsText ?? null,
    },
    channels,
    audience,
    fromName,
  });

  const sentAt = new Date();

  await prisma.clientNewsletter.update({
    where: { id: newsletter.id },
    data: { status: "SENT", sentAt },
    select: { id: true },
  });

  const errorsEmail = results.email.results.filter((r) => !r.ok);
  const errorsSms = results.sms.results.filter((r) => !r.ok);

  if (channels.email) {
    await prisma.portalNewsletterSendEvent.create({
      data: {
        ownerId,
        siteId: site.id,
        newsletterId: newsletter.id,
        channel: "EMAIL",
        kind: newsletter.kind,
        requestedCount: results.email.requested,
        sentCount: results.email.sent,
        failedCount: Math.max(0, results.email.requested - results.email.sent),
        ...(errorsEmail.length ? { errorsJson: errorsEmail.slice(0, 200) } : {}),
      },
      select: { id: true },
    });
  }

  if (channels.sms) {
    await prisma.portalNewsletterSendEvent.create({
      data: {
        ownerId,
        siteId: site.id,
        newsletterId: newsletter.id,
        channel: "SMS",
        kind: newsletter.kind,
        requestedCount: results.sms.requested,
        sentCount: results.sms.sent,
        failedCount: Math.max(0, results.sms.requested - results.sms.sent),
        ...(errorsSms.length ? { errorsJson: errorsSms.slice(0, 200) } : {}),
      },
      select: { id: true },
    });
  }

  // Best-effort: notify portal users.
  try {
    const baseUrl = getAppBaseUrl();
    void tryNotifyPortalAccountUsers({
      ownerId,
      kind: "newsletter_sent",
      subject: `Newsletter sent: ${newsletter.title || newsletter.slug || newsletter.id}`,
      text: [
        "A newsletter was sent.",
        "",
        newsletter.title ? `Title: ${newsletter.title}` : null,
        `Kind: ${newsletter.kind}`,
        channels.email ? `Email: ${results.email.sent}/${results.email.requested} sent` : null,
        channels.sms ? `SMS: ${results.sms.sent}/${results.sms.requested} sent` : null,
        "",
        `Open newsletter: ${baseUrl}/portal/app/newsletter`,
      ]
        .filter(Boolean)
        .join("\n"),
    }).catch(() => null);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, sentAtIso: sentAt.toISOString(), results });
}
