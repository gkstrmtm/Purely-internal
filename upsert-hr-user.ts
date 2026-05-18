
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function main() {
  loadEnvConfig(process.cwd());

  const prisma = new PrismaClient();

  const email = "hr@purelyautomation.dev";
  const password = "hr1234";
  const name = "Demo HR";
  const role = "HR";

  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        role,
        passwordHash,
        active: true,
      },
      create: {
        email,
        name,
        role,
        passwordHash,
        active: true,
      },
    });
    console.log("SUCCESS: User upserted:", user.email);
    console.log("Credentials: hr@purelyautomation.dev / hr1234");
  } catch (error) {
    console.error("FAILURE: Error upserting user:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
