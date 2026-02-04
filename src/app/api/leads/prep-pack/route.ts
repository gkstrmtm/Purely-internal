import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  leadId: z.string().min(1),
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ leadId: url.searchParams.get("leadId") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const where =
    role === "MANAGER" || role === "ADMIN"
      ? { leadId: parsed.data.leadId, kind: "LEAD_PREP_PACK" }
      : { ownerId: userId, leadId: parsed.data.leadId, kind: "LEAD_PREP_PACK" };

  const doc = await prisma.doc.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, content: true },
  });

  return NextResponse.json({ doc: doc ?? null });
}
