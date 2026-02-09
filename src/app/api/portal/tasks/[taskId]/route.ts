import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    status: z.enum(["OPEN", "DONE", "CANCELED"]).optional(),
    title: z.string().min(1).max(160).optional(),
    description: z.string().max(5000).optional().nullable(),
    assignedToUserId: z.string().min(1).optional().nullable(),
    dueAtIso: z.string().optional().nullable(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalTasksSchema().catch(() => null);

  const ownerId = auth.session.user.id;
  const { taskId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const sets: string[] = [];
  const params: any[] = [ownerId, String(taskId || "").trim()];

  if (parsed.data.status) {
    params.push(parsed.data.status);
    sets.push(`"status" = $${params.length}`);
  }

  if (typeof parsed.data.title === "string") {
    params.push(parsed.data.title.trim().slice(0, 160));
    sets.push(`"title" = $${params.length}`);
  }

  if (parsed.data.description !== undefined) {
    const desc = parsed.data.description === null ? null : String(parsed.data.description || "").trim().slice(0, 5000);
    params.push(desc);
    sets.push(`"description" = $${params.length}`);
  }

  if (parsed.data.assignedToUserId !== undefined) {
    const v = parsed.data.assignedToUserId ? String(parsed.data.assignedToUserId).trim() : null;
    params.push(v || null);
    sets.push(`"assignedToUserId" = $${params.length}`);
  }

  if (parsed.data.dueAtIso !== undefined) {
    const raw = parsed.data.dueAtIso ? String(parsed.data.dueAtIso).trim() : "";
    const dueAt = raw ? new Date(raw) : null;
    if (dueAt && !Number.isFinite(dueAt.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid due date" }, { status: 400 });
    }
    params.push(dueAt);
    sets.push(`"dueAt" = $${params.length}`);
  }

  if (!sets.length) return NextResponse.json({ ok: true });

  params.push(new Date());
  sets.push(`"updatedAt" = $${params.length}`);

  const sql = `
    UPDATE "PortalTask"
    SET ${sets.join(", ")}
    WHERE "ownerId" = $1 AND "id" = $2
  `;

  await prisma.$executeRawUnsafe(sql, ...params);

  return NextResponse.json({ ok: true });
}
