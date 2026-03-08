import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    action: z.enum(["cancel", "resume"]),
  })
  .strict();

function readObj(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as any;
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const ownerId = auth.session.user.id;
  const nowIso = new Date().toISOString();

  const nextState = parsed.data.action === "cancel" ? "canceled" : "active";
  const reason = parsed.data.action === "cancel" ? "credits_only_cancel" : "credits_only_resume";

  const serviceSlugs = Array.from(
    new Set(
      PORTAL_SERVICES.filter((s) => !s.hidden)
        .map((s) => s.slug)
        .filter(Boolean),
    ),
  );

  await prisma.$transaction(async (tx) => {
    // Cancel/resume every portal service (even included ones) so requireClientSessionForService blocks access.
    for (const serviceSlug of serviceSlugs) {
      const existing = await tx.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug } },
        select: { dataJson: true, status: true },
      });

      const prevJson = readObj(existing?.dataJson) ?? {};
      const prevLifecycle = readObj(prevJson.lifecycle) ?? {};

      const nextJson = {
        ...prevJson,
        lifecycle: {
          ...prevLifecycle,
          state: nextState,
          reason,
          updatedAtIso: nowIso,
        },
      };

      await tx.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug } },
        create: { ownerId, serviceSlug, status: existing?.status ?? "COMPLETE", dataJson: nextJson },
        update: { dataJson: nextJson },
        select: { id: true },
      });
    }

    // Also mark credits billing as canceled/resumed.
    {
      const serviceSlug = "credits";
      const existing = await tx.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug } },
        select: { dataJson: true, status: true },
      });
      const prevJson = readObj(existing?.dataJson) ?? {};
      const prevLifecycle = readObj(prevJson.lifecycle) ?? {};
      const nextJson = {
        ...prevJson,
        lifecycle: {
          ...prevLifecycle,
          state: nextState,
          reason,
          updatedAtIso: nowIso,
        },
      };

      await tx.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug } },
        create: { ownerId, serviceSlug, status: existing?.status ?? "COMPLETE", dataJson: nextJson },
        update: { dataJson: nextJson },
        select: { id: true },
      });
    }
  });

  return NextResponse.json({ ok: true, state: nextState });
}
