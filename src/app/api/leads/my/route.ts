import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (role === "MANAGER" || role === "ADMIN") {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ leads });
  }

  const assignments = await prisma.leadAssignment.findMany({
    where: { userId, releasedAt: null },
    include: { lead: true },
    orderBy: { claimedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    leads: assignments.map((a) => a.lead),
  });
}
