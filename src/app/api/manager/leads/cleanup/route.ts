import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

const bodySchema = z.object({
  allowSources: z.array(z.string().min(1).max(40)).min(1),
  limit: z.number().int().min(1).max(5000).default(500),
  dryRun: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const role = session?.user?.role;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (role !== "MANAGER" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { allowSources, limit, dryRun, confirm } = parsed.data;

    const [hasSource] = await Promise.all([hasPublicColumn("Lead", "source")]);

    const baseWhere = {
      // Only delete leads that have not booked anything and are not marketing demo leads.
      appointments: { none: {} },
      marketingDemoRequest: { is: null },
      ...(hasSource
        ? {
            NOT: {
              source: { in: allowSources },
            },
          }
        : {}),
    };

    const leads = await prisma.lead.findMany({
      where: baseWhere as never,
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        businessName: true,
        phone: true,
        ...(hasSource ? { source: true } : {}),
      } as const,
    });

    if (dryRun || !confirm) {
      return NextResponse.json({
        dryRun: true,
        matched: leads.length,
        sample: leads.slice(0, 25),
        note: "Pass {dryRun:false, confirm:true} to actually delete.",
      });
    }

    const leadIds = leads.map((l) => l.id);
    if (leadIds.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      // Delete dependents in a safe order.
      await tx.callRecording.deleteMany({
        where: { callLog: { leadId: { in: leadIds } } },
      });
      await tx.callLog.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.leadAssignment.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.doc.deleteMany({ where: { leadId: { in: leadIds } } });
      const res = await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
      return res.count;
    });

    return NextResponse.json({ deleted, deletedIds: leadIds.slice(0, 100) });
  } catch (err) {
    console.error("/api/manager/leads/cleanup failed", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
