import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

function requireSuperAdmin(session: any) {
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  if (session.user?.role !== 'superadmin') return NextResponse.json({ error: 'Yetersiz yetki' }, { status: 403 });
  return null;
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  active: z.boolean().optional(),
  bkdsUsername: z.string().optional(),
  bkdsPassword: z.string().optional(),
  bkdsCityId: z.string().optional(),
  bkdsDistrictId: z.string().optional(),
  bkdsRemId: z.string().optional(),
  pollInterval: z.number().int().min(10000).optional(),
  subscriptionStatus: z.enum(['aktif', 'pasif', 'deneme', 'iptal']).optional(),
  plan: z.enum(['temel', 'profesyonel', 'kurumsal']).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const err = requireSuperAdmin(session);
  if (err) return err;

  const org = await prisma.organization.findUnique({
    where: { id: params.id },
    include: {
      subscription: true,
      bkdsCredential: { select: { username: true, cityId: true, districtId: true, remId: true, pollInterval: true } },
      _count: { select: { users: true, students: true, staff: true } },
    },
  });

  if (!org) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });
  return NextResponse.json(org);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const err = requireSuperAdmin(session);
  if (err) return err;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const {
    name, active,
    bkdsUsername, bkdsPassword, bkdsCityId, bkdsDistrictId, bkdsRemId, pollInterval,
    subscriptionStatus, plan,
  } = parsed.data;

  // Kurum bilgilerini güncelle
  if (name !== undefined || active !== undefined) {
    await prisma.organization.update({
      where: { id: params.id },
      data: { ...(name ? { name } : {}), ...(active !== undefined ? { active } : {}) },
    });
  }

  // BKDS kimlik bilgilerini güncelle
  if (bkdsUsername || bkdsPassword || bkdsCityId || bkdsDistrictId || bkdsRemId || pollInterval) {
    await prisma.bkdsCredential.upsert({
      where: { organizationId: params.id },
      create: {
        organizationId: params.id,
        username: bkdsUsername ?? '',
        password: bkdsPassword ?? '',
        cityId: bkdsCityId ?? '',
        districtId: bkdsDistrictId ?? '',
        remId: bkdsRemId ?? '',
        pollInterval: pollInterval ?? 60000,
      },
      update: {
        ...(bkdsUsername ? { username: bkdsUsername } : {}),
        ...(bkdsPassword ? { password: bkdsPassword } : {}),
        ...(bkdsCityId ? { cityId: bkdsCityId } : {}),
        ...(bkdsDistrictId ? { districtId: bkdsDistrictId } : {}),
        ...(bkdsRemId ? { remId: bkdsRemId } : {}),
        ...(pollInterval ? { pollInterval } : {}),
      },
    });
  }

  // Abonelik güncelle
  if (subscriptionStatus || plan) {
    await prisma.subscription.upsert({
      where: { organizationId: params.id },
      create: {
        organizationId: params.id,
        status: subscriptionStatus ?? 'deneme',
        plan: plan ?? 'temel',
      },
      update: {
        ...(subscriptionStatus ? { status: subscriptionStatus } : {}),
        ...(plan ? { plan } : {}),
      },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const err = requireSuperAdmin(session);
  if (err) return err;

  // Soft delete — aktif=false yap
  await prisma.organization.update({
    where: { id: params.id },
    data: { active: false },
  });

  return NextResponse.json({ success: true });
}
