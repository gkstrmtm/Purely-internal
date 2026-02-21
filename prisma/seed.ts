import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const inviteCode = process.env.SIGNUP_INVITE_CODE ?? "purely-dev";

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@purelyautomation.dev").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

  const dialerEmail = (process.env.SEED_DIALER_EMAIL ?? "dialer@purelyautomation.dev").toLowerCase();
  const dialerPassword = process.env.SEED_DIALER_PASSWORD ?? "dialer1234";

  const closerEmail = (process.env.SEED_CLOSER_EMAIL ?? "closer@purelyautomation.dev").toLowerCase();
  const closerPassword = process.env.SEED_CLOSER_PASSWORD ?? "closer1234";

  const creditClientEmail = (process.env.SEED_CREDIT_CLIENT_EMAIL ?? "credit-client@purelyautomation.dev").toLowerCase();
  const creditClientPassword = process.env.SEED_CREDIT_CLIENT_PASSWORD ?? "credit1234";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", active: true },
    create: {
      email: adminEmail,
      name: "Admin",
      role: "ADMIN",
      passwordHash: await hashPassword(adminPassword),
    },
  });

  await prisma.user.upsert({
    where: { email: dialerEmail },
    update: { role: "DIALER", active: true },
    create: {
      email: dialerEmail,
      name: "Demo Dialer",
      role: "DIALER",
      passwordHash: await hashPassword(dialerPassword),
    },
  });

  await prisma.user.upsert({
    where: { email: closerEmail },
    update: { role: "CLOSER", active: true },
    create: {
      email: closerEmail,
      name: "Demo Closer",
      role: "CLOSER",
      passwordHash: await hashPassword(closerPassword),
    },
  });

  await prisma.user.upsert({
    where: { email: creditClientEmail },
    update: { role: "CLIENT", active: true, clientPortalVariant: "CREDIT" as any },
    create: {
      email: creditClientEmail,
      name: "Credit Client",
      role: "CLIENT",
      active: true,
      clientPortalVariant: "CREDIT" as any,
      passwordHash: await hashPassword(creditClientPassword),
    },
  });

  const leadCount = await prisma.lead.count();
  if (leadCount === 0) {
    await prisma.lead.createMany({
      data: [
        {
          businessName: "Acme Roofing",
          phone: "+15551234567",
          website: "https://acme-roofing.example",
          location: "Austin, TX",
          niche: "Roofing",
        },
        {
          businessName: "Blue Ocean Dental",
          phone: "+15557654321",
          website: "https://blue-ocean-dental.example",
          location: "Phoenix, AZ",
          niche: "Dental",
        },
      ],
    });
  }

  // Print this so you can paste it into .env.local
  console.log("Seed complete.");
  console.log("Invite code:", inviteCode);
  console.log("Admin login:", adminEmail, adminPassword);
  console.log("Dialer login:", dialerEmail, dialerPassword);
  console.log("Closer login:", closerEmail, closerPassword);
  console.log("Credit client login:", creditClientEmail, creditClientPassword);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
