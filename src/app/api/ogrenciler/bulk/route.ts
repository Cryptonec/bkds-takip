import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const body = await req.json();
  const names: string[] = body.names ?? [];

  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ error: 'names dizisi boş' }, { status: 400 });
  }

  let created = 0;
  let updated = 0;

  for (const raw of names) {
    const adSoyad = raw.trim();
    if (!adSoyad) continue;
    const normalizedName = normalizeName(adSoyad);

    const existing = await prisma.student.findFirst({
      where: { normalizedName, organizationId },
    });

    if (existing) {
      await prisma.student.update({
        where: { id: existing.id },
        data: { adSoyad, aktif: true },
      });
      updated++;
    } else {
      await prisma.student.create({
        data: { organizationId, adSoyad, normalizedName, aktif: true },
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, created, updated });
}
