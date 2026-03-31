import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bkdsProviderService } from '@/lib/services/bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from '@/lib/services/attendanceService';
import { generateAlerts } from '@/lib/services/alertService';

// Manuel veya otomatik BKDS yenileme
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const tarih = new Date();

  try {
    const records = await bkdsProviderService.fetchToday();
    await bkdsProviderService.saveAndAggregate(records, tarih);
    await recalculateAttendance(tarih);
    await recalculateStaffAttendance(tarih);
    await generateAlerts(tarih);

    return NextResponse.json({
      success: true,
      recordCount: records.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[BKDS API]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Son BKDS durumu
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const { prisma } = await import('@/lib/prisma');

  const [raw, aggregates] = await Promise.all([
    prisma.bkdsRaw.findMany({
      where: { tarih: dateOnly },
      orderBy: { girisZamani: 'asc' },
    }),
    prisma.bkdsAggregate.findMany({
      where: { tarih: dateOnly },
      include: { student: { select: { id: true, adSoyad: true } } },
      orderBy: { adSoyad: 'asc' },
    }),
  ]);

  return NextResponse.json({ raw, aggregates, fetchedAt: new Date().toISOString() });
}
