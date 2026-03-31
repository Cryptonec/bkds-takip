import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';

// Personel maskeli isim → gerçek personel eşleştirme
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const { maskedAd, staffId, yeniAdSoyad } = await req.json();

  if (!maskedAd || !staffId) {
    return NextResponse.json({ error: 'maskedAd ve staffId gerekli' }, { status: 400 });
  }

  // Eğer yeni ad verilmişse staff kaydını güncelle (soyadı değişikliği)
  if (yeniAdSoyad) {
    await prisma.staff.update({
      where: { id: staffId },
      data: {
        adSoyad: yeniAdSoyad.trim().toUpperCase(),
        normalizedName: normalizeName(yeniAdSoyad),
      },
    });
  }

  // BkdsPersonelLog'daki eşleşmeleri güncelle
  await prisma.bkdsPersonelLog.updateMany({
    where: { maskedAd, staffId: null },
    data: { staffId, eslesmeDurumu: 'manuel_eslesme' },
  });

  return NextResponse.json({ success: true });
}

// Bugün eşleşmeyen personel listesi
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const logs = await prisma.bkdsPersonelLog.findMany({
    where: { tarih: dateOnly, eslesmeDurumu: { not: 'tam_eslesme' } },
    include: { staff: { select: { id: true, adSoyad: true } } },
    orderBy: { ilkGiris: 'asc' },
  });

  const allStaff = await prisma.staff.findMany({
    where: { aktif: true },
    select: { id: true, adSoyad: true, normalizedName: true },
    orderBy: { adSoyad: 'asc' },
  });

  return NextResponse.json({ logs, allStaff });
}
