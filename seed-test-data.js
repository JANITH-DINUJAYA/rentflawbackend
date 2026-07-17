/**
 * Full test data seed for RentFlaw.
 * Creates a property, floor, room, and test agreements including one TERMINATION_REQUESTED.
 * 
 * Run with: node seed-test-data.js
 */
const { PrismaClient, AgreementStatus, LeavingOption, OccupancyType, PropertyType } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding test data...');

  // Get seeded users
  const landlordUser = await prisma.user.findUnique({ where: { email: 'landlord@rentflaw.com' } });
  const tenantUser = await prisma.user.findUnique({ where: { email: 'tenant@rentflaw.com' } });
  const landlordProfile = await prisma.landlord.findUnique({ where: { user_id: landlordUser.id } });

  if (!landlordUser || !tenantUser || !landlordProfile) {
    throw new Error('Seed users not found. Run prisma db seed first.');
  }

  // Clean any old test data
  await prisma.rentalAgreement.deleteMany({ where: { landlord_id: landlordProfile.id } });
  await prisma.room.deleteMany({ where: { floor: { property: { landlord_id: landlordProfile.id } } } });
  await prisma.floor.deleteMany({ where: { property: { landlord_id: landlordProfile.id } } });
  await prisma.property.deleteMany({ where: { landlord_id: landlordProfile.id } });

  // Create property
  const property = await prisma.property.create({
    data: {
      landlord_id: landlordProfile.id,
      name: 'Greenwood Heights',
      address: '123 Greenwood Ave, Colombo 05',
      type: PropertyType.APARTMENT,
    },
  });
  console.log('✅ Created property:', property.name);

  // Create floor
  const floor = await prisma.floor.create({
    data: {
      property_id: property.id,
      name: 'Ground Floor',
    },
  });
  console.log('✅ Created floor:', floor.name);

  // Create two rooms
  const room1 = await prisma.room.create({
    data: {
      floor_id: floor.id,
      room_number: '101',
      occupancy_type: OccupancyType.ENTIRE,
      capacity: 1,
      base_rent: 450.00,
    },
  });

  const room2 = await prisma.room.create({
    data: {
      floor_id: floor.id,
      room_number: '102',
      occupancy_type: OccupancyType.ENTIRE,
      capacity: 1,
      base_rent: 500.00,
    },
  });
  console.log('✅ Created rooms 101 and 102');

  // Create ACTIVE agreement for John Tenant in Room 101
  const activeAgreement = await prisma.rentalAgreement.create({
    data: {
      landlord_id: landlordProfile.id,
      tenant_id: tenantUser.id,
      property_id: property.id,
      room_id: room1.id,
      rent_amount: 450.00,
      security_deposit: 900.00,
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-12-31'),
      collection_day: 5,
      grace_period_days: 3,
      late_fee_flat: 25.00,
      leaving_option: LeavingOption.PAY_STAY_DATES,
      status: AgreementStatus.ACTIVE,
    },
  });
  console.log('✅ Created ACTIVE agreement for John Tenant in Room 101 (ID:', activeAgreement.id, ')');

  // Create a second tenant user if not exists
  let tenant2 = await prisma.user.findUnique({ where: { email: 'tenant2@rentflaw.com' } });
  if (!tenant2) {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('TenantSecure123!', 12);
    tenant2 = await prisma.user.create({
      data: {
        email: 'tenant2@rentflaw.com',
        password_hash: hash,
        first_name: 'Alice',
        last_name: 'Vance',
        phone: '+94744444444',
        nic_or_passport: 'TENTNIC99',
        global_role: 'TENANT',
        tenant_code: 'RF-2026-T2',
      },
    });
    console.log('✅ Created second tenant: Alice Vance');
  }

  // Create TERMINATION_REQUESTED agreement for Alice in Room 102
  const leaveAgreement = await prisma.rentalAgreement.create({
    data: {
      landlord_id: landlordProfile.id,
      tenant_id: tenant2.id,
      property_id: property.id,
      room_id: room2.id,
      rent_amount: 500.00,
      security_deposit: 1000.00,
      start_date: new Date('2026-02-01'),
      end_date: new Date('2026-12-31'),
      collection_day: 5,
      grace_period_days: 3,
      late_fee_flat: 25.00,
      leaving_option: LeavingOption.PAY_FULL_MONTH,
      status: AgreementStatus.TERMINATION_REQUESTED,
    },
  });
  console.log('✅ Created TERMINATION_REQUESTED agreement for Alice Vance in Room 102 (ID:', leaveAgreement.id, ')');

  console.log('\n🎉 Test data seeded successfully!');
  console.log('\n🔑 Test credentials:');
  console.log('  SAAS Admin:  admin@rentflaw.com    / AdminSecure123!');
  console.log('  Landlord:    landlord@rentflaw.com / LandlordSecure123!');
  console.log('  Tenant 1:    tenant@rentflaw.com   / TenantSecure123!  (has ACTIVE agreement - can request leave)');
  console.log('  Tenant 2:    tenant2@rentflaw.com  / TenantSecure123!  (has TERMINATION_REQUESTED agreement)');
}

main().catch(console.error).finally(() => prisma.$disconnect());
