import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireManagerSession } from "@/lib/apiAuth";
import { ensureBlogPostArchivedAtColumnSafe } from "@/lib/blogPostsAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  action: z.enum(["archive", "delete"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  try {
    const ids = Array.from(new Set(parsed.data.ids));

    if (parsed.data.action === "archive") {
      await ensureBlogPostArchivedAtColumnSafe();
      const res = await prisma.blogPost.updateMany({
        where: { id: { in: ids } },
        data: { archivedAt: new Date() },
      });
      return NextResponse.json({ ok: true, action: "archive", updated: res.count });
    }

    const res = await prisma.blogPost.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ ok: true, action: "delete", deleted: res.count });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Bulk action failed",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
