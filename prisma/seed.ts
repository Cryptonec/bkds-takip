import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seed başlıyor...');

  const hashedPw = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@kurum.com' },
    create: { email: 'admin@kurum.com', name: 'Admin', password: hashedPw, role: 'admin' },
    update: {},
  });

  await prisma.user.upsert({
    where: { email: 'danisma@kurum.com' },
    create: { email: 'danisma@kurum.com', name: 'Danışma', password: hashedPw, role: 'danisma' },
    update: {},
  });

  console.log('✓ Kullanıcılar oluşturuldu');
  console.log('✅ Tamamlandı!');
  console.log('📧 admin@kurum.com / admin123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());