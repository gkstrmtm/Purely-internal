import { NextResponse } from "next/server";
import { z } from "zod";

import { requireManagerSession } from "@/lib/apiAuth";
import { listBlogPostsForManager } from "@/lib/blogPostsAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  take: z.string().optional(),
  skip: z.string().optional(),
  includeArchived: z.string().optional(),
});

export async function GET(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    take: url.searchParams.get("take") ?? undefined,
    skip: url.searchParams.get("skip") ?? undefined,
    includeArchived: url.searchParams.get("includeArchived") ?? undefined,
  });

  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const take = parsed.data.take ? Number.parseInt(parsed.data.take, 10) : undefined;
  const skip = parsed.data.skip ? Number.parseInt(parsed.data.skip, 10) : undefined;
  const includeArchived = parsed.data.includeArchived === "1" || parsed.data.includeArchived === "true";

  try {
    const { hasArchivedAt, posts } = await listBlogPostsForManager({ take, skip, includeArchived });
    return NextResponse.json(
      { ok: true, hasArchivedAt, posts },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load posts",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
