const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DELETED_ACCOUNT_SETUP_SLUG = "__portal_deleted_account";

async function main() {
  const adminEmail = "admin@purelyautomation.dev";
  const admin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });
  const adminUserId = admin?.id || null;

  const usersToTombstone = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      OR: [
        { email: { contains: "demo", mode: "insensitive" } },
        { email: { contains: "test", mode: "insensitive" } },
        { email: { contains: "preview", mode: "insensitive" } },
        { email: { contains: "credit-client", mode: "insensitive" } },
        { name: { contains: "demo", mode: "insensitive" } },
        { name: { contains: "test", mode: "insensitive" } },
        { name: { contains: "preview", mode: "insensitive" } },
        { name: { contains: "credit-client", mode: "insensitive" } },
      ],
      NOT: {
        email: { contains: "@purelyautomation.invalid" }
      }
    },
    select: { id: true, email: true, name: true },
  });

  console.log(`Found ${usersToTombstone.length} users to tombstone.`);

  const results = [];

  for (const user of usersToTombstone) {
    const originalEmail = String(user.email || "").trim().toLowerCase();
    const originalName = String(user.name || "").trim();
    const deletedAtIso = new Date().toISOString();
    const tombstoneEmail = `deleted+${user.id}@purelyautomation.invalid`;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.portalServiceSetup.upsert({
          where: { ownerId_serviceSlug: { ownerId: user.id, serviceSlug: DELETED_ACCOUNT_SETUP_SLUG } },
          update: {
            status: "COMPLETE",
            dataJson: {
              version: 1,
              deletedAtIso,
              deletedByUserId: adminUserId,
              originalEmail,
              originalName,
            },
          },
          create: {
            ownerId: user.id,
            serviceSlug: DELETED_ACCOUNT_SETUP_SLUG,
            status: "COMPLETE",
            dataJson: {
              version: 1,
              deletedAtIso,
              deletedByUserId: adminUserId,
              originalEmail,
              originalName,
            },
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: {
            active: false,
            email: tombstoneEmail,
            name: originalName ? `[Deleted] ${originalName}`.slice(0, 120) : "[Deleted]",
          },
        });
      });
      results.push({ id: user.id, email: originalEmail });
    } catch (err) {
      console.error(`Failed to tombstone user ${user.id}:`, err);
    }
  }

  console.log(`\nChanged ${results.length} users:`);
  results.forEach(r => console.log(`${r.id}: ${r.email}`));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
