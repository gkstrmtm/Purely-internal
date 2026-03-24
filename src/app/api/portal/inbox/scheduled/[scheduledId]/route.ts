import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z.object({
  scheduledFor: z.string().datetime(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ scheduledId: string }> }) {
  const auth = await requireClientSessionForService("inbox");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { scheduledId } = await params;
  const id = String(scheduledId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing scheduled id" }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const when = new Date(parsed.data.scheduledFor);
  if (!Number.isFinite(when.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid scheduled time" }, { status: 400 });
  }

  // Avoid runtime failures if migrations haven't been applied yet.
  await ensurePortalInboxSchema();

  const existing = await (prisma as any).portalInboxScheduledMessage
    .findFirst({
      where: { id, ownerId },
      select: { id: true, status: true },
    })
    .catch(() => null);

  if (!existing) return NextResponse.json({ ok: false, error: "Scheduled message not found" }, { status: 404 });

  const status = String(existing.status || "").toUpperCase();
  if (status !== "PENDING") {
    return NextResponse.json({ ok: false, error: "Only pending scheduled messages can be rescheduled." }, { status: 409 });
  }

  // If they're basically scheduling for "now", just nudge them to send normally.
  if (when.getTime() < Date.now() + 10_000) {
    return NextResponse.json({ ok: false, error: "Pick a time at least 10 seconds from now." }, { status: 400 });
  }

  await (prisma as any).portalInboxScheduledMessage.update({
    where: { id },
    data: { scheduledFor: when, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
