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

  const [lessons, bkdsAggregates] = await Promise.all([
    prisma.lessonSession.findMany({ where: { tarih: dateOnly, organizationId } }),
    prisma.bkdsAggregate.findMany({ where: { tarih: dateOnly, organizationId } }),
  ]);

  const bkdsMap = new Map(bkdsAggregates.map(b => [b.studentId ?? '', b]));

  await prisma.$transaction(
    lessons.map(lesson => {
      const bkds = lesson.studentId ? (bkdsMap.get(lesson.studentId) ?? null) : null;
      const status = calculateAttendanceStatus({
        lesson: { baslangic: lesson.baslangic, bitis: lesson.bitis, bkdsRequired: lesson.bkdsRequired },
        bkdsGiris: bkds?.ilkGiris,
        bkdsCikis: bkds?.sonCikis,
        now,
      });
      return prisma.attendance.upsert({
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
        update: { status, gercekGiris: bkds?.ilkGiris, gercekCikis: bkds?.sonCikis },
      });
    })
  );
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
  });

  await prisma.$transaction(
    staffSessions.map(session => {
      const status = calculateStaffStatus({
        session: {
          baslangic: session.baslangic,
          bitis: session.bitis,
          basladiMi: session.basladiMi,
          baslamaZamani: session.baslamaZamani,
        },
        now,
      });
      return prisma.staffAttendance.upsert({
        where: { staffSessionId: session.id },
        create: { organizationId, staffSessionId: session.id, staffId: session.staffId, tarih: dateOnly, status },
        update: { status },
      });
    })
  );
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
