import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";
import { hrSchemaMissingResponse, isHrSchemaMissingError } from "@/lib/hrDbCompat";

function safeOneLine(s: unknown) {
  return String(s ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const url = new URL(req.url);
  const q = safeOneLine(url.searchParams.get("q") || "");
  const status = safeOneLine(url.searchParams.get("status") || "");

  try {
    const candidates = await prisma.hrCandidate.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        source: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, candidates });
  } catch (err) {
    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}

export async function POST(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const body = await req.json().catch(() => ({} as any));

  const fullName = safeOneLine(body?.fullName).slice(0, 200);
  const email = safeOneLine(body?.email).slice(0, 200) || null;
  const phone = safeOneLine(body?.phone).slice(0, 80) || null;
  const source = safeOneLine(body?.source).slice(0, 120) || null;
  const notes = String(body?.notes ?? "").trim().slice(0, 4000) || null;
  const status = safeOneLine(body?.status).slice(0, 60) || null;

  if (!fullName) return NextResponse.json({ ok: false, error: "Missing fullName" }, { status: 400 });

  try {
    const candidate = await prisma.hrCandidate.create({
      data: {
        fullName,
        email,
        phone,
        source,
        notes,
        ...(status ? { status: status as any } : {}),
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, candidate });
  } catch (err) {
    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}
