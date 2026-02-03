/* eslint-disable @typescript-eslint/no-require-imports */

const { PrismaClient } = require("@prisma/client");

function stripDoubleAsterisks(input) {
  return typeof input === "string" ? input.replace(/\*\*/g, "") : input;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const pageSize = 200;
    let updated = 0;
    let scanned = 0;
    let lastId = null;

    for (;;) {
      const posts = await prisma.blogPost.findMany({
        take: pageSize,
        ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
        orderBy: { id: "asc" },
        select: { id: true, slug: true, title: true, excerpt: true, content: true },
      });

      if (!posts.length) break;

      for (const post of posts) {
        scanned++;

        const nextTitle = stripDoubleAsterisks(post.title);
        const nextExcerpt = stripDoubleAsterisks(post.excerpt);
        const nextContent = stripDoubleAsterisks(post.content);

        const changed = nextTitle !== post.title || nextExcerpt !== post.excerpt || nextContent !== post.content;
        if (!changed) continue;

        await prisma.blogPost.update({
          where: { id: post.id },
          data: {
            title: nextTitle,
            excerpt: nextExcerpt,
            content: nextContent,
          },
        });

        updated++;
        console.log(`updated ${post.slug}`);
      }

      lastId = posts[posts.length - 1].id;
    }

    const remaining = await prisma.blogPost.count({
      where: {
        OR: [{ title: { contains: "**" } }, { excerpt: { contains: "**" } }, { content: { contains: "**" } }],
      },
    });

    console.log(JSON.stringify({ ok: true, scanned, updated, remaining }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
