import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding RoadSafe database...')

  // ─── Hospitals (Hyderabad) ─────────────────────────────────────
  const hospitals = [
    {
      id: 'hosp_yashoda_001',
      name: 'Yashoda Hospitals',
      address: 'Raj Bhavan Road, Somajiguda',
      city: 'Hyderabad', state: 'Telangana', pincode: '500082',
      latitude: 17.4238, longitude: 78.4569,
      phone: '040-45674567', emergencyPhone: '040-45674500',
      emergencyEmail: 'emergency@yashodahospitals.com',
      hasTraumaCenter: true, hasBloodBank: true, hasICU: true,
      hasNeurology: true, hasCardiology: true, hasOrthopedics: true,
      bedCapacity: 600, icuBeds: 80, rating: 4.5,
    },
    {
      id: 'hosp_kims_002',
      name: 'KIMS Hospitals',
      address: 'Minister Road, Secunderabad',
      city: 'Hyderabad', state: 'Telangana', pincode: '500003',
      latitude: 17.4416, longitude: 78.4977,
      phone: '040-44885000', emergencyPhone: '040-44885001',
      emergencyEmail: 'emergency@kimshospitals.com',
      hasTraumaCenter: true, hasBloodBank: true, hasICU: true,
      hasNeurology: true, hasCardiology: true, hasOrthopedics: true,
      hasBurnUnit: false, bedCapacity: 1000, icuBeds: 120, rating: 4.6,
    },
    {
      id: 'hosp_apollo_003',
      name: 'Apollo Hospitals',
      address: 'Jubilee Hills',
      city: 'Hyderabad', state: 'Telangana', pincode: '500033',
      latitude: 17.4272, longitude: 78.4072,
      phone: '040-23607777', emergencyPhone: '040-23607700',
      emergencyEmail: 'emergency@apollohyd.com',
      hasTraumaCenter: true, hasBloodBank: true, hasICU: true,
      hasNeurology: true, hasCardiology: true, hasOrthopedics: true,
      hasBurnUnit: true, bedCapacity: 700, icuBeds: 100, rating: 4.7,
    },
    {
      id: 'hosp_care_004',
      name: 'Care Hospitals',
      address: 'Road No 1, Banjara Hills',
      city: 'Hyderabad', state: 'Telangana', pincode: '500034',
      latitude: 17.4150, longitude: 78.4480,
      phone: '040-30418888', emergencyPhone: '040-30418800',
      hasTraumaCenter: true, hasBloodBank: true, hasICU: true,
      hasCardiology: true, bedCapacity: 400, icuBeds: 60, rating: 4.3,
    },
    {
      id: 'hosp_osmania_005',
      name: 'Osmania General Hospital',
      address: 'Afzalgunj, Hyderabad',
      city: 'Hyderabad', state: 'Telangana', pincode: '500012',
      latitude: 17.3800, longitude: 78.4750,
      phone: '040-24600999', emergencyPhone: '040-24600999',
      hasTraumaCenter: true, hasBloodBank: true, hasICU: true,
      hasNeurology: true, bedCapacity: 2000, icuBeds: 200, rating: 3.8,
    },
    {
      id: 'hosp_nims_006',
      name: 'NIMS (Nizams Institute)',
      address: 'Punjagutta, Hyderabad',
      city: 'Hyderabad', state: 'Telangana', pincode: '500082',
      latitude: 17.4315, longitude: 78.4480,
      phone: '040-23489000', emergencyPhone: '040-23489000',
      hasTraumaCenter: true, hasBloodBank: true, hasICU: true,
      hasNeurology: true, hasCardiology: true, bedCapacity: 1500, icuBeds: 150, rating: 4.0,
    },
  ]

  for (const hospital of hospitals) {
    await prisma.hospital.upsert({
      where: { id: hospital.id },
      update: hospital,
      create: hospital,
    })
  }
  console.log(`  ✅ ${hospitals.length} hospitals seeded`)

  // ─── Admin user ────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@123', 10)
  await prisma.user.upsert({
    where: { email: 'admin@roadsafe.in' },
    update: {},
    create: {
      email: 'admin@roadsafe.in',
      phone: '+919999999990',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      emailVerified: true,
      phoneVerified: true,
      profile: {
        create: {
          fullName: 'RoadSafe Admin',
          bloodGroup: 'O+',
          organDonor: false,
        },
      },
    },
  })
  console.log('  ✅ Admin user: admin@roadsafe.in / Admin@123')

  // ─── Test user with full profile ───────────────────────────────
  const userHash = await bcrypt.hash('Test@1234', 10)
  const testUser = await prisma.user.upsert({
    where: { email: 'test@roadsafe.in' },
    update: {},
    create: {
      email: 'test@roadsafe.in',
      phone: '+919876543210',
      passwordHash: userHash,
      role: 'USER',
      emailVerified: true,
      phoneVerified: true,
    },
  })

  // Profile with complete medical data
  const profile = await prisma.profile.upsert({
    where: { userId: testUser.id },
    update: {},
    create: {
      userId: testUser.id,
      fullName: 'Ravi Kumar',
      bloodGroup: 'B+',
      allergies: ['Penicillin', 'Sulfa drugs'],
      chronicConditions: ['Hypertension'],
      currentMedications: ['Amlodipine 5mg'],
      organDonor: true,
      medicalNotes: 'Patient has mild hypertension. On BP medication daily.',
    },
  })

  // Emergency contacts
  const existingContacts = await prisma.emergencyContact.count({ where: { profileId: profile.id } })
  if (existingContacts === 0) {
    await prisma.emergencyContact.createMany({
      data: [
        { profileId: profile.id, relationship: 'FATHER', name: 'Krishna Kumar', phone: '+919876543211', email: 'krishna@example.com', priority: 1 },
        { profileId: profile.id, relationship: 'MOTHER', name: 'Lakshmi Kumar', phone: '+919876543212', priority: 2 },
        { profileId: profile.id, relationship: 'SIBLING', name: 'Priya Kumar', phone: '+919876543213', priority: 3 },
      ],
    })
  }

  // Vehicle
  const vehicle = await prisma.vehicle.upsert({
    where: { vehicleNumber: 'TS09EA1234' },
    update: {},
    create: {
      userId: testUser.id,
      vehicleNumber: 'TS09EA1234',
      vehicleType: 'CAR',
      make: 'Maruti Suzuki',
      model: 'Swift',
      color: 'White',
      yearOfMfg: 2021,
    },
  })

  console.log(`  ✅ Test user: test@roadsafe.in / Test@1234`)
  console.log(`     Vehicle: TS09EA1234 (${vehicle.vehicleType})`)
  console.log('')
  console.log('🌱 Seed complete! Ready to run RoadSafe.')
}

main()
  .catch((err) => { console.error('Seed failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
