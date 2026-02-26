import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const idsRaw = (url.searchParams.get("ids") ?? "").trim();
  const ids = idsRaw
    ? idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 200)
    : [];
  const takeRaw = url.searchParams.get("take");
  const takeParsed = takeRaw ? Number(takeRaw) : undefined;
  const take = Math.max(1, Math.min(200, Number.isFinite(takeParsed as number) ? (takeParsed as number) : 50));

  try {
    const owners = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        ...(ids.length ? { id: { in: ids } } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { businessProfile: { businessName: { contains: q, mode: "insensitive" } } },
                { businessProfile: { industry: { contains: q, mode: "insensitive" } } },
                { businessProfile: { businessModel: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: ids.length ? Math.min(ids.length, 200) : take,
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        createdAt: true,
        businessProfile: { select: { businessName: true, industry: true, businessModel: true } },
      },
    });

    return NextResponse.json({ ok: true, owners });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load owners." }, { status: 500 });
  }
}
