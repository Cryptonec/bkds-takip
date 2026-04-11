import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';

async function getOrgId(session: any): Promise<string | null> {
  return (session?.user as any)?.organizationId ?? null;
}

// PATCH /api/personel/[id] — adSoyad ve/veya aktif güncelle
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = await getOrgId(session);
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const existing = await prisma.staff.findFirst({
    where: { id: params.id, organizationId },
  });
  if (!existing) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });

  const body = await req.json();
  const data: Record<string, any> = {};

  if (typeof body.adSoyad === 'string') {
    const adSoyad = body.adSoyad.trim();
    if (!adSoyad) return NextResponse.json({ error: 'Ad boş olamaz' }, { status: 400 });
    data.adSoyad = adSoyad;
    data.normalizedName = normalizeName(adSoyad);
  }
  if (typeof body.aktif === 'boolean') {
    data.aktif = body.aktif;
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 });

  const updated = await prisma.staff.update({
    where: { id: params.id },
    data,
    select: { id: true, adSoyad: true, aktif: true, normalizedName: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/personel/[id] — personeli sil
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = await getOrgId(session);
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const existing = await prisma.staff.findFirst({
    where: { id: params.id, organizationId },
  });
  if (!existing) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });

  // İlişkili kayıtları temizle
  await prisma.bkdsPersonelLog.updateMany({
    where: { staffId: params.id },
    data: { staffId: null, eslesmeDurumu: 'eslesmedi' },
  });

  await prisma.staff.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
