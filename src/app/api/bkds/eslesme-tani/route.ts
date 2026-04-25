import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { matchMaskedName, matchMaskedNameFuzzy } from '@/lib/utils/normalize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * BKDS eşleşme diagnostiği — bugün BKDS'den gelen her ham kaydın hangi
 * öğrenci/personel ile eşleştiğini, eşleşmediyse en yakın aday isimleri
 * gösterir. /api/bkds/eslesme-tani açıldığında JSON döner.
 *
 * Amac: 'X kişiyi BKDS okuyor ama programa düşmüyor' tipi sorunlarda
 * tam neyi neyle karşılaştırdığımızı görmek.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [rawList, students, staff] = await Promise.all([
    prisma.bkdsRaw.findMany({
      where: { organizationId: orgId, tarih: today },
      orderBy: { girisZamani: 'asc' },
    }),
    prisma.student.findMany({ where: { organizationId: orgId, aktif: true } }),
    prisma.staff.findMany({ where: { organizationId: orgId, aktif: true } }),
  ]);

  function tani(maskedName: string, type: 1 | 2) {
    const pool = type === 1 ? students : staff;
    // Tam (prefix+suffix) match
    const exact = pool.find(s => matchMaskedName(maskedName, s.adSoyad));
    if (exact) return { durum: 'tam_eslesme', eslesti: exact.adSoyad };

    // Fuzzy (prefix-only) — TÜM yakınları skoruyla göster
    const fuzzyAll = pool
      .map(s => ({ ad: s.adSoyad, sonuc: matchMaskedNameFuzzy(maskedName, s.adSoyad) }))
      .filter(x => x.sonuc.type === 'prefix_eslesme')
      .sort((a, b) => b.sonuc.score - a.sonuc.score)
      .slice(0, 5);

    if (fuzzyAll.length === 0) {
      return { durum: 'eslesme_yok', adaylar: [] };
    }
    if (fuzzyAll.length === 1) {
      return { durum: 'fuzzy_tek', eslesti: fuzzyAll[0].ad };
    }
    // Birden çok aday — gerçek matcher en yüksek skorluyu seçiyor
    return {
      durum: 'fuzzy_coklu_secildi',
      eslesti: fuzzyAll[0].ad,
      adaylar: fuzzyAll.map(x => x.ad),
      not: `Birden çok aday var, en yüksek skorlu seçildi (skor: ${fuzzyAll[0].sonuc.score})`,
    };
  }

  // Maskeli isme göre uniq grupla
  const ogrenciMap = new Map<string, { count: number; gecenler: string[] }>();
  const personelMap = new Map<string, { count: number; gecenler: string[] }>();
  for (const r of rawList) {
    const target = r.individualType === 2 ? personelMap : ogrenciMap;
    const ex = target.get(r.adSoyad);
    if (ex) ex.count++;
    else target.set(r.adSoyad, { count: 1, gecenler: [] });
  }

  const ogrenci = Array.from(ogrenciMap.entries()).map(([masked, { count }]) => ({
    masked, count, ...tani(masked, 1),
  }));
  const personel = Array.from(personelMap.entries()).map(([masked, { count }]) => ({
    masked, count, ...tani(masked, 2),
  }));

  return NextResponse.json({
    tarih: today.toISOString().slice(0, 10),
    ozet: {
      ogrenci: {
        toplam: ogrenci.length,
        eslesti: ogrenci.filter(x => x.durum === 'tam_eslesme' || x.durum === 'fuzzy_tek' || x.durum === 'fuzzy_coklu_secildi').length,
        coklu_aday: ogrenci.filter(x => x.durum === 'fuzzy_coklu_secildi').length,
        eslesmedi: ogrenci.filter(x => x.durum === 'eslesme_yok').length,
      },
      personel: {
        toplam: personel.length,
        eslesti: personel.filter(x => x.durum === 'tam_eslesme' || x.durum === 'fuzzy_tek' || x.durum === 'fuzzy_coklu_secildi').length,
        coklu_aday: personel.filter(x => x.durum === 'fuzzy_coklu_secildi').length,
        eslesmedi: personel.filter(x => x.durum === 'eslesme_yok').length,
      },
    },
    ogrenci,
    personel,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
