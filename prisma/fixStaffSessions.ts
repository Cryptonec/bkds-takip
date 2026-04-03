/**
 * Mevcut LessonSession kayıtlarından StaffSession oluştur
 * Bir kez çalıştır: npx tsx prisma/fixStaffSessions.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const lessons = await prisma.lessonSession.findMany({
    select: { staffId: true, tarih: true, baslangic: true, bitis: true, derslik: true, organizationId: true },
  });

  let created = 0;
  let skipped = 0;

  for (const l of lessons) {
    const existing = await prisma.staffSession.findFirst({
      where: { staffId: l.staffId, baslangic: l.baslangic, bitis: l.bitis, organizationId: l.organizationId },
    });
    if (!existing) {
      await prisma.staffSession.create({
        data: {
          staffId: l.staffId,
          tarih: l.tarih,
          baslangic: l.baslangic,
          bitis: l.bitis,
          derslik: l.derslik,
          organizationId: l.organizationId,
        },
      });
      created++;
    } else {
      skipped++;
    }
  }

  console.log(`✓ ${created} StaffSession oluşturuldu, ${skipped} zaten vardı`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
