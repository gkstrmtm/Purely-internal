import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

const idSchema = z.string().trim().min(1).max(120);

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    targeting: z
      .object({
        industries: z.array(z.string().min(1).max(80)).max(50).optional(),
        businessModels: z.array(z.string().min(1).max(80)).max(50).optional(),
        serviceSlugsAny: z.array(z.string().min(1).max(80)).max(50).optional(),
        serviceSlugsAll: z.array(z.string().min(1).max(80)).max(50).optional(),
        bucketIds: z.array(z.string().min(1).max(80)).max(50).optional(),
      })
      .optional(),
  })
  .refine((v) => typeof v.name === "string" || typeof v.targeting === "object", { message: "No changes" });

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

export async function DELETE(_: Request, ctx: { params: Promise<{ audienceId: string }> }) {
  const user = await requireAdsUser();
  const params = await ctx.params;
  const parsedId = idSchema.safeParse(params?.audienceId);
  if (!parsedId.success) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const row = await prisma.adsAudienceProfile.findFirst({
    where: { id: parsedId.data, createdById: user.id },
    select: { id: true },
  });

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await prisma.adsAudienceProfile.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ audienceId: string }> }) {
  const user = await requireAdsUser();
  const params = await ctx.params;
  const parsedId = idSchema.safeParse(params?.audienceId);
  if (!parsedId.success) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });

  const existing = await prisma.adsAudienceProfile.findFirst({
    where: { id: parsedId.data, createdById: user.id },
    select: { id: true },
  });

  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const data: Prisma.AdsAudienceProfileUpdateInput = {};

  if (typeof parsed.data.name === "string") data.name = parsed.data.name;

  if (parsed.data.targeting) {
    const industries = uniqStrings(parsed.data.targeting.industries).slice(0, 50);
    const businessModels = uniqStrings(parsed.data.targeting.businessModels).slice(0, 50);
    const serviceSlugsAny = uniqStrings(parsed.data.targeting.serviceSlugsAny).slice(0, 50);
    const serviceSlugsAll = uniqStrings(parsed.data.targeting.serviceSlugsAll).slice(0, 50);
    const bucketIds = uniqStrings(parsed.data.targeting.bucketIds).slice(0, 50);

    data.targetingJson = omitUndefinedDeep({
      industries: industries.length ? industries : undefined,
      businessModels: businessModels.length ? businessModels : undefined,
      serviceSlugsAny: serviceSlugsAny.length ? serviceSlugsAny : undefined,
      serviceSlugsAll: serviceSlugsAll.length ? serviceSlugsAll : undefined,
      bucketIds: bucketIds.length ? bucketIds : undefined,
    }) as Prisma.InputJsonValue;
  }

  try {
    await prisma.adsAudienceProfile.update({ where: { id: existing.id }, data, select: { id: true } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = String(err?.message || "Update failed");
    const isUnique = msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate");
    if (isUnique) {
      return NextResponse.json({ ok: false, error: "You already have an audience profile with that name." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Update failed" }, { status: 400 });
  }
}
