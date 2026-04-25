import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import { z } from 'zod';

const staffSchema = z.object({
  adSoyad: z.string().min(2),
  aktif: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const aktif = searchParams.get('aktif');

  const staff = await prisma.staff.findMany({
    where: {
      organizationId: orgId,
      ...(q ? { normalizedName: { contains: normalizeName(q) } } : {}),
      ...(aktif !== null ? { aktif: aktif === 'true' } : {}),
    },
    orderBy: { adSoyad: 'asc' },
  });

  return NextResponse.json(staff);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const body = await req.json();
  const parsed = staffSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const normalized = normalizeName(parsed.data.adSoyad);

  // Aynı isimde pasif kayıt varsa onu reaktif et — yeni duplicate yaratma
  const existing = await prisma.staff.findFirst({
    where: { organizationId: orgId, normalizedName: normalized },
  });
  if (existing) {
    if (existing.aktif) {
      return NextResponse.json({ error: 'Aynı isimde personel zaten kayıtlı' }, { status: 409 });
    }
    const reactivated = await prisma.staff.update({
      where: { id: existing.id },
      data: { aktif: true, adSoyad: parsed.data.adSoyad },
    });
    return NextResponse.json(reactivated, { status: 200 });
  }

  const member = await prisma.staff.create({
    data: {
      ...parsed.data,
      organizationId: orgId,
      normalizedName: normalized,
    },
  });

  return NextResponse.json(member, { status: 201 });
}
