import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  targeting: z.object({
    industries: z.array(z.string().min(1).max(80)).max(50).optional(),
    businessModels: z.array(z.string().min(1).max(80)).max(50).optional(),
    locations: z.array(z.string().min(1).max(80)).max(50).optional(),
  }),
});

function uniqStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) continue;
    if (out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

function omitUndefinedDeep(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(omitUndefinedDeep);

  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined) continue;
    out[k] = omitUndefinedDeep(v);
  }
  return out;
}

export async function GET() {
  const user = await requireAdsUser();

  const rows = await prisma.adsAudienceProfile.findMany({
    where: { createdById: user.id },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      targetingJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, audiences: rows });
}

export async function POST(req: Request) {
  const user = await requireAdsUser();

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const industries = uniqStrings(parsed.data.targeting.industries).slice(0, 50);
  const businessModels = uniqStrings(parsed.data.targeting.businessModels).slice(0, 50);
  const locations = uniqStrings(parsed.data.targeting.locations).slice(0, 50);

  const targetingJson = omitUndefinedDeep({
    industries: industries.length ? industries : undefined,
    businessModels: businessModels.length ? businessModels : undefined,
    locations: locations.length ? locations : undefined,
  }) as Prisma.InputJsonValue;

  try {
    const row = await prisma.adsAudienceProfile.create({
      data: {
        createdById: user.id,
        name: parsed.data.name,
        targetingJson,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (err: any) {
    const msg = String(err?.message || "Create failed");
    const isUnique = msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate");
    if (isUnique) {
      return NextResponse.json({ ok: false, error: "You already have an audience profile with that name." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Create failed" }, { status: 400 });
  }
}
