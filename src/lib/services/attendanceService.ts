import { prisma } from '@/lib/prisma';
import { calculateAttendanceStatus } from './attendanceEngine';
import { calculateStaffStatus } from './staffAttendanceEngine';

/**
 * Belirtilen tarih için tüm attendance kayıtlarını güncelle
 */
export async function recalculateAttendance(tarih: Date, now: Date = new Date()): Promise<void> {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  // Tüm ders oturumlarını çek
  const lessons = await prisma.lessonSession.findMany({
    where: { tarih: dateOnly },
    include: {
      student: true,
    },
  });

  for (const lesson of lessons) {
    // BKDS aggregate verisini çek
    const bkds = lesson.studentId
      ? await prisma.bkdsAggregate.findFirst({
          where: {
            studentId: lesson.studentId,
            tarih: dateOnly,
          },
        })
      : null;

    const status = calculateAttendanceStatus({
      lesson: {
        baslangic: lesson.baslangic,
        bitis: lesson.bitis,
        bkdsRequired: lesson.bkdsRequired,
      },
      bkdsGiris: bkds?.ilkGiris,
      bkdsCikis: bkds?.sonCikis,
      now,
    });

    await prisma.attendance.upsert({
      where: { lessonSessionId: lesson.id },
      create: {
        lessonSessionId: lesson.id,
        studentId: lesson.studentId,
        tarih: dateOnly,
        status,
        girisZamani: lesson.baslangic,
        cikisZamani: lesson.bitis,
        gercekGiris: bkds?.ilkGiris,
        gercekCikis: bkds?.sonCikis,
      },
      update: {
        status,
        gercekGiris: bkds?.ilkGiris,
        gercekCikis: bkds?.sonCikis,
      },
    });
  }
}

/**
 * Personel attendance hesapla
 */
export async function recalculateStaffAttendance(tarih: Date, now: Date = new Date()): Promise<void> {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const staffSessions = await prisma.staffSession.findMany({
    where: { tarih: dateOnly },
    include: { staff: true },
  });

  for (const session of staffSessions) {
    const status = calculateStaffStatus({
      session: {
        baslangic: session.baslangic,
        bitis: session.bitis,
        basladiMi: session.basladiMi,
        baslamaZamani: session.baslamaZamani,
      },
      now,
    });

    await prisma.staffAttendance.upsert({
      where: { staffSessionId: session.id },
      create: {
        staffSessionId: session.id,
        staffId: session.staffId,
        tarih: dateOnly,
        status,
      },
      update: { status },
    });
  }
}

/**
 * Canlı takip verisi - öğrenci
 */
export async function getLiveAttendance(tarih: Date) {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  return prisma.attendance.findMany({
    where: { tarih: dateOnly },
    include: {
      lessonSession: {
        include: { staff: true },
      },
      student: true,
    },
    orderBy: [{ lessonSession: { baslangic: 'asc' } }],
  });
}

/**
 * Canlı takip verisi - personel
 */
export async function getLiveStaffAttendance(tarih: Date) {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  return prisma.staffAttendance.findMany({
    where: { tarih: dateOnly },
    include: {
      staffSession: true,
      staff: true,
    },
    orderBy: [{ staffSession: { baslangic: 'asc' } }],
  });
}
