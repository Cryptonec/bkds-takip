import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const { maskedAd, staffId, yeniAdSoyad } = await req.json();

  if (!maskedAd || !staffId) {
    return NextResponse.json({ error: 'maskedAd ve staffId gerekli' }, { status: 400 });
  }

  // Personelin bu kuruma ait olduğunu doğrula
  const staffMember = await prisma.staff.findFirst({ where: { id: staffId, organizationId: orgId } });
  if (!staffMember) return NextResponse.json({ error: 'Personel bulunamadı' }, { status: 404 });

  if (yeniAdSoyad) {
    await prisma.staff.update({
      where: { id: staffId },
      data: {
        adSoyad: yeniAdSoyad.trim().toUpperCase(),
        normalizedName: normalizeName(yeniAdSoyad),
      },
    });
  }

  await prisma.bkdsPersonelLog.updateMany({
    where: { organizationId: orgId, maskedAd, staffId: null },
    data: { staffId, eslesmeDurumu: 'manuel_eslesme' },
  });

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const { searchParams } = new URL(req.url);
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const [logs, allStaff] = await Promise.all([
    prisma.bkdsPersonelLog.findMany({
      where: { organizationId: orgId, tarih: dateOnly, eslesmeDurumu: { not: 'tam_eslesme' } },
      include: { staff: { select: { id: true, adSoyad: true } } },
      orderBy: { ilkGiris: 'asc' },
    }),
    prisma.staff.findMany({
      where: { organizationId: orgId, aktif: true },
      select: { id: true, adSoyad: true, normalizedName: true },
      orderBy: { adSoyad: 'asc' },
    }),
  ]);

  return NextResponse.json({ logs, allStaff });
}
