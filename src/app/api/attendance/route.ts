import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { getLiveAttendance, getLiveStaffAttendance, recalculateAttendance, recalculateStaffAttendance } from '@/lib/services/attendanceService';
import { getActiveAlerts, generateAlerts } from '@/lib/services/alertService';
import { getAttendanceStatusInfo } from '@/lib/services/attendanceEngine';
import { getStaffStatusInfo } from '@/lib/services/staffAttendanceEngine';
import { getBkdsService } from '@/lib/services/bkdsProviderService';
import { matchMaskedName } from '@/lib/utils/normalize';
import { prisma } from '@/lib/prisma';

// Next.js bu route'u asla cache'lemesin — her istekte taze data
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Per-org son çekim zamanı
const lastBkdsFetchMap = new Map<string, number>();
const lastBkdsErrorMap = new Map<string, { at: number; message: string }>();
const inFlightMap = new Map<string, number>(); // orgId -> startedAt
const BKDS_FETCH_INTERVAL = 1000;
const STUCK_FETCH_MS = 15_000; // 15 sn sonra stuck sayılır, yeniden tetiklenebilir

// Arka planda BKDS'yi çekip DB'yi güncelleyen non-blocking helper.
function refreshBkdsInBackground(orgId: string, tarih: Date) {
  const existing = inFlightMap.get(orgId);
  if (existing !== undefined) {
    if (Date.now() - existing < STUCK_FETCH_MS) return; // hâlâ çalışıyor
    console.warn(`[Attendance] ${orgId} için önceki BKDS fetch ${STUCK_FETCH_MS}ms'dir sürüyor, zorla yeniden tetikliyorum`);
  }
  const startedAt = Date.now();
  inFlightMap.set(orgId, startedAt);
  lastBkdsFetchMap.set(orgId, startedAt);

  (async () => {
    try {
      const service = getBkdsService(orgId);
      const records = await service.fetchToday();
      await service.saveAndAggregate(records, tarih);
      await recalculateAttendance(tarih, orgId, new Date());
      await recalculateStaffAttendance(tarih, orgId, new Date());
      await generateAlerts(tarih, orgId);
      const elapsed = Date.now() - startedAt;
      console.log(`[Attendance BG] ${orgId} BKDS çekimi ${elapsed}ms'de tamamlandı, ${records.length} kayıt`);
      lastBkdsErrorMap.delete(orgId);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error('[Attendance BG] BKDS hatası:', msg);
      lastBkdsErrorMap.set(orgId, { at: Date.now(), message: msg });
      lastBkdsFetchMap.set(orgId, Date.now() - BKDS_FETCH_INTERVAL + 3000);
    } finally {
      // Sadece kendi damgamızsa temizle (stuck detector yeni bir tane başlatmışsa karışmasın)
      if (inFlightMap.get(orgId) === startedAt) inFlightMap.delete(orgId);
    }
  })();
}

function capitalizeDerslik(str: string): string {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const { searchParams } = new URL(req.url);
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const now = new Date();

  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  // BKDS'yi arka planda tetikle — istemciyi bekletmez
  const lastFetch = lastBkdsFetchMap.get(orgId) ?? 0;
  if ((now.getTime() - lastFetch) >= BKDS_FETCH_INTERVAL) {
    refreshBkdsInBackground(orgId, tarih);
  }

  const lastErr = lastBkdsErrorMap.get(orgId);
  const bkdsError = lastErr && (now.getTime() - lastErr.at) < 60_000 ? lastErr.message : null;

  const [attendances, staffAttendances, alerts, personelLog, ogrenciRawList, students] = await Promise.all([
    getLiveAttendance(tarih, orgId),
    getLiveStaffAttendance(tarih, orgId),
    getActiveAlerts(tarih, orgId),
    prisma.bkdsPersonelLog.findMany({
      where: { organizationId: orgId, tarih: dateOnly },
      include: { staff: { select: { id: true, adSoyad: true } } },
      orderBy: { ilkGiris: 'asc' },
    }),
    // Tüm öğrenci ham kayıtları (Lila import olmasa bile kullanılır)
    prisma.bkdsRaw.findMany({
      where: { organizationId: orgId, tarih: dateOnly, individualType: 1 },
      orderBy: { girisZamani: 'asc' },
    }),
    prisma.student.findMany({ where: { organizationId: orgId, aktif: true } }),
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

  const tumPersonelGirisler = personelLog.map(log => ({
    staffId: log.staffId ?? log.maskedAd,
    ogretmenAdi: log.staff?.adSoyad ?? log.maskedAd,
    ilkGiris: log.ilkGiris,
    sonCikis: log.sonCikis ?? null,
    eslesmeDurumu: log.eslesmeDurumu,
    tahmin: log.tahminEdilenAd ?? null,
    dersVar: personelRows.some(r => r.staffId === log.staffId),
  }));

  // Tüm öğrenci girişleri: BkdsRaw'dan aggregate (masked isim + varsa Student eşleşmesi)
  const ogrenciMap = new Map<string, { ilkGiris: Date; sonCikis: Date | null; studentId: string | null; ogrenciAdi: string }>();
  for (const raw of ogrenciRawList) {
    const matched = students.find(s => matchMaskedName(raw.adSoyad, s.adSoyad));
    const key = matched?.id ?? raw.adSoyad;
    const ogrenciAdi = matched?.adSoyad ?? raw.adSoyad;
    const ex = ogrenciMap.get(key);
    if (!ex) {
      ogrenciMap.set(key, {
        ilkGiris: raw.girisZamani,
        sonCikis: raw.cikisZamani,
        studentId: matched?.id ?? null,
        ogrenciAdi,
      });
    } else {
      if (raw.girisZamani < ex.ilkGiris) ex.ilkGiris = raw.girisZamani;
      if (raw.cikisZamani && (!ex.sonCikis || raw.cikisZamani > ex.sonCikis)) ex.sonCikis = raw.cikisZamani;
    }
  }
  const tumOgrenciGirisler = Array.from(ogrenciMap.entries()).map(([key, v]) => ({
    studentId: v.studentId,
    key,
    ogrenciAdi: v.ogrenciAdi,
    ilkGiris: v.ilkGiris,
    sonCikis: v.sonCikis,
    dersVar: ogrenciRows.some(r => r.ogrenciId === v.studentId),
  }));

  return NextResponse.json(
    {
      tarih: tarih.toISOString(),
      ogrenciRows,
      personelRows,
      statusCounts,
      staffStatusCounts,
      alerts: alerts.length,
      alertList: alerts,
      bildirimler,
      tumPersonelGirisler,
      tumOgrenciGirisler,
      updatedAt: now.toISOString(),
      bkdsError,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
