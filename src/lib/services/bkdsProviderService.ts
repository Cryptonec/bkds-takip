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

export class BkdsProviderService {
  private apiUrl: string;
  private username: string;
  private password: string;
  private cityId: string;
  private districtId: string;
  private remId: string;
  private organizationId: string | null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(opts?: {
    organizationId?: string;
    apiUrl?: string;
    username?: string;
    password?: string;
    cityId?: string;
    districtId?: string;
    remId?: string;
  }) {
    this.organizationId = opts?.organizationId ?? null;
    this.apiUrl = opts?.apiUrl ?? process.env.BKDS_API_URL ?? 'https://bkds.meb.gov.tr';
    this.username = opts?.username ?? process.env.BKDS_USERNAME ?? '';
    this.password = opts?.password ?? process.env.BKDS_PASSWORD ?? '';
    this.cityId = opts?.cityId ?? process.env.BKDS_CITY_ID ?? '';
    this.districtId = opts?.districtId ?? process.env.BKDS_DISTRICT_ID ?? '';
    this.remId = opts?.remId ?? process.env.BKDS_REM_ID ?? '';
  }

  /**
   * Organizasyonun DB'deki kimlik bilgileriyle yeni bir instance oluşturur.
   */
  static async forOrganization(organizationId: string): Promise<BkdsProviderService> {
    const cred = await prisma.bkdsCredential.findUnique({ where: { organizationId } });
    if (!cred) throw new Error(`Kurum (${organizationId}) için BKDS kimlik bilgisi bulunamadı`);
    return new BkdsProviderService({
      organizationId,
      apiUrl: cred.apiUrl,
      username: cred.username,
      password: cred.password,
      cityId: cred.cityId,
      districtId: cred.districtId,
      remId: cred.remId,
    });
  }

  private async login(): Promise<void> {
    const res = await fetch(`${this.apiUrl}/api/users/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (!res.ok) throw new Error(`BKDS login hatası: ${res.status}`);
    const data = await res.json();
    this.accessToken = data.access;
    this.refreshToken = data.refresh;
    this.tokenExpiry = Date.now() + 25 * 60 * 1000;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) { await this.login(); return; }
    const res = await fetch(`${this.apiUrl}/api/users/login/refresh/`, {
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
    const token = await this.getToken();
    const allResults: BkdsApiRecord[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(`${this.apiUrl}/api/activity/daily-activity/each-individual/`);
      url.searchParams.set('page_size', '100');
      url.searchParams.set('ordering', '-first_entry');
      url.searchParams.set('page', String(page));
      if (this.cityId)     url.searchParams.set('city',     this.cityId);
      if (this.districtId) url.searchParams.set('district', this.districtId);
      if (this.remId)      url.searchParams.set('rem',      this.remId);
      url.searchParams.set('start_time', startTime);
      url.searchParams.set('end_time', endTime);

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        if (res.status === 401) { await this.login(); continue; }
        throw new Error(`BKDS API hatası: ${res.status}`);
      }
      const data: BkdsApiResponse = await res.json();
      allResults.push(...data.results);
      hasMore = !!data.next;
      page++;
    }

    console.log(`[BKDS] ${allResults.length} toplam kayıt (org: ${this.organizationId ?? 'env'})`);
    return allResults;
  }

  async saveAndAggregate(records: BkdsApiRecord[], tarih: Date): Promise<void> {
    const orgId = this.organizationId;
    if (!orgId) throw new Error('saveAndAggregate için organizationId gerekli');

    const dateOnly = new Date(tarih);
    dateOnly.setHours(0, 0, 0, 0);

    // Ham verileri kaydet
    await prisma.bkdsRaw.deleteMany({ where: { tarih: dateOnly, organizationId: orgId } });
    if (records.length > 0) {
      await prisma.bkdsRaw.createMany({
        data: records.map(r => ({
          organizationId: orgId,
          tarih: dateOnly,
          adSoyad: r.individual_full_name,
          maskedTc: r.individual_identity_number ?? null,
          girisZamani: new Date(r.first_entry),
          cikisZamani: r.last_exit ? new Date(r.last_exit) : null,
        })),
      });
    }

    const bireyRecords    = records.filter(r => r.individual_type === 1);
    const personelRecords = records.filter(r => r.individual_type === 2);

    const [allStudents, allStaff] = await Promise.all([
      prisma.student.findMany({ where: { aktif: true, organizationId: orgId } }),
      prisma.staff.findMany({ where: { aktif: true, organizationId: orgId } }),
    ]);

    // --- Öğrenci aggregate ---
    const bireyMap = new Map<string, BkdsApiRecord[]>();
    for (const r of bireyRecords) {
      const ex = bireyMap.get(r.individual_full_name) ?? [];
      ex.push(r);
      bireyMap.set(r.individual_full_name, ex);
    }
    for (const [maskedName, recs] of bireyMap.entries()) {
      const ilkGiris = new Date(Math.min(...recs.map(r => new Date(r.first_entry).getTime())));
      const cikislar = recs.filter(r => r.last_exit).map(r => new Date(r.last_exit!).getTime());
      const sonCikis = cikislar.length > 0 ? new Date(Math.max(...cikislar)) : null;
      const student = allStudents.find(s => matchMaskedName(maskedName, s.adSoyad));
      if (student) {
        await prisma.bkdsAggregate.upsert({
          where: { studentId_tarih_organizationId: { studentId: student.id, tarih: dateOnly, organizationId: orgId } },
          create: { organizationId: orgId, studentId: student.id, tarih: dateOnly, adSoyad: maskedName, ilkGiris, sonCikis },
          update: { adSoyad: maskedName, ilkGiris, sonCikis },
        });
      }
    }

    // --- Personel: gelişmiş eşleştirme ---
    const personelMap = new Map<string, BkdsApiRecord[]>();
    for (const r of personelRecords) {
      const ex = personelMap.get(r.individual_full_name) ?? [];
      ex.push(r);
      personelMap.set(r.individual_full_name, ex);
    }

    await prisma.bkdsPersonelLog.deleteMany({ where: { tarih: dateOnly, organizationId: orgId } });

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

        if (prefixMatches.length === 1) {
          matchedStaff = prefixMatches[0].staff;
          eslesmeTipi = 'prefix_eslesme';
          tahminEdilenAd = prefixMatches[0].staff.adSoyad;
        } else if (prefixMatches.length > 1) {
          matchedStaff = prefixMatches[0].staff;
          eslesmeTipi = 'prefix_eslesme';
          tahminEdilenAd = prefixMatches.map(x => x.staff.adSoyad).join(' / ');
        }
      }

      await prisma.bkdsPersonelLog.create({
        data: {
          organizationId: orgId,
          tarih: dateOnly,
          maskedAd: maskedName,
          ilkGiris,
          sonCikis,
          staffId: matchedStaff?.id ?? null,
          eslesmeDurumu: eslesmeTipi,
          tahminEdilenAd: tahminEdilenAd ?? null,
        },
      });

      if (matchedStaff) {
        const sessions = await prisma.staffSession.findMany({
          where: { staffId: matchedStaff.id, tarih: dateOnly, organizationId: orgId },
        });

        for (const session of sessions) {
          await prisma.staffSession.update({
            where: { id: session.id },
            data: { basladiMi: true, baslamaZamani: ilkGiris, sonCikisZamani: sonCikis },
          });
        }
      }
    }
  }
}

// Geriye dönük uyumluluk için tek kurum env-tabanlı instance
export const bkdsProviderService = new BkdsProviderService();
