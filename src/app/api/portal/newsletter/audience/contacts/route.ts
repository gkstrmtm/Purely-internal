import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  ids: z.string().trim().max(5000).optional(),
  take: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const n = Number.parseInt(String(v || ""), 10);
      if (!Number.isFinite(n)) return 50;
      return Math.max(1, Math.min(200, n));
    }),
});

function splitIds(value: string | undefined): string[] {
  if (!value) return [];
  const raw = value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 200) break;
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    ids: url.searchParams.get("ids") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
  }

  const ids = splitIds(parsed.data.ids);
  const q = (parsed.data.q || "").trim();
  const take = parsed.data.take;

  const where: any = { ownerId };
  if (ids.length) {
    where.id = { in: ids };
  } else if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  const contacts = await prisma.portalContact.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      updatedAt: true,
      tagAssignments: {
        select: {
          tag: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return NextResponse.json({
    ok: true,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      tags: (c as any).tagAssignments
        ? (c as any).tagAssignments
            .map((a: any) => a?.tag)
            .filter(Boolean)
            .map((t: any) => ({
              id: String(t.id),
              name: String(t.name || "").slice(0, 60),
              color: typeof t.color === "string" ? String(t.color) : null,
            }))
        : [],
    })),
  });
}
