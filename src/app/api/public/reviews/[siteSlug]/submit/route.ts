import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { findOwnerIdByStoredBlogSiteSlug } from "@/lib/blogSiteSlug";
import { getReviewRequestsServiceData } from "@/lib/reviewRequests";
import { findOrCreatePortalContact } from "@/lib/portalContacts";
import { normalizePhoneStrict } from "@/lib/phone";

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

function normalizeEmail(emailRaw: string) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email) return "";
  // Keep it intentionally lightweight (avoid introducing a heavy validator).
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) return "";
  return email.slice(0, 120);
}

function sanitizeAnswers(
  raw: unknown,
  questions: Array<{
    id: string;
    label: string;
    required: boolean;
    kind: "short" | "long" | "single_choice" | "multiple_choice";
    options?: string[];
  }>,
): { ok: true; answers: Record<string, string | string[]> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  const rec = raw as Record<string, unknown>;

  const answers: Record<string, string | string[]> = {};
  for (const q of questions) {
    const a = rec[q.id];
    if (!q.required && (a === undefined || a === null)) continue;

    if (q.kind === "multiple_choice") {
      const list = Array.isArray(a)
        ? a
            .filter((x) => typeof x === "string")
            .map((x) => x.trim().slice(0, 200))
            .filter(Boolean)
            .slice(0, 20)
        : [];
      const allowed = new Set((q.options ?? []).map((x) => String(x)));
      const filtered = list.filter((x) => allowed.has(x));
      if (q.required && filtered.length === 0) {
        return { ok: false, error: `Please answer: ${q.label}` };
      }
      if (filtered.length) answers[q.id] = filtered;
      continue;
    }

    if (q.kind === "single_choice") {
      const v = typeof a === "string" ? a.trim().slice(0, 200) : "";
      const allowed = new Set((q.options ?? []).map((x) => String(x)));
      if (q.required && !v) {
        return { ok: false, error: `Please answer: ${q.label}` };
      }
      if (v && !allowed.has(v)) {
        return { ok: false, error: `Please answer: ${q.label}` };
      }
      if (v) answers[q.id] = v;
      continue;
    }

    const v = typeof a === "string" ? a.trim().slice(0, 2000) : "";
    if (q.required && !v) {
      return { ok: false, error: `Please answer: ${q.label}` };
    }
    if (v) answers[q.id] = v;
  }

  return { ok: true, answers };
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
  const rawEmail = String(form.get("email") || "").trim().slice(0, 120);
  const rawPhone = String(form.get("phone") || "").trim().slice(0, 40);
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

  const publicForm = serviceData?.settings?.publicPage?.form;
  const emailEnabled = Boolean(publicForm?.email?.enabled);
  const emailRequired = Boolean(publicForm?.email?.enabled && publicForm?.email?.required);
  const phoneEnabled = Boolean(publicForm?.phone?.enabled);
  const phoneRequired = Boolean(publicForm?.phone?.enabled && publicForm?.phone?.required);
  const questions = Array.isArray(publicForm?.questions) ? publicForm.questions.slice(0, 25) : [];

  const email = emailEnabled ? normalizeEmail(rawEmail) : "";
  if (emailRequired && !email) {
    return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
  }
  if (emailEnabled && rawEmail && !email) {
    return NextResponse.json({ ok: false, error: "Email is invalid" }, { status: 400 });
  }

  let phone: string = "";
  if (phoneEnabled) {
    const res = normalizePhoneStrict(rawPhone);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    phone = (res.e164 || "").slice(0, 40);
  }
  if (phoneRequired && !phone) {
    return NextResponse.json({ ok: false, error: "Phone is required" }, { status: 400 });
  }

  let rawAnswersObj: unknown = null;
  const rawAnswers = String(form.get("answers") || "").trim();
  if (rawAnswers) {
    try {
      rawAnswersObj = JSON.parse(rawAnswers);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid answers" }, { status: 400 });
    }
  }

  const sanitized = sanitizeAnswers(rawAnswersObj, questions);
  if (!sanitized.ok) {
    return NextResponse.json({ ok: false, error: sanitized.error }, { status: 400 });
  }

  const [canUseContactsTable, canUseReviewContactId, canUseReviewAnswersJson] = await Promise.all([
    hasPublicColumn("PortalContact", "id"),
    hasPublicColumn("PortalReview", "contactId"),
    hasPublicColumn("PortalReview", "answersJson"),
  ]);

  const contactId =
    canUseContactsTable && canUseReviewContactId
      ? await findOrCreatePortalContact({
          ownerId,
          name,
          email: email || null,
          phone: phone || null,
        })
      : null;

  const review = await (prisma as any).portalReview.create({
    data: {
      ownerId,
      rating,
      name,
      body: body || null,
      email: emailEnabled ? (email || null) : null,
      phone: phoneEnabled ? (phone || null) : null,
      photoUrls: null as any,
      ...(canUseReviewAnswersJson ? { answersJson: sanitized.answers as any } : {}),
      ...(contactId ? { contactId } : {}),
    },
    select: { id: true },
  });

  const createdPhotoIds: string[] = [];
  for (const file of selected) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_PHOTO_BYTES) continue;
    const blob = await readFileBytes(file);
    const created = await (prisma as any).portalReviewPhoto.create({
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
    await (prisma as any).portalReview.update({
      where: { id: review.id },
      data: { photoUrls: photoUrls as any },
      select: { id: true },
    });
  }

  return NextResponse.json({ ok: true, id: review.id });
}
