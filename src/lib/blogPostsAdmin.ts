import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export async function ensureBlogPostArchivedAtColumnSafe() {
  try {
    await prisma.$executeRawUnsafe(`
      alter table "BlogPost"
      add column if not exists "archivedAt" timestamp(3);
    `);

    await prisma.$executeRawUnsafe(`
      create index if not exists "BlogPost_archivedAt_idx" on "BlogPost" ("archivedAt");
    `);
  } catch {
    // best-effort: permissions or DB differences shouldn't crash the app
  }
}

export async function listBlogPostsForManager(params?: {
  take?: number;
  skip?: number;
  includeArchived?: boolean;
}) {
  const take = Math.min(500, Math.max(1, params?.take ?? 200));
  const skip = Math.max(0, params?.skip ?? 0);
  const includeArchived = Boolean(params?.includeArchived);

  const hasArchivedAt = await hasPublicColumn("BlogPost", "archivedAt");
  const where = hasArchivedAt && !includeArchived ? { archivedAt: null } : undefined;

  const posts = await prisma.blogPost.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    take,
    skip,
    select: {
      id: true,
      slug: true,
      title: true,
      publishedAt: true,
      ...(hasArchivedAt ? { archivedAt: true } : {}),
    },
  });

  return { hasArchivedAt, posts };
}
