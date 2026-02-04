import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

const bodySchema = z.object({
  niche: z.string().trim().optional(),
  location: z.string().trim().optional(),
  count: z.number().int().min(1).max(50).default(25),
});

export async function POST(req: Request) {
  try {
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

    const hasWebsite = await hasPublicColumn("Lead", "website");
    const hasLocation = await hasPublicColumn("Lead", "location");
    const hasNiche = await hasPublicColumn("Lead", "niche");

    const leadSelect = {
      id: true,
      businessName: true,
      phone: true,
      ...(hasWebsite ? { website: true } : {}),
      ...(hasLocation ? { location: true } : {}),
      ...(hasNiche ? { niche: true } : {}),
    } as const;

    // Basic "lead pool" logic:
    // - pick NEW leads not currently assigned
    // - optionally filter by niche/location
    // - avoid returning duplicate phones
    // - create LeadAssignment rows for this user

    const activeAssignedLeadIds = await prisma.leadAssignment
      .findMany({
        where: { releasedAt: null },
        select: { leadId: true },
      })
      .then((rows) => rows.map((r) => r.leadId));

    const normalizedNiche = niche && niche.toLowerCase() !== "any" ? niche.trim() : "";
    const normalizedLocation = location && location.toLowerCase() !== "any" ? location.trim() : "";

    const nicheTerms = normalizedNiche
      ? normalizedNiche
          .split(/[,|]/g)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const locationTerms = normalizedLocation
      ? normalizedLocation
          .split(/[,|]/g)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const where = {
      status: { in: ["NEW", "ASSIGNED"] as const },
      id: activeAssignedLeadIds.length ? { notIn: activeAssignedLeadIds } : undefined,
      ...(nicheTerms.length && hasNiche
        ? {
            OR: nicheTerms.map((t) => ({ niche: { contains: t, mode: "insensitive" as const } })),
          }
        : {}),
      ...(locationTerms.length && hasLocation
        ? {
            AND: locationTerms.map((t) => ({ location: { contains: t, mode: "insensitive" as const } })),
          }
        : {}),
    };

    const leads = await prisma.lead.findMany({
      where: where as never,
      orderBy: { createdAt: "desc" },
      take: Math.min(200, Math.max(count * 3, count)),
      distinct: ["phone"],
      select: leadSelect,
    });

    const picked = leads.slice(0, count);

    if (picked.length === 0) {
      return NextResponse.json({ leads: [], assigned: 0 });
    }

    await prisma.leadAssignment.createMany({
      data: picked.map((lead) => ({ leadId: lead.id, userId })),
      skipDuplicates: true,
    });

    await prisma.lead.updateMany({
      where: { id: { in: picked.map((l) => l.id) } },
      data: { status: "ASSIGNED" },
    });

    return NextResponse.json({ leads: picked, assigned: picked.length });
  } catch (err) {
    console.error("/api/leads/pull failed", err);
    return NextResponse.json({ error: "Failed to pull leads" }, { status: 500 });
  }
}
