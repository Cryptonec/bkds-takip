import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Bugünün BKDS girişlerinden, hiçbir Staff kaydıyla eşleşmemiş maskeli
 * isimleri döner. /personel sayfasında "tanımsız personel" bölümünde
 * gösterilir; kullanıcı buradan gerçek isim girerek Staff oluşturur.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logs = await prisma.bkdsPersonelLog.findMany({
    where: { organizationId: orgId, tarih: today, staffId: null },
    orderBy: { ilkGiris: 'asc' },
  });

  return NextResponse.json(
    logs.map(l => ({
      maskedAd: l.maskedAd,
      ilkGiris: l.ilkGiris,
      sonCikis: l.sonCikis,
      tahminEdilenAd: l.tahminEdilenAd,
    })),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
