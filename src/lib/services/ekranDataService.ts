import { prisma } from '@/lib/prisma';
import { getLiveStaffAttendance } from './attendanceService';
import { getStaffStatusInfo } from './staffAttendanceEngine';

function capitalizeDerslik(str: string): string {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Ekran (bildirim ekranı) sayfasının ihtiyaç duyduğu veriyi döndürür.
 * Poller tarafından saveAndAggregate sonrası çağrılır ve SSE ile push edilir.
 * Böylece client'ın ayrı bir HTTP fetch yapmasına gerek kalmaz.
 */
export async function getEkranData(organizationId: string) {
  const now = new Date();
  const dateOnly = new Date(now);
  dateOnly.setHours(0, 0, 0, 0);

  const [bkdsKayitlar, personelLog, staffAttendances] = await Promise.all([
    prisma.bkdsAggregate.findMany({
      where: { tarih: dateOnly, organizationId },
      select: {
        id: true, studentId: true, adSoyad: true, ilkGiris: true, sonCikis: true,
        student: { select: { adSoyad: true } },
      },
      orderBy: { ilkGiris: 'desc' },
    }),
    prisma.bkdsPersonelLog.findMany({
      where: { tarih: dateOnly, organizationId },
      include: { staff: { select: { id: true, adSoyad: true } } },
      orderBy: { ilkGiris: 'asc' },
    }),
    getLiveStaffAttendance(now, organizationId),
  ]);

  const personelRows = staffAttendances.map((sa: any) => {
    const info = getStaffStatusInfo(sa.status);
    return {
      id: sa.id,
      staffSessionId: sa.staffSessionId,
      ogretmenAdi: sa.staff.adSoyad,
      staffId: sa.staffId,
      derslik: capitalizeDerslik(sa.staffSession.derslik),
      baslangic: sa.staffSession.baslangic,
      bitis: sa.staffSession.bitis,
      basladiMi: sa.staffSession.basladiMi,
      baslamaZamani: sa.staffSession.baslamaZamani ?? null,
      sonCikisZamani: (sa.staffSession as any).sonCikisZamani ?? null,
      status: sa.status,
      statusLabel: info.label,
      statusColor: info.color,
      statusBg: info.bg,
    };
  });

  const bkdsOgrenciKayitlari = bkdsKayitlar.map(b => ({
    id: b.id,
    studentId: b.studentId ?? null,
    adSoyad: b.student?.adSoyad ?? b.adSoyad,
    ilkGiris: b.ilkGiris,
    sonCikis: b.sonCikis ?? null,
  }));

  const tumPersonelGirisler = personelLog.map(log => ({
    staffId: log.staffId ?? log.maskedAd,
    ogretmenAdi: log.staff?.adSoyad ?? log.maskedAd,
    ilkGiris: log.ilkGiris,
    sonCikis: log.sonCikis ?? null,
    eslesmeDurumu: log.eslesmeDurumu,
    tahmin: log.tahminEdilenAd ?? null,
    dersVar: personelRows.some(r => r.staffId === log.staffId),
  }));

  return {
    bkdsOgrenciKayitlari,
    personelRows,
    tumPersonelGirisler,
    updatedAt: now.toISOString(),
  };
}
