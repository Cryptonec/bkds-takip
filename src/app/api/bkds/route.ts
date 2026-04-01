import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { getBkdsService } from '@/lib/services/bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from '@/lib/services/attendanceService';
import { generateAlerts } from '@/lib/services/alertService';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const tarih = new Date();

  try {
    const service = getBkdsService(orgId);
    const records = await service.fetchToday();
    await service.saveAndAggregate(records, tarih);
    await recalculateAttendance(tarih, orgId);
    await recalculateStaffAttendance(tarih, orgId);
    await generateAlerts(tarih, orgId);

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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const { searchParams } = new URL(req.url);
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);

  const [raw, aggregates] = await Promise.all([
    prisma.bkdsRaw.findMany({
      where: { organizationId: orgId, tarih: dateOnly },
      orderBy: { girisZamani: 'asc' },
    }),
    prisma.bkdsAggregate.findMany({
      where: { organizationId: orgId, tarih: dateOnly },
      include: { student: { select: { id: true, adSoyad: true } } },
      orderBy: { adSoyad: 'asc' },
    }),
  ]);

  return NextResponse.json({ raw, aggregates, fetchedAt: new Date().toISOString() });
}
