import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";

import { requireManagerSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function makeInviteCode() {
  const raw = randomBytes(4).toString("hex").toUpperCase();
  return raw.slice(0, 4) + "-" + raw.slice(4);
}

const createSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function GET() {
  const auth = await requireManagerSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  try {
    const invites = await prisma.employeeInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        code: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        createdBy: { select: { id: true, email: true, name: true } },
        usedBy: { select: { id: true, email: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, invites });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load invites",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const createdById = auth.session.user.id;

  for (let i = 0; i < 5; i++) {
    const code = makeInviteCode();
    try {
      const invite = await prisma.employeeInvite.create({
        data: {
          code,
          createdById,
          expiresAt,
        },
        select: {
          id: true,
          code: true,
          createdAt: true,
          expiresAt: true,
          usedAt: true,
        },
      });

      return NextResponse.json({ ok: true, invite });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const isUnique = message.includes("Unique constraint") || message.includes("unique") || message.includes("P2002");
      if (!isUnique) {
        return NextResponse.json(
          { ok: false, error: "Failed to create invite", details: message || "Unknown error" },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ ok: false, error: "Failed to generate a unique code" }, { status: 500 });
}
