/**
 * GET  /api/admin/organizations       - tüm kurumları listele (superadmin)
 * POST /api/admin/organizations       - yeni kurum oluştur (superadmin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function requireSuperadmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  if ((session.user as any).role !== 'superadmin') return null;
  return session;
}

export async function GET() {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { users: true, students: true } },
      credentials: { select: { username: true, cityId: true, districtId: true } },
    },
  });

  return NextResponse.json(orgs);
}

export async function POST(req: NextRequest) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });

  const body = await req.json();
  const { name, slug, plan, trialDays, credentials } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: 'name ve slug zorunlu' }, { status: 400 });
  }

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: 'Bu slug zaten kullanılıyor' }, { status: 409 });
  }

  const trialEndsAt = trialDays
    ? new Date(Date.now() + Number(trialDays) * 24 * 60 * 60 * 1000)
    : undefined;

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      plan: plan ?? 'trial',
      trialEndsAt,
      ...(credentials && {
        credentials: {
          create: {
            username: credentials.username,
            password: credentials.password,
            cityId: credentials.cityId,
            districtId: credentials.districtId,
            remId: credentials.remId,
            apiUrl: credentials.apiUrl ?? 'https://bkds-api.meb.gov.tr',
          },
        },
      }),
    },
    include: { credentials: true },
  });

  return NextResponse.json(org, { status: 201 });
}
