/**
 * Render shell'den veya lokalde çalıştırılacak org+admin kurulum scripti.
 *
 * Kullanım:
 *   ORG_SLUG=1 ORG_NAME="Kurum Adı" ADMIN_EMAIL="admin@kurum.com" ADMIN_PASSWORD="guclu_sifre" \
 *   npx tsx prisma/setup-org.ts
 *
 * Tüm parametreler zorunludur. Script idempotent'tir (tekrar çalıştırılabilir).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`HATA: ${name} ortam değişkeni eksik.`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const slug = requireEnv('ORG_SLUG');
  const name = process.env.ORG_NAME ?? `Kurum ${slug}`;
  const adminEmail = requireEnv('ADMIN_EMAIL');
  const adminPassword = requireEnv('ADMIN_PASSWORD');

  console.log(`\nKurum kurulumu başlıyor...`);
  console.log(`  slug       : ${slug}`);
  console.log(`  isim       : ${name}`);
  console.log(`  admin email: ${adminEmail}`);

  // 1. Organizasyon
  const org = await prisma.organization.upsert({
    where: { slug },
    create: {
      name,
      slug,
      plan: 'basic',
      active: true,
    },
    update: { name, active: true },
  });
  console.log(`\n  Organizasyon: ${org.name} (id: ${org.id})`);

  // 2. Admin kullanıcı
  const hashedPw = await bcrypt.hash(adminPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: `${name} Admin`,
      password: hashedPw,
      role: 'admin',
      organizationId: org.id,
      active: true,
    },
    update: {
      password: hashedPw,
      organizationId: org.id,
      active: true,
    },
  });
  console.log(`  Admin kullanıcı: ${user.email} (id: ${user.id})`);

  // 3. Kullanıcı doğru kuruma bağlı mı?
  if (user.organizationId !== org.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id },
    });
    console.log(`  Kullanıcı kuruma bağlandı.`);
  }

  console.log(`\nKurulum tamamlandı!`);
  console.log(`  Rehapp'ta bu kurumun BKDS kimlik bilgileri olarak şunu girin:`);
  console.log(`    E-posta : ${adminEmail}`);
  console.log(`    Şifre   : (girdiğiniz şifre)`);
  console.log(`    org_slug: ${slug}  (rehapp kurum ID'si ile eşleşmeli)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
