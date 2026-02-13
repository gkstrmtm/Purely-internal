import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getReviewRequestsServiceData } from "@/lib/reviewRequests";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resolveOwner(siteSlug: string): Promise<{ ownerId: string } | null> {
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  if (canUseSlugColumn) {
    const site = (await prisma.clientBlogSite.findFirst(
      {
        where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
        select: { ownerId: true },
      } as any,
    )) as any;
    if (site?.ownerId) return { ownerId: String(site.ownerId) };
  }

  const byId = await prisma.clientBlogSite.findUnique({ where: { id: siteSlug }, select: { ownerId: true } });
  if ((byId as any)?.ownerId) return { ownerId: String((byId as any).ownerId) };

  const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
  if (ownerId) return { ownerId: String(ownerId) };

  const bookingSite = await prisma.portalBookingSite.findUnique({ where: { slug: siteSlug }, select: { ownerId: true } });
  if (bookingSite?.ownerId) return { ownerId: String(bookingSite.ownerId) };

  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const slug = String(siteSlug || "").trim();
  if (!slug) return NextResponse.json({ ok: false, error: "Missing siteSlug" }, { status: 400 });

  const resolved = await resolveOwner(slug);
  if (!resolved) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const serviceData = await getReviewRequestsServiceData(String(resolved.ownerId));
  if (!serviceData?.settings?.publicPage?.enabled) {
    return NextResponse.json({ ok: false, error: "Public reviews page is disabled" }, { status: 404 });
  }

  const hasTable = await hasPublicColumn("PortalReviewQuestion", "id");
  if (!hasTable) {
    return NextResponse.json({ ok: false, error: "Q&A is not enabled in this environment yet." }, { status: 409 });
  }

  const json = await req.json().catch(() => null);
  const rec = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;

  const name = (typeof rec?.name === "string" ? rec.name : "").trim().slice(0, 80);
  const question = (typeof rec?.question === "string" ? rec.question : "").trim().slice(0, 600);

  if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  if (!question) return NextResponse.json({ ok: false, error: "Question is required" }, { status: 400 });

  await (prisma as any).portalReviewQuestion.create({
    data: {
      ownerId: String(resolved.ownerId),
      name,
      question,
      answer: null,
      answeredAt: null,
    },
    select: { id: true },
  });

  // Best-effort: notify portal users.
  try {
    const ownerId = String(resolved.ownerId);
    const baseUrl = getAppBaseUrl();
    void tryNotifyPortalAccountUsers({
      ownerId,
      kind: "review_question_received",
      subject: `New question: ${name}`,
      text: [
        "A new question was submitted on your reviews page.",
        "",
        `Name: ${name}`,
        `Question: ${question}`,
        "",
        `Open Q&A: ${baseUrl}/portal/app/reviews`,
      ].join("\n"),
    }).catch(() => null);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}
