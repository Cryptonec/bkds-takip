/**
 * Admin API — Kurum yönetimi
 * Sadece superadmin rolü erişebilir.
 */

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

const createOrgSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Sadece küçük harf, rakam ve tire'),
  bkdsUsername: z.string().optional(),
  bkdsPassword: z.string().optional(),
  bkdsCityId: z.string().optional(),
  bkdsDistrictId: z.string().optional(),
  bkdsRemId: z.string().optional(),
  plan: z.enum(['temel', 'profesyonel', 'kurumsal']).optional().default('temel'),
  trialDays: z.number().int().min(0).optional().default(14),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireSuperAdmin(session);
  if (err) return err;

  const orgs = await prisma.organization.findMany({
    include: {
      subscription: { select: { status: true, plan: true, currentPeriodEnd: true } },
      _count: { select: { users: true, students: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(orgs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireSuperAdmin(session);
  if (err) return err;

  const body = await req.json();
  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const {
    name, slug,
    bkdsUsername, bkdsPassword, bkdsCityId, bkdsDistrictId, bkdsRemId,
    plan, trialDays,
  } = parsed.data;

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: 'Bu slug zaten kullanımda' }, { status: 409 });

  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      subscription: {
        create: {
          plan,
          status: 'deneme',
          trialEndsAt,
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEndsAt,
        },
      },
      ...(bkdsUsername && bkdsPassword && bkdsCityId && bkdsDistrictId && bkdsRemId
        ? {
            bkdsCredential: {
              create: {
                username: bkdsUsername,
                password: bkdsPassword,
                cityId: bkdsCityId,
                districtId: bkdsDistrictId,
                remId: bkdsRemId,
              },
            },
          }
        : {}),
    },
    include: { subscription: true, bkdsCredential: { select: { username: true } } },
  });

  return NextResponse.json(org, { status: 201 });
}
