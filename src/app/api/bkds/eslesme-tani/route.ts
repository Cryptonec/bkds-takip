import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { matchMaskedName, matchMaskedNameFuzzy, matchMaskedTc } from '@/lib/utils/normalize';

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

  function tani(maskedName: string, maskedTc: string | null, type: 1 | 2) {
    const pool: Array<{ adSoyad: string; tc?: string | null }> = type === 1 ? students : staff;
    // 1) Tam (prefix+suffix) match — birden cok aday olabilir, TC tie-breaker
    const tamAdaylar = pool.filter(s => matchMaskedName(maskedName, s.adSoyad));
    if (tamAdaylar.length === 1) {
      return { durum: 'tam_eslesme', eslesti: tamAdaylar[0].adSoyad, maskedTc };
    }
    if (tamAdaylar.length > 1) {
      const tcMatch = tamAdaylar.find(s => matchMaskedTc(maskedTc, s.tc) === 'eslesti');
      if (tcMatch) {
        return {
          durum: 'tam_eslesme_tc_secimi',
          eslesti: tcMatch.adSoyad,
          adaylar: tamAdaylar.map(s => s.adSoyad),
          maskedTc,
          not: 'Birden çok isim adayı vardı, TC karşılaştırması ile doğru kişi seçildi',
        };
      }
      // TC bilgisi yok — ilk adayi al, ama kullanici uyarisin
      return {
        durum: 'tam_eslesme_belirsiz_tc',
        eslesti: tamAdaylar[0].adSoyad,
        adaylar: tamAdaylar.map(s => s.adSoyad),
        maskedTc,
        not: 'Birden çok isim adayı var, TC eşleşmedi/eksik — ilk aday seçildi (yanlış olabilir, öğrenci kayıtlarına TC ekle)',
      };
    }

    // 2) Fuzzy (prefix-only) — soyad değişmiş senaryosu
    const fuzzyAll = pool
      .map(s => ({ s, sonuc: matchMaskedNameFuzzy(maskedName, s.adSoyad) }))
      .filter(x => x.sonuc.type === 'prefix_eslesme')
      .sort((a, b) => b.sonuc.score - a.sonuc.score)
      .slice(0, 5);

    if (fuzzyAll.length === 0) {
      return { durum: 'eslesme_yok', adaylar: [], maskedTc };
    }
    if (fuzzyAll.length === 1) {
      return { durum: 'fuzzy_tek', eslesti: fuzzyAll[0].s.adSoyad, maskedTc };
    }
    const tcMatch = fuzzyAll.find(x => matchMaskedTc(maskedTc, x.s.tc) === 'eslesti');
    if (tcMatch) {
      return {
        durum: 'fuzzy_coklu_tc_secimi',
        eslesti: tcMatch.s.adSoyad,
        adaylar: fuzzyAll.map(x => x.s.adSoyad),
        maskedTc,
        not: 'Birden çok fuzzy aday vardı, TC ile doğru kişi seçildi',
      };
    }
    return {
      durum: 'fuzzy_coklu_secildi',
      eslesti: fuzzyAll[0].s.adSoyad,
      adaylar: fuzzyAll.map(x => x.s.adSoyad),
      maskedTc,
      not: `Birden çok aday var, TC eşleşmedi/eksik — en yüksek skorlu seçildi (skor: ${fuzzyAll[0].sonuc.score}). Yanlış olabilir, TC ekle.`,
    };
  }

  // Maskeli isme göre uniq grupla, maskedTc'yi de tut
  const ogrenciMap = new Map<string, { count: number; maskedTc: string | null }>();
  const personelMap = new Map<string, { count: number; maskedTc: string | null }>();
  for (const r of rawList) {
    const target = r.individualType === 2 ? personelMap : ogrenciMap;
    const ex = target.get(r.adSoyad);
    if (ex) ex.count++;
    else target.set(r.adSoyad, { count: 1, maskedTc: r.maskedTc ?? null });
  }

  const ogrenci = Array.from(ogrenciMap.entries()).map(([masked, { count, maskedTc }]) => ({
    masked, count, ...tani(masked, maskedTc, 1),
  }));
  const personel = Array.from(personelMap.entries()).map(([masked, { count, maskedTc }]) => ({
    masked, count, ...tani(masked, maskedTc, 2),
  }));

  const eslestiSet = new Set(['tam_eslesme', 'tam_eslesme_tc_secimi', 'tam_eslesme_belirsiz_tc', 'fuzzy_tek', 'fuzzy_coklu_secildi', 'fuzzy_coklu_tc_secimi']);
  const cokluSet = new Set(['tam_eslesme_belirsiz_tc', 'fuzzy_coklu_secildi']);

  return NextResponse.json({
    tarih: today.toISOString().slice(0, 10),
    ozet: {
      ogrenci: {
        toplam: ogrenci.length,
        eslesti: ogrenci.filter(x => eslestiSet.has(x.durum)).length,
        belirsiz_tc: ogrenci.filter(x => cokluSet.has(x.durum)).length,
        eslesmedi: ogrenci.filter(x => x.durum === 'eslesme_yok').length,
      },
      personel: {
        toplam: personel.length,
        eslesti: personel.filter(x => eslestiSet.has(x.durum)).length,
        belirsiz_tc: personel.filter(x => cokluSet.has(x.durum)).length,
        eslesmedi: personel.filter(x => x.durum === 'eslesme_yok').length,
      },
    },
    ogrenci,
    personel,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
