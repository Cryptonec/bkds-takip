/**
 * GET /api/setup/orgs?secret=<SSO_SECRET>
 * Mevcut organizasyonları listele (setup/debug amaçlı)
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const SSO_SECRET = process.env.SSO_SECRET ?? '';

export async function GET(req: NextRequest) {
  if (!SSO_SECRET) {
    return NextResponse.json({ error: 'SSO_SECRET yapılandırılmamış' }, { status: 500 });
  }

  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== SSO_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      active: true,
      users: { select: { email: true, role: true, active: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(orgs);
}
