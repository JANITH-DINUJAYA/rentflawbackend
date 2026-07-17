const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const agreements = await prisma.rentalAgreement.findMany({
    include: {
      tenant: true,
      landlord: {
        include: {
          user: true
        }
      }
    }
  });
  console.log("=== ALL AGREEMENTS IN DB ===");
  console.log(JSON.stringify(agreements, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
