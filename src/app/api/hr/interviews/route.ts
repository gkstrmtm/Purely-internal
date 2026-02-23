import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";
import { hrSchemaMissingResponse, isHrSchemaMissingError } from "@/lib/hrDbCompat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireStaffSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  try {
    const now = new Date();

    const query = {
      where: {
        scheduledAt: { gte: now },
        status: "SCHEDULED" as any,
      },
      orderBy: { scheduledAt: "asc" as const },
      take: 200,
    };

    const interviews = await prisma.hrCandidateInterview.findMany({
      ...query,
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        meetingJoinUrl: true,
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            targetRole: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, interviews });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.includes("targetRole") && msg.toLowerCase().includes("does not exist")) {
      const now = new Date();
      const interviews = await prisma.hrCandidateInterview.findMany({
        where: {
          scheduledAt: { gte: now },
          status: "SCHEDULED" as any,
        },
        orderBy: { scheduledAt: "asc" },
        take: 200,
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          meetingJoinUrl: true,
          candidate: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              status: true,
            },
          },
        },
      });

      return NextResponse.json({ ok: true, interviews: interviews.map((i) => ({ ...i, candidate: { ...i.candidate, targetRole: null } })) });
    }

    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}
