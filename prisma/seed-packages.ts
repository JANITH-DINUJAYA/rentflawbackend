import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📦 Seeding subscription packages...');

  const starter = await prisma.subscriptionPackage.upsert({
    where: { name: 'Starter' },
    update: { price: 0, max_properties: 2, max_tenants: 20, max_staff: 1 },
    create: { name: 'Starter', price: 0, max_properties: 2, max_tenants: 20, max_staff: 1 },
  });

  const pro = await prisma.subscriptionPackage.upsert({
    where: { name: 'Pro' },
    update: { price: 29, max_properties: 10, max_tenants: 100, max_staff: 5 },
    create: { name: 'Pro', price: 29, max_properties: 10, max_tenants: 100, max_staff: 5 },
  });

  const enterprise = await prisma.subscriptionPackage.upsert({
    where: { name: 'Enterprise' },
    update: { price: 79, max_properties: 9999, max_tenants: 9999, max_staff: 9999 },
    create: { name: 'Enterprise', price: 79, max_properties: 9999, max_tenants: 9999, max_staff: 9999 },
  });

  console.log(`✅ Packages: ${starter.name}, ${pro.name}, ${enterprise.name}`);

  // Link starter to the landlord user if no subscription yet
  const landlord = await prisma.landlord.findFirst({
    where: { user: { email: 'landlord@rentflaw.com' } },
  });

  if (landlord) {
    await prisma.landlordSubscription.upsert({
      where: { landlord_id: landlord.id },
      update: {},
      create: {
        landlord_id: landlord.id,
        package_id: starter.id,
        status: 'ACTIVE',
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`✅ Linked Starter plan to landlord@rentflaw.com`);
  } else {
    console.log('ℹ️ No landlord@rentflaw.com found — skipping subscription link.');
  }

  console.log('✅ Done!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
