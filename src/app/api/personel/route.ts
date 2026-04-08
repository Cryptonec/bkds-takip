import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  // ?q= ile personel (staff) arama — program yönetimi için
  if (q !== null) {
    const staff = await prisma.staff.findMany({
      where: {
        organizationId,
        adSoyad: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, adSoyad: true },
      orderBy: { adSoyad: 'asc' },
      take: 10,
    });
    return NextResponse.json(staff);
  }

  // Varsayılan: günlük BKDS log
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const logs = await prisma.bkdsPersonelLog.findMany({
    where: { tarih: dateOnly, organizationId },
    include: { staff: { select: { adSoyad: true } } },
    orderBy: { ilkGiris: 'asc' },
  });

  return NextResponse.json(logs);
}

