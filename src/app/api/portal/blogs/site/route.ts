import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { slugify } from "@/lib/slugify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const upsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  primaryDomain: z.string().trim().max(253).optional().or(z.literal("")),
});

function normalizeDomain(raw: string | null | undefined) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;

  const withoutProtocol = v.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  const d = withoutPath.replace(/:\d+$/, "");
  return d.length ? d : null;
}

async function ensurePublicSlug(ownerId: string, desiredName: string) {
  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });

  const base = slugify(profile?.businessName ?? desiredName) || "blog";
  const desired = base.length >= 3 ? base : "blog";

  let slug = desired;
  const collision = await prisma.clientBlogSite.findUnique({ where: { slug } });
  if (collision && collision.ownerId !== ownerId) {
    slug = `${desired}-${ownerId.slice(0, 6)}`;
  }

  return slug;
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  let site = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: {
      id: true,
      name: true,
      slug: true,
      primaryDomain: true,
      verifiedAt: true,
      verificationToken: true,
      updatedAt: true,
    },
  });

  // Backfill slug for older sites.
  if (site && !site.slug) {
    const slug = await ensurePublicSlug(ownerId, site.name);
    site = await prisma.clientBlogSite.update({
      where: { ownerId },
      data: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryDomain: true,
        verifiedAt: true,
        verificationToken: true,
        updatedAt: true,
      },
    });
  }

  return NextResponse.json({ ok: true, site });
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const existing = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: {
      id: true,
      name: true,
      slug: true,
      primaryDomain: true,
      verifiedAt: true,
      verificationToken: true,
      updatedAt: true,
    },
  });
  if (existing) {
    // Treat create as idempotent: a customer can only have one site, so just return it.
    if (!existing.slug) {
      const slug = await ensurePublicSlug(ownerId, existing.name);
      const updated = await prisma.clientBlogSite.update({
        where: { ownerId },
        data: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          primaryDomain: true,
          verifiedAt: true,
          verificationToken: true,
          updatedAt: true,
        },
      });
      return NextResponse.json({ ok: true, site: updated });
    }

    return NextResponse.json({ ok: true, site: existing });
  }

  const token = crypto.randomBytes(18).toString("hex");
  const slug = await ensurePublicSlug(ownerId, parsed.data.name.trim());

  const created = await prisma.clientBlogSite.create({
    data: {
      ownerId,
      name: parsed.data.name.trim(),
      slug,
      primaryDomain: normalizeDomain(parsed.data.primaryDomain),
      verificationToken: token,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      primaryDomain: true,
      verifiedAt: true,
      verificationToken: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, site: created });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const primaryDomain = normalizeDomain(parsed.data.primaryDomain);
  const name = parsed.data.name.trim();

  const existing = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: { primaryDomain: true },
  });

  const domainChanged = (existing?.primaryDomain ?? null) !== primaryDomain;

  const updated = await prisma.clientBlogSite.upsert({
    where: { ownerId },
    create: {
      ownerId,
      name,
      slug: await ensurePublicSlug(ownerId, name),
      primaryDomain,
      verificationToken: crypto.randomBytes(18).toString("hex"),
      verifiedAt: null,
    },
    update: {
      name,
      ...(await (async () => {
        const existing = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { slug: true } });
        if (existing?.slug) return {};
        return { slug: await ensurePublicSlug(ownerId, name) };
      })()),
      primaryDomain,
      ...(domainChanged
        ? {
            verifiedAt: null,
            verificationToken: crypto.randomBytes(18).toString("hex"),
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      primaryDomain: true,
      verifiedAt: true,
      verificationToken: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, site: updated });
}
