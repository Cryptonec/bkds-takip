import { prisma } from '@/lib/prisma';
import type { AttendanceStatus, StaffAttendanceStatus } from '@prisma/client';

type AlertSeverity = 'normal' | 'uyari' | 'kritik';

interface AlertDef {
  type: string;
  severity: AlertSeverity;
  message: string;
}

function getStudentAlertDef(status: AttendanceStatus): AlertDef | null {
  switch (status) {
    case 'gecikiyor':
      return { type: 'ogrenci_gecikiyor', severity: 'uyari', message: 'Öğrenci BKDS girişi bekleniyor (gecikmeli)' };
    case 'giris_eksik':
      return { type: 'bkds_yok', severity: 'uyari', message: 'BKDS giriş kaydı bulunamadı' };
    case 'kritik':
      return { type: 'bkds_yok', severity: 'kritik', message: 'BKDS giriş kaydı yok - Kritik gecikme' };
    case 'gec_geldi':
      return { type: 'gec_geldi', severity: 'normal', message: 'Öğrenci geç geldi' };
    case 'cikis_eksik':
      return { type: 'cikis_eksik', severity: 'uyari', message: 'BKDS çıkış kaydı eksik' };
    default:
      return null;
  }
}

function getStaffAlertDef(status: StaffAttendanceStatus): AlertDef | null {
  switch (status) {
    case 'gecikiyor':
      return { type: 'personel_gecikiyor', severity: 'uyari', message: 'Öğretmen derse gecikmeli' };
    case 'gelmedi':
      return { type: 'personel_gelmedi', severity: 'kritik', message: 'Öğretmen derse gelmedi' };
    case 'gec_basladi':
      return { type: 'ders_gec_basladi', severity: 'normal', message: 'Ders geç başladı' };
    default:
      return null;
  }
}

export async function generateAlerts(tarih: Date, organizationId: string): Promise<void> {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const attendances = await prisma.attendance.findMany({
    where: { organizationId, tarih: dateOnly },
  });

  for (const att of attendances) {
    const def = getStudentAlertDef(att.status);
    if (!def) continue;

    const existing = await prisma.alert.findFirst({
      where: { organizationId, entityType: 'attendance', entityId: att.id, type: def.type, resolved: false },
    });

    if (!existing) {
      await prisma.alert.create({
        data: {
          organizationId,
          type: def.type,
          severity: def.severity,
          entityType: 'attendance',
          entityId: att.id,
          message: def.message,
          tarih: dateOnly,
        },
      });
    }

    if (['tamamlandi', 'bkds_muaf', 'giris_tamam'].includes(att.status)) {
      await prisma.alert.updateMany({
        where: { organizationId, entityType: 'attendance', entityId: att.id, resolved: false },
        data: { resolved: true, resolvedAt: new Date() },
      });
    }
  }

  const staffAttendances = await prisma.staffAttendance.findMany({
    where: { organizationId, tarih: dateOnly },
  });

  for (const sa of staffAttendances) {
    const def = getStaffAlertDef(sa.status);
    if (!def) continue;

    const existing = await prisma.alert.findFirst({
      where: { organizationId, entityType: 'staffAttendance', entityId: sa.id, type: def.type, resolved: false },
    });

    if (!existing) {
      await prisma.alert.create({
        data: {
          organizationId,
          type: def.type,
          severity: def.severity,
          entityType: 'staffAttendance',
          entityId: sa.id,
          message: def.message,
          tarih: dateOnly,
        },
      });
    }

    if (sa.status === 'derste') {
      await prisma.alert.updateMany({
        where: { organizationId, entityType: 'staffAttendance', entityId: sa.id, resolved: false },
        data: { resolved: true, resolvedAt: new Date() },
      });
    }
  }
}

export async function getActiveAlerts(tarih: Date, organizationId: string) {
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  return prisma.alert.findMany({
    where: { organizationId, tarih: dateOnly, resolved: false },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  });
}
