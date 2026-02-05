import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";

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

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const site = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: {
      id: true,
      name: true,
      primaryDomain: true,
      verifiedAt: true,
      verificationToken: true,
      updatedAt: true,
    },
  });

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

  const existing = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "Blog site already exists" }, { status: 409 });
  }

  const token = crypto.randomBytes(18).toString("hex");

  const created = await prisma.clientBlogSite.create({
    data: {
      ownerId,
      name: parsed.data.name.trim(),
      primaryDomain: normalizeDomain(parsed.data.primaryDomain),
      verificationToken: token,
    },
    select: {
      id: true,
      name: true,
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
      primaryDomain,
      verificationToken: crypto.randomBytes(18).toString("hex"),
      verifiedAt: null,
    },
    update: {
      name,
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
      primaryDomain: true,
      verifiedAt: true,
      verificationToken: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, site: updated });
}
