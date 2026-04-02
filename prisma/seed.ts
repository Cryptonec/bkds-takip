import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed başlıyor...');

  const hashedPw = await bcrypt.hash('admin123', 10);

  // ── Superadmin (kuruma bağlı değil) ─────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'superadmin@rehapp.com' },
    create: {
      email: 'superadmin@rehapp.com',
      name: 'Super Admin',
      password: hashedPw,
      role: 'superadmin',
    },
    update: {},
  });
  console.log('  superadmin@rehapp.com / admin123');

  // ── Demo kurum ───────────────────────────────────────────────────────────
  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-kurum' },
    create: {
      name: 'Demo Kurum',
      slug: 'demo-kurum',
      plan: 'trial',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 gün
    },
    update: {},
  });
  console.log(`  Kurum oluşturuldu: ${demoOrg.name} (slug: ${demoOrg.slug})`);

  // ── Demo kurum admin kullanıcısı ─────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'admin@demo-kurum.com' },
    create: {
      email: 'admin@demo-kurum.com',
      name: 'Demo Admin',
      password: hashedPw,
      role: 'admin',
      organizationId: demoOrg.id,
    },
    update: {},
  });
  console.log('  admin@demo-kurum.com / admin123');

  await prisma.user.upsert({
    where: { email: 'danisma@demo-kurum.com' },
    create: {
      email: 'danisma@demo-kurum.com',
      name: 'Demo Danışma',
      password: hashedPw,
      role: 'danisma',
      organizationId: demoOrg.id,
    },
    update: {},
  });
  console.log('  danisma@demo-kurum.com / admin123');

  // ── Demo kurum BKDS kimlik bilgileri (opsiyonel, .env yoksa) ────────────
  // Gerçek credentials için admin panelden güncelle
  const existingCred = await prisma.bkdsCredential.findUnique({
    where: { organizationId: demoOrg.id },
  });
  if (!existingCred) {
    await prisma.bkdsCredential.create({
      data: {
        organizationId: demoOrg.id,
        username: process.env.BKDS_USERNAME ?? 'demo_kullanici',
        password: process.env.BKDS_PASSWORD ?? 'demo_sifre',
        cityId: process.env.BKDS_CITY_ID ?? '34',
        districtId: process.env.BKDS_DISTRICT_ID ?? '1',
        remId: process.env.BKDS_REM_ID ?? '1',
        apiUrl: process.env.BKDS_API_URL ?? 'https://bkds-api.meb.gov.tr',
      },
    });
    console.log('  BKDS credentials oluşturuldu (env veya placeholder)');
  }

  console.log('\nTamamlandi!');
  console.log('Superadmin : superadmin@rehapp.com / admin123');
  console.log('Demo admin : admin@demo-kurum.com  / admin123');
  console.log('Demo kurum slug: demo-kurum  (Rehapp org_slug ile eslestir)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
