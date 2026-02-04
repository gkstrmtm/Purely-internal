import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const role = session?.user?.role;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    if (role === "MANAGER" || role === "ADMIN") {
      const leads = await prisma.lead.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
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
      take: 50,
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
