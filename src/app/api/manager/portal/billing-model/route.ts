import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } from "@/lib/portalBillingModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireManager(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const };
  if (role !== "MANAGER" && role !== "ADMIN") return { ok: false as const, status: 403 as const };
  return { ok: true as const, userId };
}

const bodySchema = z
  .object({
    ownerIds: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
    creditsOnly: z.boolean(),
  })
  .strict();

function encodeCreditsOnlyOverride(updatedByUserId: string) {
  return {
    version: 1,
    billingModel: "credits",
    creditsOnly: true,
    updatedAtIso: new Date().toISOString(),
    updatedByUserId,
  };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const auth = requireManager(session);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { ownerIds, creditsOnly } = parsed.data;

  if (!creditsOnly) {
    await prisma.portalServiceSetup
      .deleteMany({ where: { ownerId: { in: ownerIds }, serviceSlug: PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } })
      .catch(() => null);

    return NextResponse.json({ ok: true, creditsOnly: false });
  }

  const dataJson = encodeCreditsOnlyOverride(auth.userId);

  await prisma.$transaction(
    ownerIds.map((ownerId) =>
      prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } },
        update: { status: "COMPLETE", dataJson: dataJson as any },
        create: {
          ownerId,
          serviceSlug: PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG,
          status: "COMPLETE",
          dataJson: dataJson as any,
        },
        select: { id: true },
      }),
    ),
  );

  return NextResponse.json({ ok: true, creditsOnly: true });
}
