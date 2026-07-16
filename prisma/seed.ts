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
