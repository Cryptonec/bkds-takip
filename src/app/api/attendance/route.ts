import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getLiveAttendance, getLiveStaffAttendance, recalculateAttendance, recalculateStaffAttendance } from '@/lib/services/attendanceService';
import { getActiveAlerts, generateAlerts } from '@/lib/services/alertService';
import { getAttendanceStatusInfo } from '@/lib/services/attendanceEngine';
import { getStaffStatusInfo } from '@/lib/services/staffAttendanceEngine';
import { getBkdsService } from '@/lib/services/bkdsProviderService';
import { prisma } from '@/lib/prisma';

let lastBkdsFetch = 0;
const BKDS_FETCH_INTERVAL = 5000;

function capitalizeDerslik(str: string): string {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const now = new Date();

  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const shouldFetch = (now.getTime() - lastBkdsFetch) >= BKDS_FETCH_INTERVAL;
  if (shouldFetch) {
    lastBkdsFetch = now.getTime();
    try {
      const service = getBkdsService(organizationId);
      const fetchPromise = service.fetchToday().then(records => service.saveAndAggregate(records, tarih));
      await Promise.race([fetchPromise, new Promise((_, r) => setTimeout(() => r(new Error('BKDS timeout')), 8000))]);
    } catch (err) {
      console.error('[Attendance API] BKDS hatası:', err);
    }
    // BKDS başarısız olsa da attendance kayıtlarını güncelle
    await recalculateAttendance(tarih, organizationId);
    await recalculateStaffAttendance(tarih, organizationId);
    await generateAlerts(tarih, organizationId);
  }

  const [attendances, staffAttendances, alerts, personelLog] = await Promise.all([
    getLiveAttendance(tarih, organizationId),
    getLiveStaffAttendance(tarih, organizationId),
    getActiveAlerts(tarih, organizationId),
    prisma.bkdsPersonelLog.findMany({
      where: { tarih: dateOnly, organizationId },
      include: { staff: { select: { id: true, adSoyad: true } } },
      orderBy: { ilkGiris: 'asc' },
    }),
  ]);

  const ogrenciRows = attendances.map((a) => {
    const info = getAttendanceStatusInfo(a.status);
    const baslangic = new Date(a.lessonSession.baslangic);
    const bitis = new Date(a.lessonSession.bitis);
    const dakikaKaldi = (baslangic.getTime() - now.getTime()) / 60000;
    const dersSuresi = (bitis.getTime() - baslangic.getTime()) / 60000;
    const minKalma = Math.min(40, dersSuresi * 0.8);
    const yaklasanUyari = dakikaKaldi > 0 && dakikaKaldi <= 40 && !a.gercekGiris && a.lessonSession.bkdsRequired;
    const gelmediUyari = dakikaKaldi < -5 && !a.gercekGiris && a.lessonSession.bkdsRequired && a.status !== 'bkds_muaf';
    const erkenCikisUyari = a.gercekGiris && a.gercekCikis &&
      ((new Date(a.gercekCikis).getTime() - new Date(a.gercekGiris).getTime()) / 60000) < minKalma;

    return {
      id: a.id,
      lessonSessionId: a.lessonSessionId,
      ogrenciAdi: a.student.adSoyad,
      ogrenciId: a.studentId,
      ogretmenAdi: a.lessonSession.staff.adSoyad,
      derslik: capitalizeDerslik(a.lessonSession.derslik),
      baslangic: a.lessonSession.baslangic,
      bitis: a.lessonSession.bitis,
      bkdsRequired: a.lessonSession.bkdsRequired,
      gercekGiris: a.gercekGiris ?? null,
      gercekCikis: a.gercekCikis ?? null,
      status: a.status,
      statusLabel: info.label,
      statusColor: info.color,
      statusBg: info.bg,
      yaklasanUyari,
      gelmediUyari,
      erkenCikisUyari: !!erkenCikisUyari,
      dakikaKaldi: Math.round(dakikaKaldi),
      minKalmaSuresi: Math.round(minKalma),
    };
  });

  const personelRows = staffAttendances.map((sa) => {
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

  const statusCounts = ogrenciRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const staffStatusCounts = personelRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const bildirimler = [
    ...ogrenciRows.filter(r => r.yaklasanUyari).map(r => ({
      id: `yaklasan-${r.id}`,
      tip: 'yaklasan' as const,
      mesaj: `${r.ogrenciAdi} — ${Math.round(r.dakikaKaldi)} dk sonra dersi başlıyor`,
      severity: 'uyari' as const,
      ogrenciAdi: r.ogrenciAdi,
      derslik: r.derslik,
      baslangic: r.baslangic,
    })),
    ...ogrenciRows.filter(r => r.gelmediUyari).map(r => ({
      id: `gelmedi-${r.id}`,
      tip: 'gelmedi' as const,
      mesaj: `${r.ogrenciAdi} — ders başladı, BKDS girişi yok`,
      severity: 'kritik' as const,
      ogrenciAdi: r.ogrenciAdi,
      derslik: r.derslik,
      baslangic: r.baslangic,
    })),
    ...ogrenciRows.filter(r => r.erkenCikisUyari).map(r => ({
      id: `erken-${r.id}`,
      tip: 'erken_cikis' as const,
      mesaj: `${r.ogrenciAdi} — 40 dk dolmadan çıktı (${r.minKalmaSuresi} dk gerekli)`,
      severity: 'kritik' as const,
      ogrenciAdi: r.ogrenciAdi,
      derslik: r.derslik,
      baslangic: r.baslangic,
    })),
  ];

  // Tüm personel girişleri (dersi olsun olmasın)
  const tumPersonelGirisler = personelLog.map(log => ({
    staffId: log.staffId ?? log.maskedAd,
    ogretmenAdi: log.staff?.adSoyad ?? log.maskedAd,
    ilkGiris: log.ilkGiris,
    sonCikis: log.sonCikis ?? null,
    eslesmeDurumu: log.eslesmeDurumu,
    tahmin: log.tahminEdilenAd ?? null,
    dersVar: personelRows.some(r => r.staffId === log.staffId),
  }));

  return NextResponse.json({
    tarih: tarih.toISOString(),
    ogrenciRows,
    personelRows,
    statusCounts,
    staffStatusCounts,
    alerts: alerts.length,
    alertList: alerts,
    bildirimler,
    tumPersonelGirisler,
    updatedAt: now.toISOString(),
  });
}
