import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';

async function getOrgId(session: any): Promise<string | null> {
  return (session?.user as any)?.organizationId ?? null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = await getOrgId(session);
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const source = searchParams.get('source');

  // ?source=bkds → BKDS'de görünüp Staff tablosunda eşleşmemiş unique maskedAd'ler
  if (source === 'bkds') {
    const son30Gun = new Date();
    son30Gun.setDate(son30Gun.getDate() - 30);

    const unmatched = await prisma.bkdsPersonelLog.findMany({
      where: {
        organizationId,
        staffId: null,
        tarih: { gte: son30Gun },
      },
      select: { maskedAd: true, tahminEdilenAd: true },
      distinct: ['maskedAd'],
      orderBy: { maskedAd: 'asc' },
    });

    return NextResponse.json(unmatched);
  }

  // ?q= → Staff arama (program yönetimi için autocomplete)
  if (q !== null) {
    const staff = await prisma.staff.findMany({
      where: {
        organizationId,
        ...(q ? { adSoyad: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: { id: true, adSoyad: true, aktif: true, normalizedName: true },
      orderBy: { adSoyad: 'asc' },
      take: q ? 10 : undefined,
    });
    return NextResponse.json(staff);
  }

  // Varsayılan: tüm Staff listesi
  const staff = await prisma.staff.findMany({
    where: { organizationId },
    select: { id: true, adSoyad: true, aktif: true, normalizedName: true },
    orderBy: { adSoyad: 'asc' },
  });
  return NextResponse.json(staff);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = await getOrgId(session);
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const body = await req.json();

  // action=sync → BKDS'de eşleşmemiş personeli toplu Staff'a ekle
  if (body.action === 'sync') {
    const son30Gun = new Date();
    son30Gun.setDate(son30Gun.getDate() - 30);

    const unmatched = await prisma.bkdsPersonelLog.findMany({
      where: { organizationId, staffId: null, tarih: { gte: son30Gun } },
      select: { maskedAd: true, tahminEdilenAd: true },
      distinct: ['maskedAd'],
    });

    let eklendi = 0;
    for (const u of unmatched) {
      const adSoyad = (u.tahminEdilenAd ?? u.maskedAd).toLocaleUpperCase('tr-TR');
      const normalizedName = normalizeName(adSoyad);

      const exists = await prisma.staff.findFirst({
        where: { organizationId, normalizedName },
      });
      if (exists) continue;

      const staff = await prisma.staff.create({
        data: { organizationId, adSoyad, normalizedName, aktif: true },
      });

      // Bu maskedAd ile tüm logları güncelle
      await prisma.bkdsPersonelLog.updateMany({
        where: { organizationId, maskedAd: u.maskedAd, staffId: null },
        data: { staffId: staff.id, eslesmeDurumu: 'otomatik_eklendi' },
      });

      eklendi++;
    }

    return NextResponse.json({ eklendi });
  }

  // Normal: tek personel ekle
  const adSoyad = (body.adSoyad as string | undefined)?.trim();
  if (!adSoyad) return NextResponse.json({ error: 'adSoyad gerekli' }, { status: 400 });

  const normalizedName = normalizeName(adSoyad);
  const exists = await prisma.staff.findFirst({ where: { organizationId, normalizedName } });
  if (exists) return NextResponse.json({ error: 'Bu personel zaten kayıtlı' }, { status: 409 });

  const staff = await prisma.staff.create({
    data: { organizationId, adSoyad, normalizedName, aktif: true },
  });
  return NextResponse.json(staff, { status: 201 });
}
