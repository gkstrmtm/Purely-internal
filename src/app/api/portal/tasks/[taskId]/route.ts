import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
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
  try {
    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = patchSchema.safeParse(body ?? {});
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

    const statusReq = parsed.data.status;
    const wantsStatusOnly =
      (statusReq === "OPEN" || statusReq === "DONE") &&
      parsed.data.title === undefined &&
      parsed.data.description === undefined &&
      parsed.data.assignedToUserId === undefined &&
      parsed.data.dueAtIso === undefined;

    // Allow assignees to mark their tasks done (and everyone tasks per-member completion)
    // without requiring full edit permissions.
    const auth = wantsStatusOnly
      ? await requireClientSessionForService("tasks")
      : await requireClientSessionForService("tasks", "edit");
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: auth.status },
      );
    }

    // If this fails, we want a real error response (not a 500 HTML page).
    await ensurePortalTasksSchema();

    const ownerId = auth.session.user.id;
    const memberId = (auth.session.user as any).memberId || ownerId;
    const { taskId } = await ctx.params;

    const trimmedTaskId = String(taskId || "").trim();
    const sets: string[] = [];
    const params: any[] = [ownerId, trimmedTaskId];

    // If the client is trying to mark a task DONE/OPEN, and the task is assigned to everyone
    // (assignedToUserId is NULL), store completion per-member instead of closing the task globally.
    let everyoneTaskCompletionHandled = false;
    if (statusReq === "DONE" || statusReq === "OPEN") {
      const row = (await prisma.$queryRawUnsafe(
        `SELECT "assignedToUserId" FROM "PortalTask" WHERE "ownerId" = $1 AND "id" = $2 LIMIT 1`,
        ownerId,
        trimmedTaskId,
      )) as any[];

      const assignedToUserId = row?.[0]?.assignedToUserId ? String(row[0].assignedToUserId) : null;

      if (wantsStatusOnly && assignedToUserId && String(assignedToUserId) !== String(memberId)) {
        return NextResponse.json({ ok: false, error: "You can only update tasks assigned to you." }, { status: 403 });
      }

      if (row?.length && !assignedToUserId) {
        const now = new Date();
        if (statusReq === "DONE") {
          const id = crypto.randomUUID().replace(/-/g, "");
          await prisma.$executeRawUnsafe(
            `INSERT INTO "PortalTaskMemberCompletion" ("id","ownerId","taskId","userId","completedAt")
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT ("taskId","userId") DO UPDATE SET "completedAt" = EXCLUDED."completedAt"`,
            id,
            ownerId,
            trimmedTaskId,
            memberId,
            now,
          );
        } else {
          await prisma.$executeRawUnsafe(
            `DELETE FROM "PortalTaskMemberCompletion" WHERE "ownerId" = $1 AND "taskId" = $2 AND "userId" = $3`,
            ownerId,
            trimmedTaskId,
            memberId,
          );
        }

        // Keep task ordering consistent in the UI.
        await prisma.$executeRawUnsafe(
          `UPDATE "PortalTask" SET "updatedAt" = $3 WHERE "ownerId" = $1 AND "id" = $2`,
          ownerId,
          trimmedTaskId,
          now,
        );

        everyoneTaskCompletionHandled = true;
      }
    }

    // Only the creator can change assignee after creation.
    if (parsed.data.assignedToUserId !== undefined) {
      const row = (await prisma.$queryRawUnsafe(
        `SELECT "createdByUserId" FROM "PortalTask" WHERE "ownerId" = $1 AND "id" = $2 LIMIT 1`,
        ownerId,
        trimmedTaskId,
      )) as any[];

      const createdByUserId = row?.[0]?.createdByUserId ? String(row[0].createdByUserId) : null;
      const canEditAssignee = createdByUserId
        ? createdByUserId === String(memberId)
        : String(memberId) === String(ownerId);
      if (!canEditAssignee) {
        return NextResponse.json({ ok: false, error: "Only the task creator can change the assignee." }, { status: 403 });
      }
    }

    if (parsed.data.status && !everyoneTaskCompletionHandled) {
      params.push(parsed.data.status);
      sets.push(`"status" = $${params.length}::"PortalTaskStatus"`);
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "Update failed") }, { status: 500 });
  }
}
