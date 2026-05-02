import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { placeDetails } from "@/lib/googlePlaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  leadIds: z.array(z.string().trim().min(1).max(120)).max(150).default([]),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractCoordinates(dataJson: unknown): { latitude: number; longitude: number } | null {
  const root = asRecord(dataJson);
  if (!root) return null;

  const googlePlaces = asRecord(root.googlePlaces);
  const googleLocation = asRecord(googlePlaces?.location);
  const googleDetails = asRecord(googlePlaces?.details);
  const googleDetailsLocation = asRecord(googleDetails?.location);
  const legacyGeometry = asRecord(googleDetails?.geometry);
  const legacyGeometryLocation = asRecord(legacyGeometry?.location);

  const googleLatitude =
    toFiniteNumber(googleLocation?.latitude) ??
    toFiniteNumber(googleLocation?.lat) ??
    toFiniteNumber(googleDetailsLocation?.latitude) ??
    toFiniteNumber(googleDetailsLocation?.lat) ??
    toFiniteNumber(legacyGeometryLocation?.lat);
  const googleLongitude =
    toFiniteNumber(googleLocation?.longitude) ??
    toFiniteNumber(googleLocation?.lng) ??
    toFiniteNumber(googleDetailsLocation?.longitude) ??
    toFiniteNumber(googleDetailsLocation?.lng) ??
    toFiniteNumber(legacyGeometryLocation?.lng);
  if (googleLatitude !== null && googleLongitude !== null) {
    return { latitude: googleLatitude, longitude: googleLongitude };
  }

  const osm = asRecord(root.osm);
  const osmElement = asRecord(osm?.element);
  const osmCenter = asRecord(osmElement?.center);
  const osmLatitude = toFiniteNumber(osmElement?.lat) ?? toFiniteNumber(osmCenter?.lat);
  const osmLongitude = toFiniteNumber(osmElement?.lon) ?? toFiniteNumber(osmCenter?.lon);
  if (osmLatitude !== null && osmLongitude !== null) {
    return { latitude: osmLatitude, longitude: osmLongitude };
  }

  return null;
}

function extractLiveCoordinates(details: unknown): { latitude: number; longitude: number } | null {
  const rec = asRecord(details);
  const location = asRecord(rec?.location);
  const geometry = asRecord(rec?.geometry);
  const geometryLocation = asRecord(geometry?.location);

  const latitude =
    toFiniteNumber(location?.lat) ??
    toFiniteNumber(location?.latitude) ??
    toFiniteNumber(geometryLocation?.lat) ??
    toFiniteNumber(geometryLocation?.latitude);
  const longitude =
    toFiniteNumber(location?.lng) ??
    toFiniteNumber(location?.longitude) ??
    toFiniteNumber(geometryLocation?.lng) ??
    toFiniteNumber(geometryLocation?.longitude);

  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("leadScraping");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const leadIds = Array.from(new Set(parsed.data.leadIds.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 150);
  if (!leadIds.length) {
    return NextResponse.json({ ok: true, updated: [] });
  }

  const leads = await prisma.portalLead.findMany({
    where: { ownerId, id: { in: leadIds } },
    select: { id: true, placeId: true, dataJson: true },
  });

  const updated: Array<{ id: string; latitude: number; longitude: number }> = [];

  for (let index = 0; index < leads.length; index += 4) {
    const batch = leads.slice(index, index + 4);
    await Promise.all(
      batch.map(async (lead) => {
        const existingCoordinates = extractCoordinates(lead.dataJson);
        if (existingCoordinates) {
          updated.push({ id: String(lead.id), latitude: existingCoordinates.latitude, longitude: existingCoordinates.longitude });
          return;
        }

        const placeId = String(lead.placeId || "").trim();
        if (!placeId || placeId.startsWith("osm:")) return;

        try {
          const details = await placeDetails(placeId);
          const coordinates = extractLiveCoordinates(details);
          if (!coordinates) return;

          const root = asRecord(lead.dataJson) ? { ...(lead.dataJson as Record<string, unknown>) } : {};
          const googlePlaces = asRecord(root.googlePlaces) ? { ...(root.googlePlaces as Record<string, unknown>) } : {};
          const nextDataJson = {
            ...root,
            googlePlaces: {
              ...googlePlaces,
              details,
              location: {
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
              },
            },
          };

          await prisma.portalLead.updateMany({
            where: { id: lead.id, ownerId },
            data: { dataJson: nextDataJson as any },
          });

          updated.push({ id: String(lead.id), latitude: coordinates.latitude, longitude: coordinates.longitude });
        } catch {
          // ignore individual failures
        }
      }),
    );
  }

  return NextResponse.json({ ok: true, updated });
}
