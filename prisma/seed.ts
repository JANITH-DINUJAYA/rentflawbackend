import { PrismaClient, GlobalRole, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clean old seed users (optional, based on emails)
  const testEmails = ['admin@rentflaw.com', 'landlord@rentflaw.com', 'tenant@rentflaw.com'];
  await prisma.user.deleteMany({
    where: {
      email: { in: testEmails },
    },
  });

  const adminPasswordHash = await bcrypt.hash('AdminSecure123!', BCRYPT_ROUNDS);
  const landlordPasswordHash = await bcrypt.hash('LandlordSecure123!', BCRYPT_ROUNDS);
  const tenantPasswordHash = await bcrypt.hash('TenantSecure123!', BCRYPT_ROUNDS);

  // 1. Create SAAS_ADMIN user
  const admin = await prisma.user.create({
    data: {
      email: 'admin@rentflaw.com',
      password_hash: adminPasswordHash,
      first_name: 'System',
      last_name: 'Administrator',
      phone: '+94711111111',
      nic_or_passport: 'ADMINNIC99',
      global_role: GlobalRole.SAAS_ADMIN,
    },
  });
  console.log(`✅ Seeded Admin User: ${admin.email}`);

  // 2. Create LANDLORD user
  const landlordUser = await prisma.user.create({
    data: {
      email: 'landlord@rentflaw.com',
      password_hash: landlordPasswordHash,
      first_name: 'Jane',
      last_name: 'Landlord',
      phone: '+94722222222',
      nic_or_passport: 'LANDNIC88',
      global_role: GlobalRole.LANDLORD,
    },
  });

  // Create landlord profile
  const landlordProfile = await prisma.landlord.create({
    data: {
      user_id: landlordUser.id,
      company_name: 'Greenwood Rentals Ltd',
      subscription_status: SubscriptionStatus.ACTIVE,
    },
  });
  console.log(`✅ Seeded Landlord User & Profile: ${landlordUser.email}`);

  // 3. Create TENANT user
  const tenantUser = await prisma.user.create({
    data: {
      email: 'tenant@rentflaw.com',
      password_hash: tenantPasswordHash,
      first_name: 'John',
      last_name: 'Tenant',
      phone: '+94733333333',
      nic_or_passport: 'TENTNIC77',
      global_role: GlobalRole.TENANT,
      tenant_code: 'RF-2026-TEST',
    },
  });
  console.log(`✅ Seeded Tenant User: ${tenantUser.email} (Tenant Code: ${tenantUser.tenant_code})`);

  // 4. Seed Subscription Packages
  console.log('📦 Seeding subscription packages...');
  const starterPkg = await prisma.subscriptionPackage.upsert({
    where: { name: 'Starter' },
    update: {},
    create: {
      name: 'Starter',
      price: 0,
      max_properties: 2,
      max_tenants: 20,
      max_staff: 1,
    },
  });

  const proPkg = await prisma.subscriptionPackage.upsert({
    where: { name: 'Pro' },
    update: {},
    create: {
      name: 'Pro',
      price: 29.00,
      max_properties: 10,
      max_tenants: 100,
      max_staff: 5,
    },
  });

  const enterprisePkg = await prisma.subscriptionPackage.upsert({
    where: { name: 'Enterprise' },
    update: {},
    create: {
      name: 'Enterprise',
      price: 79.00,
      max_properties: 9999,
      max_tenants: 9999,
      max_staff: 9999,
    },
  });
  console.log('✅ Subscription packages seeded.');

  // 5. Link Starter subscription to seeded landlord
  await prisma.landlordSubscription.upsert({
    where: { landlord_id: landlordProfile.id },
    update: {},
    create: {
      landlord_id: landlordProfile.id,
      package_id: starterPkg.id,
      status: 'ACTIVE',
      start_date: new Date(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });
  console.log('✅ Assigned Starter package to seeded landlord.');

  console.log('🌱 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error while seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
