/**
 * GET    /api/admin/organizations/:id  - kurum detayı
 * PATCH  /api/admin/organizations/:id  - kurum güncelle
 * DELETE /api/admin/organizations/:id  - kurumu devre dışı bırak
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

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });

  const org = await prisma.organization.findUnique({
    where: { id: params.id },
    include: {
      credentials: true,
      _count: { select: { users: true, students: true, staff: true } },
    },
  });

  if (!org) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });
  return NextResponse.json(org);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });

  const body = await req.json();
  const { name, slug, plan, active, trialDays, credentials } = body;

  const trialEndsAt = trialDays
    ? new Date(Date.now() + Number(trialDays) * 24 * 60 * 60 * 1000)
    : undefined;

  const org = await prisma.organization.update({
    where: { id: params.id },
    data: {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(plan && { plan }),
      ...(active !== undefined && { active }),
      ...(trialEndsAt && { trialEndsAt }),
    },
  });

  if (credentials) {
    await prisma.bkdsCredential.upsert({
      where: { organizationId: params.id },
      create: {
        organizationId: params.id,
        username: credentials.username,
        password: credentials.password,
        cityId: credentials.cityId,
        districtId: credentials.districtId,
        remId: credentials.remId,
        apiUrl: credentials.apiUrl ?? 'https://bkds-api.meb.gov.tr',
      },
      update: {
        ...(credentials.username && { username: credentials.username }),
        ...(credentials.password && { password: credentials.password }),
        ...(credentials.cityId && { cityId: credentials.cityId }),
        ...(credentials.districtId && { districtId: credentials.districtId }),
        ...(credentials.remId && { remId: credentials.remId }),
        ...(credentials.apiUrl && { apiUrl: credentials.apiUrl }),
      },
    });
  }

  return NextResponse.json(org);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });

  // Silmek yerine devre dışı bırak
  const org = await prisma.organization.update({
    where: { id: params.id },
    data: { active: false },
  });

  return NextResponse.json(org);
}
