const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      staff_profile: {
        include: {
          role: true
        }
      },
      landlord_profile: true
    }
  });
  console.log("=== ALL USERS IN DB ===");
  console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
