import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getReviewRequestsServiceData } from "@/lib/reviewRequests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_PHOTOS = 25;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_PHOTO_BYTES = 25 * 1024 * 1024;

function safeFilename(name: string) {
  return (name || "upload.bin")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function resolveOwner(siteSlug: string): Promise<{ ownerId: string; handle: string } | null> {
  const canUseSlugColumn = await hasPublicColumn("ClientBlogSite", "slug");
  if (canUseSlugColumn) {
    const site = (await prisma.clientBlogSite.findFirst(
      {
        where: { OR: [{ slug: siteSlug }, { id: siteSlug }] },
        select: { id: true, ownerId: true, name: true, slug: true },
      } as any,
    )) as any;
    if (site) return { ownerId: String(site.ownerId), handle: String(site.slug || site.id) };
  }

  const byId = await prisma.clientBlogSite.findUnique({
    where: { id: siteSlug },
    select: { id: true, ownerId: true, name: true },
  });
  if (byId) return { ownerId: String((byId as any).ownerId), handle: String((byId as any).id) };

  const ownerId = await findOwnerIdByStoredBlogSiteSlug(siteSlug);
  if (ownerId) return { ownerId: String(ownerId), handle: siteSlug };

  const bookingSite = await prisma.portalBookingSite.findUnique({ where: { slug: siteSlug }, select: { ownerId: true, slug: true } });
  if (bookingSite) return { ownerId: String(bookingSite.ownerId), handle: String(bookingSite.slug) };

  return null;
}

async function readFileBytes(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    bytes: buffer,
    fileName: safeFilename(file.name || "upload.bin"),
    contentType: file.type || "application/octet-stream",
    fileSize: buffer.length,
  };
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

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Invalid form" }, { status: 400 });

  const name = String(form.get("name") || "").trim().slice(0, 80);
  const body = String(form.get("body") || "").trim().slice(0, 2000);
  const email = String(form.get("email") || "").trim().slice(0, 120);
  const phone = String(form.get("phone") || "").trim().slice(0, 40);
  const rating = clampInt(Number(form.get("rating") || 0), 1, 5);

  if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  if (!rating || rating < 1 || rating > 5) return NextResponse.json({ ok: false, error: "Rating is required" }, { status: 400 });

  const photos = form.getAll("photos").filter((x) => x instanceof File) as File[];
  const selected = photos.slice(0, MAX_PHOTOS);

  const totalBytes = selected.reduce((sum, f) => sum + (typeof f.size === "number" ? f.size : 0), 0);
  if (totalBytes > MAX_TOTAL_PHOTO_BYTES) {
    return NextResponse.json({ ok: false, error: "Photos are too large" }, { status: 400 });
  }

  const ownerId = String(resolved.ownerId);

  const review = await prisma.portalReview.create({
    data: {
      ownerId,
      rating,
      name,
      body: body || null,
      email: email || null,
      phone: phone || null,
      photoUrls: null as any,
    },
    select: { id: true },
  });

  const createdPhotoIds: string[] = [];
  for (const file of selected) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_PHOTO_BYTES) continue;
    const blob = await readFileBytes(file);
    const created = await prisma.portalReviewPhoto.create({
      data: {
        ownerId,
        reviewId: review.id,
        contentType: blob.contentType,
        bytes: blob.bytes,
      },
      select: { id: true },
    });
    createdPhotoIds.push(created.id);
  }

  const photoUrls = createdPhotoIds.map((id) => `/api/public/reviews/photos/${id}`);
  if (photoUrls.length) {
    await prisma.portalReview.update({
      where: { id: review.id },
      data: { photoUrls: photoUrls as any },
      select: { id: true },
    });
  }

  return NextResponse.json({ ok: true, id: review.id });
}
