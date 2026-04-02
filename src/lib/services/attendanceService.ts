import { prisma } from '@/lib/prisma';
import { calculateAttendanceStatus } from './attendanceEngine';
import { calculateStaffStatus } from './staffAttendanceEngine';

export async function recalculateAttendance(
  tarih: Date,
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const lessons = await prisma.lessonSession.findMany({
    where: { tarih: dateOnly, organizationId },
    include: { student: true },
  });

  for (const lesson of lessons) {
    const bkds = lesson.studentId
      ? await prisma.bkdsAggregate.findFirst({
          where: { studentId: lesson.studentId, tarih: dateOnly, organizationId },
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
        organizationId,
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

export async function recalculateStaffAttendance(
  tarih: Date,
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const staffSessions = await prisma.staffSession.findMany({
    where: { tarih: dateOnly, organizationId },
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
        organizationId,
        staffSessionId: session.id,
        staffId: session.staffId,
        tarih: dateOnly,
        status,
      },
      update: { status },
    });
  }
}

export async function getLiveAttendance(tarih: Date, organizationId: string) {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  return prisma.attendance.findMany({
    where: { tarih: dateOnly, organizationId },
    include: {
      lessonSession: { include: { staff: true } },
      student: true,
    },
    orderBy: [{ lessonSession: { baslangic: 'asc' } }],
  });
}

export async function getLiveStaffAttendance(tarih: Date, organizationId: string) {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  return prisma.staffAttendance.findMany({
    where: { tarih: dateOnly, organizationId },
    include: {
      staffSession: true,
      staff: true,
    },
    orderBy: [{ staffSession: { baslangic: 'asc' } }],
  });
}
