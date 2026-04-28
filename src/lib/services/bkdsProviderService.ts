import { prisma } from '@/lib/prisma';
import { matchMaskedName, matchMaskedNameFuzzy, matchMaskedTc } from '@/lib/utils/normalize';

interface BkdsApiRecord {
  individual_uuid: string;
  individual_full_name: string;
  individual_identity_number: string;
  individual_type: number;
  first_entry: string;
  last_exit: string | null;
}

interface BkdsApiResponse {
  count: number;
  next: string | null;
  results: any[];
}

/**
 * Yerel BRY ile MEB public response alanları tam eşleşmeyebilir.
 * Alternatifleri denedikten sonra geçerli bir kayıt üretemiyorsak null döndür;
 * çağıran filter ile atar.
 */
function normalizeRecord(r: any): BkdsApiRecord | null {
  if (!r) return null;

  const fullName   = r.individual_full_name ?? r.full_name ?? r.ad_soyad ?? r.adSoyad ?? r.name ?? null;
  const firstEntry = r.first_entry ?? r.ilk_giris ?? r.ilkGiris ?? r.entry ?? null;
  const lastExit   = r.last_exit ?? r.son_cikis ?? r.sonCikis ?? r.exit ?? null;
  const idNumber   = r.individual_identity_number ?? r.identity_number ?? r.tc ?? r.masked_tc ?? null;
  const uuid       = r.individual_uuid ?? r.uuid ?? r.id ?? '';

  // individual_type: 1 (öğrenci) / 2 (personel). Farklı isimler de olabilir.
  let typeRaw = r.individual_type ?? r.type ?? r.birey_tipi ?? r.bireyTipi;
  if (typeof typeRaw === 'string') {
    const low = typeRaw.toLowerCase();
    if (/ogrenci|öğrenci|birey|student/.test(low)) typeRaw = 1;
    else if (/personel|staff|ogretmen|öğretmen|teacher/.test(low)) typeRaw = 2;
    else typeRaw = Number(typeRaw);
  }
  const individualType = Number.isFinite(typeRaw) ? Number(typeRaw) : null;

  if (!fullName || !firstEntry) return null; // zorunlu alanlar yoksa at

  const entryDate = new Date(firstEntry);
  if (isNaN(entryDate.getTime())) return null;

  const exitDate = lastExit ? new Date(lastExit) : null;
  const validExit = exitDate && !isNaN(exitDate.getTime()) ? exitDate : null;

  return {
    individual_uuid: String(uuid),
    individual_full_name: String(fullName),
    individual_identity_number: idNumber ? String(idNumber) : '',
    individual_type: individualType ?? 1,
    first_entry: entryDate.toISOString(),
    last_exit: validExit ? validExit.toISOString() : null,
  };
}

interface OrgCredentials {
  apiUrl: string;
  username: string;
  password: string;
  cityId: string;
  districtId: string;
  remId: string;
}

export class BkdsProviderService {
  private organizationId: string;
  private creds: OrgCredentials | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /** DB'den veya .env fallback'ten kimlik bilgilerini yükle */
  private async getCredentials(): Promise<OrgCredentials> {
    if (this.creds) return this.creds;

    const dbCred = await prisma.bkdsCredential.findUnique({
      where: { organizationId: this.organizationId },
    });

    if (dbCred) {
      this.creds = {
        apiUrl: dbCred.apiUrl,
        username: dbCred.username,
        password: dbCred.password,
        cityId: dbCred.cityId,
        districtId: dbCred.districtId,
        remId: dbCred.remId,
      };
    } else {
      // Geriye dönük uyumluluk: .env'den oku
      this.creds = {
        apiUrl: process.env.BKDS_API_URL ?? 'https://bkds-api.meb.gov.tr',
        username: process.env.BKDS_USERNAME ?? '',
        password: process.env.BKDS_PASSWORD ?? '',
        cityId: process.env.BKDS_CITY_ID ?? '',
        districtId: process.env.BKDS_DISTRICT_ID ?? '',
        remId: process.env.BKDS_REM_ID ?? '',
      };
    }

    return this.creds;
  }

  /** Token geçersiz olduğunda creds'i yeniden yükle */
  invalidateCredentials() {
    this.creds = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
  }

  private async login(): Promise<void> {
    const creds = await this.getCredentials();
    const loginUrl = `${creds.apiUrl}/api/users/login/`;
    let res: Response;
    try {
      res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: creds.username, password: creds.password }),
      });
    } catch (e: any) {
      throw new Error(`BKDS login network hatası [${this.organizationId}] (${loginUrl}): ${e?.message ?? e}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`BKDS login hatası [${this.organizationId}] (${loginUrl}): ${res.status} — ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    this.accessToken = data.access;
    this.refreshToken = data.refresh;
    this.tokenExpiry = Date.now() + 25 * 60 * 1000;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) { await this.login(); return; }
    const creds = await this.getCredentials();
    const res = await fetch(`${creds.apiUrl}/api/users/login/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: this.refreshToken }),
    });
    if (!res.ok) { await this.login(); return; }
    const data = await res.json();
    this.accessToken = data.access;
    this.tokenExpiry = Date.now() + 25 * 60 * 1000;
  }

  private async getToken(): Promise<string> {
    if (!this.accessToken || Date.now() > this.tokenExpiry) await this.refreshAccessToken();
    return this.accessToken!;
  }

  async fetchToday(): Promise<BkdsApiRecord[]> {
    // Türkiye (UTC+3) gününü server timezone'dan bağımsız olarak hesapla:
    // - "Bugün TR" = TR 00:00 → TR 23:59:59
    // - UTC'ye çevir: TR 00:00 = UTC önceki gün 21:00 ; TR 23:59:59 = UTC bugün 20:59:59
    const trStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' });
    const todayStr = trStr.split(' ')[0]; // "YYYY-MM-DD"
    const startUTC = new Date(`${todayStr}T00:00:00.000+03:00`);
    const endUTC   = new Date(`${todayStr}T23:59:59.999+03:00`);
    return this.fetchByTimeRange(startUTC.toISOString(), endUTC.toISOString());
  }

  async fetchByTimeRange(startTime: string, endTime: string): Promise<BkdsApiRecord[]> {
    const creds = await this.getCredentials();
    const token = await this.getToken();
    const allResults: BkdsApiRecord[] = [];
    let page = 1;
    let hasMore = true;

    // Yerel BRY: /api/activities/individual-activity/each-individual/ (city/district/rem yok)
    // MEB public: /api/activity/daily-activity/each-individual/ (city/district/rem gerekli)
    const isLocalBry = !/bkds-api\.meb\.gov\.tr/i.test(creds.apiUrl);
    const activityPath = isLocalBry
      ? '/api/activities/individual-activity/each-individual/'
      : '/api/activity/daily-activity/each-individual/';

    while (hasMore) {
      const url = new URL(`${creds.apiUrl}${activityPath}`);
      url.searchParams.set('page_size', '100');
      url.searchParams.set('ordering', '-first_entry');
      url.searchParams.set('page', String(page));
      if (!isLocalBry) {
        if (creds.cityId)     url.searchParams.set('city', creds.cityId);
        if (creds.districtId) url.searchParams.set('district', creds.districtId);
        if (creds.remId)      url.searchParams.set('rem', creds.remId);
      }
      url.searchParams.set('start_time', startTime);
      url.searchParams.set('end_time', endTime);

      let res: Response;
      try {
        res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      } catch (e: any) {
        throw new Error(`BKDS network hatası [${this.organizationId}] (${url.origin}): ${e?.message ?? e}`);
      }
      if (!res.ok) {
        if (res.status === 401) { await this.login(); continue; }
        const body = await res.text().catch(() => '');
        throw new Error(`BKDS API hatası [${this.organizationId}] (${url.pathname}): ${res.status} — ${body.slice(0, 300)}`);
      }
      const data: BkdsApiResponse = await res.json();
      if (page === 1 && data.results?.[0]) {
        console.log(`[BKDS][${this.organizationId}] örnek kayıt alanları:`, Object.keys(data.results[0]));
      }
      const normalized = (data.results ?? []).map(r => normalizeRecord(r)).filter((r): r is BkdsApiRecord => r !== null);
      allResults.push(...normalized);
      hasMore = !!data.next;
      page++;
    }

    console.log(`[BKDS][${this.organizationId}] ${allResults.length} toplam kayıt`);
    return allResults;
  }

  async saveAndAggregate(records: BkdsApiRecord[], tarih: Date): Promise<void> {
    const orgId = this.organizationId;
    const dateOnly = new Date(tarih);
    dateOnly.setHours(0, 0, 0, 0);

    // Ham verileri kaydet — zorunlu alanları doğrula, geçersiz kayıtları at
    const rawRows = records
      .map(r => {
        const giris = new Date(r.first_entry);
        const cikis = r.last_exit ? new Date(r.last_exit) : null;
        if (!r.individual_full_name || isNaN(giris.getTime())) return null;
        if (cikis && isNaN(cikis.getTime())) return null;
        return {
          organizationId: orgId,
          tarih: dateOnly,
          adSoyad: r.individual_full_name,
          maskedTc: r.individual_identity_number || null,
          individualType: Number.isFinite(r.individual_type as any) ? r.individual_type : null,
          girisZamani: giris,
          cikisZamani: cikis,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (rawRows.length !== records.length) {
      console.warn(`[BKDS][${orgId}] ${records.length - rawRows.length} kayıt geçersiz alan nedeniyle atlandı`);
    }

    // Atomik delete+create — client polling asla boş görmez
    await prisma.$transaction([
      prisma.bkdsRaw.deleteMany({ where: { organizationId: orgId, tarih: dateOnly } }),
      ...(rawRows.length > 0 ? [prisma.bkdsRaw.createMany({ data: rawRows })] : []),
    ]);

    const bireyRecords    = records.filter(r => r.individual_type === 1);
    const personelRecords = records.filter(r => r.individual_type === 2);

    const [allStudents, allStaff] = await Promise.all([
      prisma.student.findMany({ where: { organizationId: orgId, aktif: true } }),
      prisma.staff.findMany({ where: { organizationId: orgId, aktif: true } }),
    ]);

    // --- Öğrenci aggregate ---
    const bireyMap = new Map<string, BkdsApiRecord[]>();
    for (const r of bireyRecords) {
      const ex = bireyMap.get(r.individual_full_name) ?? [];
      ex.push(r);
      bireyMap.set(r.individual_full_name, ex);
    }
    let ogrEslesen = 0, ogrEslesemeyen = 0;
    const eslesemeyenIsimler: string[] = [];
    for (const [maskedName, recs] of bireyMap.entries()) {
      const ilkGiris = new Date(Math.min(...recs.map(r => new Date(r.first_entry).getTime())));
      const cikislar = recs.filter(r => r.last_exit).map(r => new Date(r.last_exit!).getTime());
      const sonCikis = cikislar.length > 0 ? new Date(Math.max(...cikislar)) : null;
      // BKDS aynı maskeli isim için aynı maskedTc'yi gönderir; ilk record'tan al
      const maskedTc = recs[0]?.individual_identity_number || null;

      // 1) Tam (prefix+suffix) match — birden çok aday olabilir (MUH...NAR
      //    hem MUHSIN UCPINAR hem MUHAMMED YANAR'a uyar). TC tie-breaker.
      const tamAdaylar = allStudents.filter(s => matchMaskedName(maskedName, s.adSoyad));
      let student = tamAdaylar.length === 1
        ? tamAdaylar[0]
        : tamAdaylar.find(s => matchMaskedTc(maskedTc, s.tc) === 'eslesti');
      if (!student && tamAdaylar.length > 0) {
        // TC bilgisi yoksa veya hiçbiri eşleşmediyse: ilk adayi al (eski davranis)
        student = tamAdaylar[0];
      }
      // 2) Fuzzy (prefix-only) — soyad değişmiş senaryosu
      if (!student) {
        const fuzzy = allStudents
          .map(s => ({ s, r: matchMaskedNameFuzzy(maskedName, s.adSoyad) }))
          .filter(x => x.r.type === 'prefix_eslesme')
          .sort((a, b) => b.r.score - a.r.score);
        if (fuzzy.length === 1) {
          student = fuzzy[0].s;
        } else if (fuzzy.length > 1) {
          // Çok aday — TC tie-breaker, yoksa en yüksek skor
          student = fuzzy.find(x => matchMaskedTc(maskedTc, x.s.tc) === 'eslesti')?.s ?? fuzzy[0].s;
        }
      }
      if (student) {
        ogrEslesen++;
        await prisma.bkdsAggregate.upsert({
          where: { studentId_tarih: { studentId: student.id, tarih: dateOnly } },
          create: { organizationId: orgId, studentId: student.id, tarih: dateOnly, adSoyad: maskedName, ilkGiris, sonCikis },
          update: { adSoyad: maskedName, ilkGiris, sonCikis },
        });
      } else {
        ogrEslesemeyen++;
        if (eslesemeyenIsimler.length < 5) eslesemeyenIsimler.push(maskedName);
      }
    }
    console.log(`[BKDS][${orgId}] Öğrenci eşleşme — eşleşen: ${ogrEslesen}, eşleşemeyen: ${ogrEslesemeyen}`);
    if (eslesemeyenIsimler.length > 0) {
      console.log(`[BKDS][${orgId}] Eşleşemeyen öğrenci örnekleri:`, eslesemeyenIsimler);
      if (allStudents.length > 0) {
        console.log(`[BKDS][${orgId}] Örnek Student.adSoyad:`, allStudents.slice(0, 3).map(s => s.adSoyad));
      }
    }

    // --- Personel: gelişmiş eşleştirme ---
    const personelMap = new Map<string, BkdsApiRecord[]>();
    for (const r of personelRecords) {
      const ex = personelMap.get(r.individual_full_name) ?? [];
      ex.push(r);
      personelMap.set(r.individual_full_name, ex);
    }

    // Önce tüm personel log verilerini hesapla + staffSession update'lerini topla
    type PersonelLogInsert = {
      organizationId: string;
      tarih: Date;
      maskedAd: string;
      ilkGiris: Date;
      sonCikis: Date | null;
      staffId: string | null;
      eslesmeDurumu: string;
      tahminEdilenAd: string | null;
    };
    const personelLogsToInsert: PersonelLogInsert[] = [];
    const staffSessionUpdates: Array<{ staffId: string; ilkGiris: Date; sonCikis: Date | null }> = [];

    for (const [maskedName, recs] of personelMap.entries()) {
      const ilkGiris = new Date(Math.min(...recs.map(r => new Date(r.first_entry).getTime())));
      const cikislar = recs.filter(r => r.last_exit).map(r => new Date(r.last_exit!).getTime());
      const sonCikis = cikislar.length > 0 ? new Date(Math.max(...cikislar)) : null;

      let matchedStaff = allStaff.find(s => matchMaskedName(maskedName, s.adSoyad));
      let eslesmeTipi: 'tam_eslesme' | 'prefix_eslesme' | 'eslesme_yok' = 'eslesme_yok';
      let tahminEdilenAd: string | undefined;

      if (matchedStaff) {
        eslesmeTipi = 'tam_eslesme';
      } else {
        const prefixMatches = allStaff
          .map(s => ({ staff: s, result: matchMaskedNameFuzzy(maskedName, s.adSoyad) }))
          .filter(x => x.result.type === 'prefix_eslesme')
          .sort((a, b) => b.result.score - a.result.score);

        if (prefixMatches.length >= 1) {
          matchedStaff = prefixMatches[0].staff;
          eslesmeTipi = 'prefix_eslesme';
          tahminEdilenAd = prefixMatches.length === 1
            ? prefixMatches[0].staff.adSoyad
            : prefixMatches.map(x => x.staff.adSoyad).join(' / ');
        }
      }

      personelLogsToInsert.push({
        organizationId: orgId,
        tarih: dateOnly,
        maskedAd: maskedName,
        ilkGiris,
        sonCikis,
        staffId: matchedStaff?.id ?? null,
        eslesmeDurumu: eslesmeTipi,
        tahminEdilenAd: tahminEdilenAd ?? null,
      });

      if (matchedStaff) {
        staffSessionUpdates.push({ staffId: matchedStaff.id, ilkGiris, sonCikis });
      }
    }

    // Atomik delete+create — personel takibi sayısı stabil kalır
    await prisma.$transaction([
      prisma.bkdsPersonelLog.deleteMany({ where: { organizationId: orgId, tarih: dateOnly } }),
      ...(personelLogsToInsert.length > 0
        ? [prisma.bkdsPersonelLog.createMany({ data: personelLogsToInsert })]
        : []),
    ]);

    // StaffSession güncellemeleri — transaction dışı (UI'ya etkisiz)
    for (const upd of staffSessionUpdates) {
      await prisma.staffSession.updateMany({
        where: { organizationId: orgId, staffId: upd.staffId, tarih: dateOnly },
        data: { basladiMi: true, baslamaZamani: upd.ilkGiris, sonCikisZamani: upd.sonCikis },
      });
    }
  }
}

// Per-org singleton cache
const serviceCache = new Map<string, BkdsProviderService>();

export function getBkdsService(organizationId: string): BkdsProviderService {
  if (!serviceCache.has(organizationId)) {
    serviceCache.set(organizationId, new BkdsProviderService(organizationId));
  }
  return serviceCache.get(organizationId)!;
}

/** Geriye dönük uyumluluk — tek kurum modunda */
export const bkdsProviderService = {
  fetchToday: async () => {
    const org = await prisma.organization.findFirst();
    if (!org) throw new Error('Hiç kurum yok');
    return getBkdsService(org.id).fetchToday();
  },
};
