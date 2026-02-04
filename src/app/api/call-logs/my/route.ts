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

    const [hasWebsite, hasLocation, hasNiche] = await Promise.all([
      hasPublicColumn("Lead", "website"),
      hasPublicColumn("Lead", "location"),
      hasPublicColumn("Lead", "niche"),
    ]);

    const leadSelect = {
      id: true,
      businessName: true,
      phone: true,
      ...(hasWebsite ? { website: true } : {}),
      ...(hasLocation ? { location: true } : {}),
      ...(hasNiche ? { niche: true } : {}),
    } as const;

    // For now: dialers see their own, manager/admin can see all.
    const where = role === "MANAGER" || role === "ADMIN" ? {} : { dialerId: userId };

    const logs = await prisma.callLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        dialerId: true,
        leadId: true,
        disposition: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        companyName: true,
        method: true,
        methodOther: true,
        notes: true,
        followUpAt: true,
        createdAt: true,
        lead: { select: leadSelect },
        transcriptDoc: { select: { id: true, title: true, content: true, kind: true } },
        recording: { select: { id: true, filePath: true, mimeType: true, fileSize: true, createdAt: true } },
      },
    });

    return NextResponse.json({ callLogs: logs });
  } catch (err) {
    console.error("/api/call-logs/my failed", err);
    return NextResponse.json({ error: "Failed to load call logs" }, { status: 500 });
  }
}
