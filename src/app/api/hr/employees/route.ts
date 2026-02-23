import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";

export async function GET() {
  const auth = await requireStaffSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const users = await prisma.user.findMany({
    where: {
      active: true,
      NOT: { role: "CLIENT" },
    },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    take: 500,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, employees: users });
}
