import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

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

  const where: Prisma.HrCandidateWhereInput = {
    ...(status ? { status: status as any } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { phone: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  try {
    const candidates = await prisma.hrCandidate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        source: true,
        targetRole: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, candidates });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.includes("targetRole") && msg.toLowerCase().includes("does not exist")) {
      const candidates = await prisma.hrCandidate.findMany({
        where,
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
      return NextResponse.json({ ok: true, candidates: candidates.map((c) => ({ ...c, targetRole: null })) });
    }

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
  const targetRole = safeOneLine(body?.targetRole).slice(0, 20) || null;
  const intakeRaw = body?.intake ?? null;

  if (!fullName) return NextResponse.json({ ok: false, error: "Missing fullName" }, { status: 400 });
  if (targetRole !== "DIALER" && targetRole !== "CLOSER") {
    return NextResponse.json({ ok: false, error: "Missing or invalid targetRole" }, { status: 400 });
  }

  const dataBase: any = {
    fullName,
    email,
    phone,
    source,
    notes,
    ...(status ? { status: status as any } : {}),
  };

  const intake: any = intakeRaw && typeof intakeRaw === "object" ? intakeRaw : null;
  const screeningCapabilities: any = intake
    ? {
        intake,
        targetRole,
        createdFrom: "candidate_create",
      }
    : null;

  try {
    const candidate = await prisma.hrCandidate.create({
      data: {
        ...dataBase,
        targetRole: targetRole as any,
      },
      select: { id: true },
    });

    if (screeningCapabilities) {
      try {
        await prisma.hrCandidateScreening.create({
          data: {
            candidateId: candidate.id,
            capabilities: screeningCapabilities,
          },
          select: { id: true },
        });
      } catch (e: any) {
        const emsg = String(e?.message ?? "").toLowerCase();
        // Best-effort only; don't break candidate creation if screenings table/columns aren't deployed.
        if (
          emsg.includes("hrcandidatescreening") ||
          emsg.includes("capabilities") ||
          emsg.includes("does not exist") ||
          emsg.includes("unknown")
        ) {
          // ignore
        } else {
          throw e;
        }
      }
    }

    return NextResponse.json({ ok: true, candidate });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.includes("targetRole") && msg.toLowerCase().includes("does not exist")) {
      const candidate = await prisma.hrCandidate.create({
        data: dataBase,
        select: { id: true },
      });

      if (screeningCapabilities) {
        try {
          await prisma.hrCandidateScreening.create({
            data: {
              candidateId: candidate.id,
              capabilities: screeningCapabilities,
            },
            select: { id: true },
          });
        } catch {
          // ignore best-effort
        }
      }

      return NextResponse.json({ ok: true, candidate });
    }

    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}
