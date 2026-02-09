import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const createSchema = z
  .object({
    title: z.string().min(1).max(160),
    description: z.string().max(5000).optional(),
    assignedToUserId: z.string().min(1).optional().nullable(),
    dueAtIso: z.string().optional().nullable(),
  })
  .strict();

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalTasksSchema().catch(() => null);

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

  const url = new URL(req.url);
  const statusRaw = (url.searchParams.get("status") || "OPEN").toUpperCase();
  const assignedRaw = (url.searchParams.get("assigned") || "all").toLowerCase();
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 200) || 200));

  const status = statusRaw === "ALL" ? null : (statusRaw === "OPEN" || statusRaw === "DONE" || statusRaw === "CANCELED" ? statusRaw : "OPEN");
  const assignedToUserId = assignedRaw === "me" ? memberId : null;

  const whereParts: string[] = [`t."ownerId" = $1`];
  const params: any[] = [ownerId];

  if (status) {
    params.push(status);
    whereParts.push(`t."status" = $${params.length}`);
  }

  if (assignedToUserId) {
    params.push(assignedToUserId);
    whereParts.push(`t."assignedToUserId" = $${params.length}`);
  }

  params.push(limit);

  const sql = `
    SELECT
      t."id",
      t."ownerId",
      t."title",
      t."description",
      t."status",
      t."assignedToUserId",
      t."dueAt",
      t."createdAt",
      t."updatedAt",
      u."email" as "assignedEmail",
      u."name" as "assignedName"
    FROM "PortalTask" t
    LEFT JOIN "User" u ON u."id" = t."assignedToUserId"
    WHERE ${whereParts.join(" AND ")}
    ORDER BY t."updatedAt" DESC
    LIMIT $${params.length}
  `;

  const rows = (await prisma.$queryRawUnsafe(sql, ...params).catch(() => [])) as any[];

  return NextResponse.json({
    ok: true,
    tasks: rows.map((r) => ({
      id: String(r.id),
      title: String(r.title || ""),
      description: r.description ? String(r.description) : null,
      status: String(r.status || "OPEN"),
      assignedToUserId: r.assignedToUserId ? String(r.assignedToUserId) : null,
      assignedTo: r.assignedToUserId ? { userId: String(r.assignedToUserId), email: String(r.assignedEmail || ""), name: String(r.assignedName || "") } : null,
      dueAtIso: r.dueAt ? new Date(r.dueAt).toISOString() : null,
      createdAtIso: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      updatedAtIso: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalTasksSchema().catch(() => null);

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const title = parsed.data.title.trim().slice(0, 160);
  const description = (parsed.data.description ?? "").trim().slice(0, 5000);

  const assignedToUserId = (parsed.data.assignedToUserId || "").trim() || null;

  const dueAtIso = (parsed.data.dueAtIso || "").trim();
  const dueAt = dueAtIso ? new Date(dueAtIso) : null;
  if (dueAt && !Number.isFinite(dueAt.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid due date" }, { status: 400 });
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  const now = new Date();

  const sql = `
    INSERT INTO "PortalTask" ("id","ownerId","title","description","status","assignedToUserId","dueAt","createdAt","updatedAt")
    VALUES ($1,$2,$3,$4,'OPEN',$5,$6,DEFAULT,$7)
  `;

  await prisma.$executeRawUnsafe(sql, id, ownerId, title, description || null, assignedToUserId, dueAt, now);

  // Best-effort automation trigger.
  try {
    await runOwnerAutomationsForEvent({
      ownerId,
      triggerKind: "task_added",
      message: { from: "", to: "", body: title },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, taskId: id });
}
