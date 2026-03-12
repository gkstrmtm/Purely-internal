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
    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: {
        ownerId,
        serviceSlug: SERVICE_SLUG,
        status: "COMPLETE",
        dataJson: {
          version: 1,
          lastSeenAtMs: nowMs,
          lastSeenPath: typeof path === "string" ? path.slice(0, 512) : undefined,
          lastSeenSource: typeof source === "string" ? source.slice(0, 64) : undefined,
        },
      },
      update: {
        status: "COMPLETE",
        dataJson: {
          version: 1,
          lastSeenAtMs: nowMs,
          lastSeenPath: typeof path === "string" ? path.slice(0, 512) : undefined,
          lastSeenSource: typeof source === "string" ? source.slice(0, 64) : undefined,
        },
      },
      select: { id: true },
    });
  } catch {
    // ignore transient DB errors
  }

  return NextResponse.json({ ok: true });
}
