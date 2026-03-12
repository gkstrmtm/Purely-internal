import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    path: z.string().max(512).optional(),
    source: z.string().max(64).optional(),
  })
  .strict();

const SERVICE_SLUG = "portal_engagement";

function readObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const nowMs = Date.now();
  const { path, source } = parsed.data;

  // Migration-free: keep engagement state in PortalServiceSetup JSON.
  // (This is also tenant-safe because it's keyed by the logged-in ownerId.)
  try {
    const existing = await prisma.portalServiceSetup
      .findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
        select: { dataJson: true },
      })
      .catch(() => null);

    const prev = readObj(existing?.dataJson);
    const next = {
      ...prev,
      version: 2,
      lastSeenAtMs: nowMs,
      ...(typeof path === "string" ? { lastSeenPath: path.slice(0, 512) } : {}),
      ...(typeof source === "string" ? { lastSeenSource: source.slice(0, 64) } : {}),
    };

    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: {
        ownerId,
        serviceSlug: SERVICE_SLUG,
        status: "COMPLETE",
        dataJson: next,
      },
      update: {
        status: "COMPLETE",
        dataJson: next,
      },
      select: { id: true },
    });
  } catch {
    // ignore transient DB errors
  }

  return NextResponse.json({ ok: true });
}
