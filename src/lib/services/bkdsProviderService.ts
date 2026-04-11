import { prisma } from '@/lib/prisma';
import { matchMaskedName, matchMaskedNameFuzzy } from '@/lib/utils/normalize';

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
  results: BkdsApiRecord[];
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

  invalidateCredentials() {
    this.creds = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
  }

  private async login(): Promise<void> {
    const creds = await this.getCredentials();
    const res = await fetch(`${creds.apiUrl}/api/users/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
    });
    if (!res.ok) throw new Error(`BKDS login hatası [${this.organizationId}]: ${res.status}`);
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
    const now = new Date();
    const todayTR = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    todayTR.setHours(0, 0, 0, 0);
    const startUTC = new Date(todayTR.getTime() - 3 * 60 * 60 * 1000);
    const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1000);
    return this.fetchByTimeRange(startUTC.toISOString(), endUTC.toISOString());
  }

  async fetchByTimeRange(startTime: string, endTime: string): Promise<BkdsApiRecord[]> {
    const creds = await this.getCredentials();
    const token = await this.getToken();
    const allResults: BkdsApiRecord[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(`${creds.apiUrl}/api/activity/daily-activity/each-individual/`);
      url.searchParams.set('page_size', '100');
      url.searchParams.set('ordering', '-first_entry');
      url.searchParams.set('page', String(page));
      if (creds.cityId)     url.searchParams.set('city',     creds.cityId);
      if (creds.districtId) url.searchParams.set('district', creds.districtId);
      if (creds.remId)      url.searchParams.set('rem',      creds.remId);
      url.searchParams.set('start_time', startTime);
      url.searchParams.set('end_time', endTime);

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        if (res.status === 401) { await this.login(); continue; }
        throw new Error(`BKDS API hatası [${this.organizationId}]: ${res.status}`);
      }
      const data: BkdsApiResponse = await res.json();
      allResults.push(...data.results);
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

    const bireyRecords    = records.filter(r => r.individual_type === 1);
    const personelRecords = records.filter(r => r.individual_type === 2);

    // bkdsRaw güncelle + öğrenci/personel listesini paralel çek
    const [, , allStudents, allStaff] = await Promise.all([
      prisma.bkdsRaw.deleteMany({ where: { organizationId: orgId, tarih: dateOnly } }),
      records.length > 0
        ? prisma.bkdsRaw.createMany({
            data: records.map(r => ({
              organizationId: orgId, tarih: dateOnly,
              adSoyad: r.individual_full_name,
              maskedTc: r.individual_identity_number ?? null,
              girisZamani: new Date(r.first_entry),
              cikisZamani: r.last_exit ? new Date(r.last_exit) : null,
            })),
          })
        : Promise.resolve(),
      prisma.student.findMany({ where: { organizationId: orgId, aktif: true } }),
      prisma.staff.findMany({ where: { organizationId: orgId, aktif: true } }),
    ]);

    // Öğrenci ve personel aggregate'i paralel hazırla
    const bireyMap = new Map<string, BkdsApiRecord[]>();
    for (const r of bireyRecords) {
      const ex = bireyMap.get(r.individual_full_name) ?? [];
      ex.push(r); bireyMap.set(r.individual_full_name, ex);
    }
    const personelMap = new Map<string, BkdsApiRecord[]>();
    for (const r of personelRecords) {
      const ex = personelMap.get(r.individual_full_name) ?? [];
      ex.push(r); personelMap.set(r.individual_full_name, ex);
    }

    // Mevcut DB kayıtlarını paralel çek
    const [mevcutEslesmezsler, mevcutLoglar] = await Promise.all([
      prisma.bkdsAggregate.findMany({ where: { organizationId: orgId, tarih: dateOnly, studentId: null } }),
      prisma.bkdsPersonelLog.findMany({ where: { organizationId: orgId, tarih: dateOnly } }),
    ]);
    const eslesmezMap = new Map(mevcutEslesmezsler.map(r => [r.adSoyad, r]));
    const mevcutLogMap = new Map(mevcutLoglar.map(l => [l.maskedAd, l]));

    // Öğrenci aggregate — tüm kayıtları paralel işle
    await Promise.all([...bireyMap.entries()].map(async ([maskedName, recs]) => {
      const ilkGiris = new Date(Math.min(...recs.map(r => new Date(r.first_entry).getTime())));
      const cikislar = recs.filter(r => r.last_exit).map(r => new Date(r.last_exit!).getTime());
      const sonCikis = cikislar.length > 0 ? new Date(Math.max(...cikislar)) : null;
      const student = allStudents.find(s => matchMaskedName(maskedName, s.adSoyad));

      if (student) {
        const eslesmez = eslesmezMap.get(maskedName);
        if (eslesmez) {
          await prisma.bkdsAggregate.delete({ where: { id: eslesmez.id } });
        }
        await prisma.bkdsAggregate.upsert({
          where: { studentId_tarih_organizationId: { studentId: student.id, tarih: dateOnly, organizationId: orgId } },
          create: { organizationId: orgId, studentId: student.id, tarih: dateOnly, adSoyad: maskedName, ilkGiris, sonCikis },
          update: { adSoyad: maskedName, ilkGiris, sonCikis },
        });
      } else {
        const mevcut = eslesmezMap.get(maskedName);
        if (mevcut) {
          await prisma.bkdsAggregate.update({ where: { id: mevcut.id }, data: { ilkGiris, sonCikis } });
        } else {
          await prisma.bkdsAggregate.create({
            data: { organizationId: orgId, studentId: null, tarih: dateOnly, adSoyad: maskedName, ilkGiris, sonCikis },
          });
        }
      }
    }));

    // Personel eşleştirme — tüm kayıtları paralel işle
    await Promise.all([...personelMap.entries()].map(async ([maskedName, recs]) => {
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

      const logData = {
        ilkGiris, sonCikis,
        staffId: matchedStaff?.id ?? null,
        eslesmeDurumu: eslesmeTipi,
        tahminEdilenAd: tahminEdilenAd ?? null,
      };

      const mevcutLog = mevcutLogMap.get(maskedName);
      if (mevcutLog) {
        await prisma.bkdsPersonelLog.update({ where: { id: mevcutLog.id }, data: logData });
      } else {
        await prisma.bkdsPersonelLog.create({
          data: { organizationId: orgId, tarih: dateOnly, maskedAd: maskedName, ...logData },
        });
      }

      if (matchedStaff) {
        const sessions = await prisma.staffSession.findMany({
          where: { organizationId: orgId, staffId: matchedStaff.id, tarih: dateOnly },
        });
        if (sessions.length > 0) {
          await Promise.all(sessions.map(s =>
            prisma.staffSession.update({
              where: { id: s.id },
              data: { basladiMi: true, baslamaZamani: ilkGiris, sonCikisZamani: sonCikis },
            })
          ));
        }
      }
    }));
  }
}

const serviceCache = new Map<string, BkdsProviderService>();

export function getBkdsService(organizationId: string): BkdsProviderService {
  if (!serviceCache.has(organizationId)) {
    serviceCache.set(organizationId, new BkdsProviderService(organizationId));
  }
  return serviceCache.get(organizationId)!;
}

export const bkdsProviderService = {
  fetchToday: async () => {
    const org = await prisma.organization.findFirst();
    if (!org) throw new Error('Hiç kurum yok');
    return getBkdsService(org.id).fetchToday();
  },
};
