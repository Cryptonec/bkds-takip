import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { getBkdsService } from '@/lib/services/bkdsProviderService';
import { matchMaskedName, matchMaskedNameFuzzy } from '@/lib/utils/normalize';
import { prisma } from '@/lib/prisma';

/**
 * BKDS entegrasyonunun sağlığını raw fetch seviyesine kadar görüntüler.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const result: any = { orgId, timestamp: new Date().toISOString(), steps: [] };

  // 1) Credentials
  const dbCred = await prisma.bkdsCredential.findUnique({ where: { organizationId: orgId } });
  const apiUrl = (dbCred?.apiUrl ?? process.env.BKDS_API_URL ?? '').replace(/\/+$/, '');
  const username = dbCred?.username ?? process.env.BKDS_USERNAME ?? '';
  const password = dbCred?.password ?? process.env.BKDS_PASSWORD ?? '';
  result.credential = { hasDbRecord: !!dbCred, apiUrl, username };

  // 2) Raw login — tam response body'yi göster
  let token: string | null = null;
  let loginBody: any = null;
  try {
    const res = await fetch(`${apiUrl}/api/users/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const text = await res.text();
    try { loginBody = JSON.parse(text); } catch { loginBody = text.slice(0, 500); }
    result.loginRaw = {
      status: res.status,
      ok: res.ok,
      bodyKeys: loginBody && typeof loginBody === 'object' ? Object.keys(loginBody) : null,
      body: loginBody,
    };
    // Olası token alan isimleri
    if (loginBody && typeof loginBody === 'object') {
      token = loginBody.access ?? loginBody.token ?? loginBody.access_token ?? loginBody.accessToken
           ?? loginBody.jwt ?? loginBody.key ?? null;
    }
    result.tokenFound = !!token;
    result.tokenFieldGuess = token
      ? (loginBody.access ? 'access' : loginBody.token ? 'token' : loginBody.access_token ? 'access_token' : 'other')
      : null;
    result.steps.push('login_done');
  } catch (e: any) {
    result.loginError = e?.message ?? String(e);
    return NextResponse.json(result, { status: 500 });
  }

  if (!token) {
    return NextResponse.json({ ...result, error: 'Login başarılı ama token bulunamadı — loginBody\'yi incele' });
  }

  // 3) Raw activity fetch
  const trStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const todayStr = trStr.split(' ')[0];
  const startUTC = new Date(`${todayStr}T00:00:00.000+03:00`);
  const endUTC   = new Date(`${todayStr}T23:59:59.999+03:00`);

  // Her iki olası path'i de dene
  const candidatePaths = [
    '/api/activities/individual-activity/each-individual/',
    '/api/activity/daily-activity/each-individual/',
  ];

  result.activityProbe = {};
  for (const path of candidatePaths) {
    const url = new URL(apiUrl + path);
    url.searchParams.set('page_size', '100');
    url.searchParams.set('ordering', '-first_entry');
    url.searchParams.set('page', '1');
    url.searchParams.set('start_time', startUTC.toISOString());
    url.searchParams.set('end_time', endUTC.toISOString());

    try {
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
      result.activityProbe[path] = {
        status: res.status,
        ok: res.ok,
        url: url.toString(),
        responseKeys: body && typeof body === 'object' ? Object.keys(body) : null,
        count: body?.count ?? body?.results?.length ?? null,
        firstResult: body?.results?.[0] ?? body?.[0] ?? null,
        bodyPreview: typeof body === 'string' ? body : undefined,
      };
    } catch (e: any) {
      result.activityProbe[path] = { error: e?.message ?? String(e) };
    }
  }

  // 4) DB counts
  const dateOnly = new Date(); dateOnly.setHours(0, 0, 0, 0);
  const [rawCount, aggCount, attendanceCount, withGercekGiris] = await Promise.all([
    prisma.bkdsRaw.count({ where: { organizationId: orgId, tarih: dateOnly } }),
    prisma.bkdsAggregate.count({ where: { organizationId: orgId, tarih: dateOnly } }),
    prisma.attendance.count({ where: { organizationId: orgId, tarih: dateOnly } }),
    prisma.attendance.count({ where: { organizationId: orgId, tarih: dateOnly, NOT: { gercekGiris: null } } }),
  ]);
  result.db = { rawCount, aggCount, attendanceCount, withGercekGiris };

  // 5) DB'de örnek isimler
  const [students, staff] = await Promise.all([
    prisma.student.findMany({ where: { organizationId: orgId, aktif: true }, select: { adSoyad: true }, take: 5 }),
    prisma.staff.findMany({ where: { organizationId: orgId, aktif: true }, select: { adSoyad: true }, take: 5 }),
  ]);
  result.sampleDbNames = {
    students: students.map(s => s.adSoyad),
    staff: staff.map(s => s.adSoyad),
  };

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
