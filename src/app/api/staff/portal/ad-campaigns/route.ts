import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const placementSchema = z.enum(["SIDEBAR_BANNER", "TOP_BANNER", "BILLING_SPONSORED", "FULLSCREEN_REWARD"]);

const campaignCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  placement: placementSchema,
  startAtIso: z.string().datetime().optional().nullable(),
  endAtIso: z.string().datetime().optional().nullable(),
  targetJson: z.record(z.string(), z.unknown()).optional().nullable(),
  creativeJson: z.record(z.string(), z.unknown()),
  rewardJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

const campaignUpdateSchema = campaignCreateSchema.extend({ id: z.string().trim().min(1).max(64) });

export async function GET() {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  try {
    const rows = await prisma.portalAdCampaign.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        enabled: true,
        priority: true,
        placement: true,
        startAt: true,
        endAt: true,
        targetJson: true,
        creativeJson: true,
        rewardJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, campaigns: rows });
  } catch (err) {
    let msg = "Unable to load campaigns.";

    // Common production failure mode: migrations not applied, so the table/columns don't exist.
    try {
      const code = (err as any)?.code;
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2021" || err.code === "P2022") {
          msg = "Campaigns database schema is missing or out of date. Apply the latest Prisma migrations.";
        }
      } else if (typeof code === "string" && code.trim()) {
        // Postgres: undefined_table
        if (code === "42P01") {
          msg = "Campaigns database table is missing. Apply the latest Prisma migrations.";
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const startAt = parsed.data.startAtIso ? new Date(parsed.data.startAtIso) : null;
    const endAt = parsed.data.endAtIso ? new Date(parsed.data.endAtIso) : null;

    const row = await prisma.portalAdCampaign.create({
      data: {
        name: parsed.data.name,
        enabled: parsed.data.enabled ?? true,
        priority: parsed.data.priority ?? 0,
        placement: parsed.data.placement as any,
        startAt,
        endAt,
        targetJson: parsed.data.targetJson == null ? Prisma.DbNull : (parsed.data.targetJson as Prisma.InputJsonValue),
        creativeJson: parsed.data.creativeJson as Prisma.InputJsonValue,
        rewardJson: parsed.data.rewardJson == null ? Prisma.DbNull : (parsed.data.rewardJson as Prisma.InputJsonValue),
        createdById: auth.session.user.id,
        updatedById: auth.session.user.id,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to create campaign." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = campaignUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const startAt = parsed.data.startAtIso ? new Date(parsed.data.startAtIso) : null;
    const endAt = parsed.data.endAtIso ? new Date(parsed.data.endAtIso) : null;

    await prisma.portalAdCampaign.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        enabled: parsed.data.enabled ?? true,
        priority: parsed.data.priority ?? 0,
        placement: parsed.data.placement as any,
        startAt,
        endAt,
        targetJson: parsed.data.targetJson == null ? Prisma.DbNull : (parsed.data.targetJson as Prisma.InputJsonValue),
        creativeJson: parsed.data.creativeJson as Prisma.InputJsonValue,
        rewardJson: parsed.data.rewardJson == null ? Prisma.DbNull : (parsed.data.rewardJson as Prisma.InputJsonValue),
        updatedById: auth.session.user.id,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to update campaign." }, { status: 500 });
  }
}
