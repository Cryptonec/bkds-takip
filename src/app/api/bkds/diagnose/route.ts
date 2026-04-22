import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const result: any = { orgId, timestamp: new Date().toISOString() };

  const dbCred = await prisma.bkdsCredential.findUnique({ where: { organizationId: orgId } });
  const apiUrl = (dbCred?.apiUrl ?? process.env.BKDS_API_URL ?? '').replace(/\/+$/, '');
  const username = dbCred?.username ?? process.env.BKDS_USERNAME ?? '';
  const password = dbCred?.password ?? process.env.BKDS_PASSWORD ?? '';
  result.apiUrl = apiUrl;

  // Login
  const loginRes = await fetch(`${apiUrl}/api/users/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const loginData = await loginRes.json().catch(() => ({}));
  const token = loginData?.access;
  if (!token) {
    return NextResponse.json({ ...result, error: 'Login fail', loginData });
  }

  const H = { Authorization: `Bearer ${token}` };
  const trStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const todayStr = trStr.split(' ')[0];
  const start = new Date(`${todayStr}T00:00:00.000+03:00`).toISOString();
  const end   = new Date(`${todayStr}T23:59:59.999+03:00`).toISOString();

  // Aktivite endpoint'inden bir UUID çek
  const actUrl = `${apiUrl}/api/activities/individual-activity/each-individual/?page_size=5&ordering=-first_entry&page=1&start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`;
  const actRes = await fetch(actUrl, { headers: H });
  const actData = await actRes.json().catch(() => ({}));
  const sampleUuid: string | null = actData?.results?.[0]?.individual_uuid ?? null;
  result.activitySample = { url: actUrl, count: actData?.count, firstResult: actData?.results?.[0] };

  // Farklı query parametreleri dene — aktivite endpoint'inde
  const actVariants = [
    'expand=individual',
    'include=individual',
    'fields=*',
    'detail=true',
    'show_individual=true',
    'with_individual=true',
    'individual_detail=true',
    '',  // sadece filter olmadan
  ];
  result.activityWithParams = {};
  for (const variant of actVariants) {
    const u = new URL(actUrl);
    if (variant) {
      const [k, v] = variant.split('=');
      u.searchParams.set(k, v);
    }
    u.searchParams.set('page_size', '1');
    try {
      const r = await fetch(u.toString(), { headers: H });
      const t = await r.text();
      let b: any = null;
      try { b = JSON.parse(t); } catch { b = t.slice(0, 200); }
      const first = b?.results?.[0];
      result.activityWithParams[variant || '(no-param)'] = {
        status: r.status,
        fields: first ? Object.keys(first) : null,
        sample: first,
      };
    } catch (e: any) {
      result.activityWithParams[variant] = { error: String(e) };
    }
  }

  // Olası birey/individual endpoint'lerini dene
  const probeList = [
    '/api/individuals/',
    '/api/individuals',
    '/api/bireyler/',
    '/api/birey/',
    '/api/users/',
    '/api/activities/individual-activity/',
    '/api/matches/individual-match/',
    '/api/activities/',
  ];
  if (sampleUuid) {
    probeList.push(
      `/api/individuals/${sampleUuid}/`,
      `/api/bireyler/${sampleUuid}/`,
      `/api/activities/individual-activity/${sampleUuid}/`,
      `/api/matches/individual-match/?individual=${sampleUuid}`,
    );
  }

  result.endpointProbes = {};
  for (const path of probeList) {
    try {
      const url = path.startsWith('http') ? path : `${apiUrl}${path}`;
      const r = await fetch(url, { headers: H });
      const ct = r.headers.get('content-type') ?? '';
      const isJson = ct.includes('application/json');
      const body = isJson ? await r.json().catch(() => null) : await r.text().then(t => t.slice(0, 120));
      const firstItem = Array.isArray(body)
        ? body[0]
        : body?.results?.[0] ?? null;
      result.endpointProbes[path] = {
        status: r.status,
        isJson,
        topLevelKeys: body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).slice(0, 15) : null,
        count: body?.count ?? (Array.isArray(body) ? body.length : null),
        firstItemKeys: firstItem && typeof firstItem === 'object' ? Object.keys(firstItem) : null,
        firstItem: firstItem && typeof firstItem === 'object' ? firstItem : undefined,
      };
    } catch (e: any) {
      result.endpointProbes[path] = { error: String(e) };
    }
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
