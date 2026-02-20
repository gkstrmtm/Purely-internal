import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseLimit(raw: string | null): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function parseCursor(raw: string | null): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const [createdAtRaw, idRaw] = raw.split("|");
  const id = String(idRaw || "").trim();
  const createdAt = new Date(String(createdAtRaw || ""));
  if (!id) return null;
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

export async function GET(req: Request, ctx: { params: Promise<{ formId: string }> }) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { formId } = await ctx.params;
  const id = String(formId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const form = await prisma.creditForm.findFirst({
    where: { id, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!form) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = parseCursor(url.searchParams.get("cursor"));

  const submissions = await prisma.creditFormSubmission.findMany({
    where: {
      formId: form.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: { id: true, createdAt: true, dataJson: true, ip: true, userAgent: true },
  });

  const hasMore = submissions.length > limit;
  const page = hasMore ? submissions.slice(0, limit) : submissions;
  const nextCursor = hasMore
    ? `${page[page.length - 1]!.createdAt.toISOString()}|${page[page.length - 1]!.id}`
    : null;

  return NextResponse.json({
    ok: true,
    submissions: page.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      dataJson: s.dataJson,
      ip: s.ip,
      userAgent: s.userAgent,
    })),
    nextCursor,
  });
}
