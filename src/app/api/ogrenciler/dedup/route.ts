/**
 * POST /api/ogrenciler/dedup
 * Aynı normalizedName'e sahip yinelenen öğrenci kayıtlarını temizler.
 * En eski kaydı korur, diğerlerine ait tüm ilişkileri (lessonSession,
 * attendance, bkdsAggregate) korunan kayda taşır ve yinelenenleri siler.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Öğrenci olmayan bilinen junk kayıtlar
const JUNK_PATTERNS = [
  'ogrenci listesi', 'ogrenci bilgileri', 'ogrenciler',
  'sira', 'sira no', 'baslik', 'aciklama',
];

function isJunk(normalizedName: string) {
  return JUNK_PATTERNS.some(p => normalizedName === p || normalizedName.startsWith(p + ' '));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  // Tüm öğrencileri çek
  const all = await prisma.student.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' }, // en eski önce — korunacak olan
  });

  // normalizedName'e göre grupla
  const groups = new Map<string, typeof all>();
  for (const s of all) {
    const list = groups.get(s.normalizedName) ?? [];
    list.push(s);
    groups.set(s.normalizedName, list);
  }

  let deletedJunk = 0;
  let deletedDups = 0;

  for (const [normName, group] of groups) {
    // Junk kayıtları sil (tek bile olsa)
    if (isJunk(normName)) {
      for (const s of group) {
        await prisma.lessonSession.deleteMany({ where: { studentId: s.id } });
        await prisma.attendance.deleteMany({ where: { studentId: s.id } });
        await prisma.bkdsAggregate.deleteMany({ where: { studentId: s.id } });
        await prisma.student.delete({ where: { id: s.id } });
        deletedJunk++;
      }
      continue;
    }

    if (group.length <= 1) continue;

    // En eskiyi koru, diğerlerini sil
    const [keep, ...dupes] = group;
    for (const dupe of dupes) {
      // İlişkileri korunan kayda taşı
      await prisma.lessonSession.updateMany({ where: { studentId: dupe.id }, data: { studentId: keep.id } });
      await prisma.attendance.updateMany({ where: { studentId: dupe.id }, data: { studentId: keep.id } });
      await prisma.bkdsAggregate.deleteMany({ where: { studentId: dupe.id } }); // aggregate yeniden hesaplanır
      await prisma.student.delete({ where: { id: dupe.id } });
      deletedDups++;
    }
  }

  return NextResponse.json({ ok: true, deletedDups, deletedJunk });
}
