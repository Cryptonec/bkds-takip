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
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  try {
  // En son import job'u bul (attendance route ile aynı mantık)
  const latestJob = await prisma.importJob.findFirst({
    where: {
      organizationId,
      status: 'tamamlandi',
      lessonSessions: { some: { tarih: dateOnly } },
    },
    orderBy: { completedAt: 'desc' },
  });
  const importJobId = latestJob?.id;
  const importFilter = importJobId ? { lessonSession: { importJobId } } : {};

  const [lessons, attendances, staffAttendances, alerts] = await Promise.all([
    importJobId
      ? prisma.lessonSession.count({ where: { tarih: dateOnly, organizationId, importJobId } })
      : prisma.lessonSession.count({ where: { tarih: dateOnly, organizationId } }),
    prisma.attendance.findMany({
      where: { tarih: dateOnly, organizationId, ...importFilter },
      select: { status: true },
    }),
    prisma.staffAttendance.findMany({
      where: { tarih: dateOnly, organizationId },
      select: { status: true },
    }),
    prisma.alert.count({
      where: { tarih: dateOnly, resolved: false, organizationId },
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
  } catch (err: any) {
    console.error('Dashboard API hatası:', err);
    return NextResponse.json({ error: err.message ?? 'Sunucu hatası' }, { status: 500 });
  }
}
