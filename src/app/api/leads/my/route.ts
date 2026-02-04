import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const role = session?.user?.role;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "";
    const takeRaw = url.searchParams.get("take");
    const takeParsed = takeRaw ? Number(takeRaw) : undefined;
    const takeDefault = role === "DIALER" ? 100 : 100;
    const take = Math.max(
      1,
      Math.min(250, Number.isFinite(takeParsed as number) ? (takeParsed as number) : takeDefault),
    );
    const wantAssigned = mode.toLowerCase() === "assigned";

    const [hasWebsite, hasLocation, hasNiche, hasStatus] = await Promise.all([
      hasPublicColumn("Lead", "website"),
      hasPublicColumn("Lead", "location"),
      hasPublicColumn("Lead", "niche"),
      hasPublicColumn("Lead", "status"),
    ]);

    const leadSelect = {
      id: true,
      businessName: true,
      phone: true,
      ...(hasWebsite ? { website: true } : {}),
      ...(hasLocation ? { location: true } : {}),
      ...(hasNiche ? { niche: true } : {}),
      ...(hasStatus ? { status: true } : {}),
    } as const;

    if ((role === "MANAGER" || role === "ADMIN") && !wantAssigned) {
      const leads = await prisma.lead.findMany({
        orderBy: { createdAt: "desc" },
        take,
        select: leadSelect,
      });

      return NextResponse.json({ leads });
    }

    const assignments = await prisma.leadAssignment.findMany({
      where: {
        userId,
        releasedAt: null,
        lead: {
          appointments: {
            none: {
              status: { in: ["SCHEDULED", "RESCHEDULED"] },
            },
          },
        },
      },
      orderBy: { claimedAt: "desc" },
      take,
      select: {
        lead: { select: leadSelect },
      },
    });

    return NextResponse.json({
      leads: assignments.map((a) => a.lead),
    });
  } catch (err) {
    console.error("/api/leads/my failed", err);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }
}
