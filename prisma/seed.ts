import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed başlıyor...');

  const hashedPw = await bcrypt.hash('admin123', 10);

  // 1. Demo kurumu oluştur
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-kurum' },
    create: {
      name: 'Demo Özel Eğitim Merkezi',
      slug: 'demo-kurum',
      active: true,
      subscription: {
        create: {
          plan: 'profesyonel',
          status: 'aktif',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      },
    },
    update: {},
  });

  console.log(`Kurum: ${org.name} (${org.slug})`);

  // 2. Kullanıcılar
  await prisma.user.upsert({
    where: { email_organizationId: { email: 'admin@kurum.com', organizationId: org.id } },
    create: {
      email: 'admin@kurum.com',
      name: 'Admin',
      password: hashedPw,
      role: 'admin',
      organizationId: org.id,
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { email_organizationId: { email: 'danisma@kurum.com', organizationId: org.id } },
    create: {
      email: 'danisma@kurum.com',
      name: 'Danışma',
      password: hashedPw,
      role: 'danisma',
      organizationId: org.id,
    },
    update: {},
  });

  // 3. Superadmin (platform yöneticisi — kuruma bağlı değil)
  // Superadmin için ayrı bir "platform" kurumu oluştur
  const platformOrg = await prisma.organization.upsert({
    where: { slug: 'platform-admin' },
    create: {
      name: 'Platform Yönetim',
      slug: 'platform-admin',
      active: true,
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { email_organizationId: { email: 'superadmin@bkdstakip.com', organizationId: platformOrg.id } },
    create: {
      email: 'superadmin@bkdstakip.com',
      name: 'Super Admin',
      password: hashedPw,
      role: 'superadmin',
      organizationId: platformOrg.id,
    },
    update: {},
  });

  console.log('Kullanicilar olusturuldu');
  console.log('Tamamlandi!');
  console.log('---');
  console.log('Demo kurum girisi:  admin@kurum.com / admin123');
  console.log('Platform yonetici:  superadmin@bkdstakip.com / admin123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
