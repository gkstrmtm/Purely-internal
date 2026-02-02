import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // For now: dialers see their own, manager/admin can see all.
  const where =
    role === "MANAGER" || role === "ADMIN" ? {} : { dialerId: userId };

  const logs = await prisma.callLog.findMany({
    where,
    include: {
      lead: true,
      transcriptDoc: { select: { id: true, title: true, content: true, kind: true } },
      recording: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ callLogs: logs });
}
