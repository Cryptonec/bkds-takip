/**
 * PATCH /api/superadmin/organizations/[id]  — aktif/pasif değiştir, isim güncelle
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function requireSuperadmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'superadmin') return null;
  return session;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireSuperadmin())) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  let body: { active?: boolean; name?: string; plan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }

  const org = await prisma.organization.update({
    where: { id: params.id },
    data: {
      ...(body.active !== undefined && { active: body.active }),
      ...(body.name && { name: body.name }),
      ...(body.plan && { plan: body.plan as any }),
    },
  });

  return NextResponse.json(org);
}
