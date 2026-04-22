import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { getBkdsService } from '@/lib/services/bkdsProviderService';
import { matchMaskedName, matchMaskedNameFuzzy } from '@/lib/utils/normalize';
import { prisma } from '@/lib/prisma';

/**
 * BKDS entegrasyonunun sağlığını ölçen tanılama endpoint'i.
 * Tarayıcıdan `/api/bkds/diagnose` açınca JSON olarak:
 *  - apiUrl (hangi URL kullanılıyor)
 *  - fetch işlemi hatasız tamamlandı mı, kaç kayıt geldi
 *  - kayıtlardaki alan isimleri + örnek kayıt
 *  - kaç öğrenci/personel tip ayrımı yapıldı
 *  - kaç öğrenci/personel eşleşti, kaç eşleşmedi
 *  - eşleşmeyen örnek isimler + DB'deki örnek Student/Staff isimleri
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const result: any = {
    orgId,
    timestamp: new Date().toISOString(),
    steps: [],
  };

  // 1) Credential durumu
  try {
    const dbCred = await prisma.bkdsCredential.findUnique({ where: { organizationId: orgId } });
    result.credential = {
      hasDbRecord: !!dbCred,
      apiUrl: dbCred?.apiUrl ?? `ENV: ${process.env.BKDS_API_URL}`,
      username: dbCred?.username ?? process.env.BKDS_USERNAME,
    };
    result.steps.push('credential_loaded');
  } catch (e: any) {
    result.credentialError = e?.message ?? String(e);
  }

  // 2) Fetch dene
  let records: any[] = [];
  try {
    const service = getBkdsService(orgId);
    records = await service.fetchToday();
    result.steps.push('fetch_ok');
    result.fetch = {
      recordCount: records.length,
      sampleRecord: records[0] ?? null,
      sampleFields: records[0] ? Object.keys(records[0]) : [],
    };
  } catch (e: any) {
    result.fetchError = e?.message ?? String(e);
    return NextResponse.json(result, { status: 500 });
  }

  // 3) Tip dağılımı
  const typeCounts: Record<string, number> = {};
  for (const r of records) {
    const t = String(r.individual_type ?? 'null');
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  result.typeDistribution = typeCounts;

  // 4) Student / Staff ile eşleştirme analizi
  const [students, staff] = await Promise.all([
    prisma.student.findMany({ where: { organizationId: orgId, aktif: true }, select: { id: true, adSoyad: true } }),
    prisma.staff.findMany({ where: { organizationId: orgId, aktif: true }, select: { id: true, adSoyad: true } }),
  ]);
  result.dbCounts = { students: students.length, staff: staff.length };
  result.sampleDbNames = {
    students: students.slice(0, 5).map(s => s.adSoyad),
    staff: staff.slice(0, 5).map(s => s.adSoyad),
  };

  // Her tip için eşleşme testi
  const ogrenciNames = Array.from(new Set(records.filter(r => r.individual_type === 1).map(r => r.individual_full_name)));
  const personelNames = Array.from(new Set(records.filter(r => r.individual_type === 2).map(r => r.individual_full_name)));

  function analyse(maskedList: string[], pool: { id: string; adSoyad: string }[]) {
    let exact = 0, fuzzy = 0, unmatched = 0;
    const unmatchedSamples: Array<{ masked: string; closestDb?: string }> = [];
    for (const name of maskedList) {
      const exactHit = pool.find(s => matchMaskedName(name, s.adSoyad));
      if (exactHit) { exact++; continue; }
      const fuzzyHits = pool
        .map(s => ({ s, r: matchMaskedNameFuzzy(name, s.adSoyad) }))
        .filter(x => x.r.type === 'prefix_eslesme')
        .sort((a, b) => b.r.score - a.r.score);
      if (fuzzyHits.length === 1) { fuzzy++; continue; }
      unmatched++;
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push({
          masked: name,
          closestDb: fuzzyHits[0]?.s.adSoyad ?? '(fuzzy bile tutmadı)',
        });
      }
    }
    return { total: maskedList.length, exact, fuzzy, unmatched, unmatchedSamples };
  }

  result.studentMatching = analyse(ogrenciNames, students);
  result.staffMatching = analyse(personelNames, staff);

  // 5) BKDS Aggregate durumu
  const dateOnly = new Date(); dateOnly.setHours(0, 0, 0, 0);
  const [rawCount, aggCount, attendanceCount, withGercekGiris] = await Promise.all([
    prisma.bkdsRaw.count({ where: { organizationId: orgId, tarih: dateOnly } }),
    prisma.bkdsAggregate.count({ where: { organizationId: orgId, tarih: dateOnly } }),
    prisma.attendance.count({ where: { organizationId: orgId, tarih: dateOnly } }),
    prisma.attendance.count({ where: { organizationId: orgId, tarih: dateOnly, NOT: { gercekGiris: null } } }),
  ]);
  result.db = { rawCount, aggCount, attendanceCount, withGercekGiris };

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
