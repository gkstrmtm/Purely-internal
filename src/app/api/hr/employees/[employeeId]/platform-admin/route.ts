import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setPlatformAdminGrant } from "@/lib/platformAdminGrants";

const bodySchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const employeeId = String((await params)?.employeeId || "").trim();
  if (!employeeId) return NextResponse.json({ ok: false, error: "Invalid employeeId" }, { status: 400 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, role: true, active: true, email: true, name: true },
  });

  if (!target || !target.active || target.role === "CLIENT") {
    return NextResponse.json({ ok: false, error: "Employee not found" }, { status: 404 });
  }

  if (target.role === "ADMIN") {
    return NextResponse.json({ ok: false, error: "Admins already have platform access" }, { status: 400 });
  }

  const result = await setPlatformAdminGrant({
    userId: target.id,
    actorUserId: session.user.id,
    enabled: parsed.data.enabled,
  });

  return NextResponse.json({
    ok: true,
    employee: {
      id: target.id,
      email: target.email,
      name: target.name,
      role: target.role,
      platformAdminGranted: result.enabled,
    },
  });
}