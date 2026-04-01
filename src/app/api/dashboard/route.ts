import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  let orgId: string;
  try {
    orgId = await getOrgId(session);
  } catch {
    return NextResponse.json({ error: 'DB migration gerekli: npm run db:push && npm run db:seed' }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const [lessons, attendances, staffAttendances, alerts] = await Promise.all([
    prisma.lessonSession.count({ where: { organizationId: orgId, tarih: dateOnly } }),
    prisma.attendance.findMany({
      where: { organizationId: orgId, tarih: dateOnly },
      select: { status: true },
    }),
    prisma.staffAttendance.findMany({
      where: { organizationId: orgId, tarih: dateOnly },
      select: { status: true },
    }),
    prisma.alert.count({
      where: { organizationId: orgId, tarih: dateOnly, resolved: false },
    }),
  ]);

  const statusCount = (s: string) => attendances.filter((a) => a.status === s).length;
  const staffCount = (s: string) => staffAttendances.filter((a) => a.status === s).length;

  return NextResponse.json({
    tarih: dateOnly.toISOString(),
    toplamDers: lessons,
    bkdsGerekli: attendances.filter((a) => a.status !== 'bkds_muaf').length,
    bkdsMuaf: statusCount('bkds_muaf'),
    bekleniyor: statusCount('bekleniyor'),
    gecikiyor: statusCount('gecikiyor'),
    girisEksik: statusCount('giris_eksik') + statusCount('kritik'),
    cikisEksik: statusCount('cikis_eksik'),
    gecGeldi: statusCount('gec_geldi'),
    tamamlandi: statusCount('tamamlandi'),
    personelDerste: staffCount('derste'),
    personelGeciyor: staffCount('gecikiyor') + staffCount('gec_basladi'),
    personelGelmedi: staffCount('gelmedi'),
    aktifAlert: alerts,
  });
}
