const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const patterns = ["demo", "test", "preview", "credit-client", "purelyautomation.dev"];
  const users = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      OR: [
        ...patterns.map(p => ({ email: { contains: p, mode: "insensitive" } })),
        ...patterns.map(p => ({ name: { contains: p, mode: "insensitive" } }))
      ]
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clientPortalVariant: true
    }
  });

  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
