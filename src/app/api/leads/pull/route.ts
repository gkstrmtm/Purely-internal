import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  niche: z.string().trim().optional(),
  location: z.string().trim().optional(),
  count: z.number().int().min(1).max(50).default(25),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "DIALER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { niche, location, count } = parsed.data;

  // Basic "lead pool" logic:
  // - pick NEW leads not currently assigned
  // - optionally filter by niche/location
  // - create LeadAssignment rows for this user

  const activeAssignedLeadIds = await prisma.leadAssignment
    .findMany({
      where: { releasedAt: null },
      select: { leadId: true },
    })
    .then((rows) => rows.map((r) => r.leadId));

  const leads = await prisma.lead.findMany({
    where: {
      status: { in: ["NEW", "ASSIGNED"] },
      id: activeAssignedLeadIds.length ? { notIn: activeAssignedLeadIds } : undefined,
      niche: niche ? { contains: niche } : undefined,
      location: location ? { contains: location } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: count,
  });

  if (leads.length === 0) {
    return NextResponse.json({ leads: [], assigned: 0 });
  }

  await prisma.$transaction(
    leads.map((lead) =>
      prisma.leadAssignment.create({
        data: { leadId: lead.id, userId },
      }),
    ),
  );

  await prisma.lead.updateMany({
    where: { id: { in: leads.map((l) => l.id) } },
    data: { status: "ASSIGNED" },
  });

  return NextResponse.json({ leads, assigned: leads.length });
}
