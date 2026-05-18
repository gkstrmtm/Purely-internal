const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const keywords = ['demo', 'test', 'preview', 'credit-client'];
  
  const users = await prisma.user.findMany({
    where: {
      role: 'CLIENT',
      OR: [
        ...keywords.map(k => ({ email: { contains: k, mode: 'insensitive' } })),
        ...keywords.map(k => ({ name: { contains: k, mode: 'insensitive' } }))
      ]
    },
    select: {
      id: true,
      email: true,
      name: true,
      active: true
    }
  });

  const activeUsers = users.filter(u => u.active === true);
  const inactiveUsers = users.filter(u => u.active === false);

  process.stdout.write('--- Summary ---\n');
  process.stdout.write('Total Matching CLIENT Users: ' + users.length + '\n');
  process.stdout.write('Active Users (active=true): ' + activeUsers.length + '\n');
  process.stdout.write('Inactive Users (active=false): ' + inactiveUsers.length + '\n');

  if (activeUsers.length > 0) {
    process.stdout.write('\n--- Active Matching Users ---\n');
    activeUsers.forEach(u => {
      process.stdout.write('ID: ' + u.id + ' | Email: ' + u.email + ' | Name: ' + u.name + '\n');
    });
  } else {
    process.stdout.write('\nNo active matching users found.\n');
  }
}

main()
  .catch(e => {
    process.stderr.write(e.toString() + '\n');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.\();
  });
