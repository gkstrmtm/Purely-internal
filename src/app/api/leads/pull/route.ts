import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { hasPlacesKey, placeDetails, placesTextSearch } from "@/lib/googlePlaces";
import { normalizePhoneForStorage } from "@/lib/phone";

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

    const [hasWebsite, hasLocation, hasNiche, hasSource, hasStatus] = await Promise.all([
      hasPublicColumn("Lead", "website"),
      hasPublicColumn("Lead", "location"),
      hasPublicColumn("Lead", "niche"),
      hasPublicColumn("Lead", "source"),
      hasPublicColumn("Lead", "status"),
    ]);

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
      ...(hasStatus ? { status: { in: ["NEW", "ASSIGNED"] as const } } : {}),
      id: activeAssignedLeadIds.length ? { notIn: activeAssignedLeadIds } : undefined,
      // Do not pull leads that already have a booked meeting.
      appointments: { none: { status: { in: ["SCHEDULED", "RESCHEDULED"] } } },
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

    async function findPool() {
      return prisma.lead.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        take: Math.min(200, Math.max(count * 3, count)),
        distinct: ["phone"],
        select: leadSelect,
      });
    }

    let leads = await findPool();

    // If the DB pool is short, optionally source real leads from Google Places.
    if (leads.length < count && hasPlacesKey()) {
      const queryParts = [
        nicheTerms.length ? nicheTerms[0] : "service business",
        locationTerms.length ? `in ${locationTerms[0]}` : "",
      ].filter(Boolean);
      const query = queryParts.join(" ");

      try {
        const candidates = await placesTextSearch(query, Math.min(20, Math.max(10, count * 2)));
        const placeIds = candidates.map((c) => c.place_id);

        // Concurrency-limited details fetch.
        const details: Array<Awaited<ReturnType<typeof placeDetails>>> = [];
        const concurrency = 5;
        for (let i = 0; i < placeIds.length; i += concurrency) {
          const chunk = placeIds.slice(i, i + concurrency);
          const chunkResults = await Promise.all(
            chunk.map((id) => placeDetails(id).catch(() => ({}))),
          );
          details.push(...chunkResults);
        }

        const normalizedPhones = details
          .map((d) => normalizePhoneForStorage(d.international_phone_number || d.formatted_phone_number || ""))
          .filter((p): p is string => Boolean(p));

        const existing = normalizedPhones.length
          ? await prisma.lead.findMany({
              where: { phone: { in: normalizedPhones } },
              select: { phone: true },
            })
          : [];
        const existingPhones = new Set(existing.map((e) => e.phone));

        for (const d of details) {
          const phone = normalizePhoneForStorage(
            d.international_phone_number || d.formatted_phone_number || "",
          );
          if (!phone) continue;
          if (existingPhones.has(phone)) continue;
          if (!d.name?.trim()) continue;

          const data: Record<string, unknown> = {
            businessName: d.name.trim(),
            phone,
          };

          if (hasWebsite && d.website) data.website = d.website;
          if (hasLocation && d.formatted_address) data.location = d.formatted_address;
          if (hasNiche && nicheTerms.length) data.niche = nicheTerms.join(", ");
          if (hasSource) data.source = "PULL";
          if (hasStatus) data.status = "NEW";

          try {
            await prisma.lead.create({
              data: data as never,
              select: { id: true },
            });
            existingPhones.add(phone);
          } catch {
            // Ignore individual create failures.
          }
        }

        leads = await findPool();
      } catch {
        // Ignore sourcing failures; fall back to existing DB pool.
      }
    }

    const picked = leads.slice(0, count);

    if (picked.length === 0) {
      return NextResponse.json({ leads: [], assigned: 0 });
    }

    await prisma.leadAssignment.createMany({
      data: picked.map((lead) => ({ leadId: lead.id, userId })),
      skipDuplicates: true,
    });

    if (hasStatus) {
      await prisma.lead.updateMany({
        where: { id: { in: picked.map((l) => l.id) } },
        data: { status: "ASSIGNED" },
      });
    }

    return NextResponse.json({ leads: picked, assigned: picked.length });
  } catch (err) {
    console.error("/api/leads/pull failed", err);
    return NextResponse.json({ error: "Failed to pull leads" }, { status: 500 });
  }
}
