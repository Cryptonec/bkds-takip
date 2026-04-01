import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateStaffStatus } from '@/lib/services/staffAttendanceEngine';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);

  // Oturumun bu kuruma ait olduğunu doğrula
  const existing = await prisma.staffSession.findFirst({
    where: { id: params.id, organizationId: orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 404 });

  const staffSession = await prisma.staffSession.update({
    where: { id: params.id },
    data: { basladiMi: true, baslamaZamani: new Date() },
  });

  const status = calculateStaffStatus({
    session: {
      baslangic: staffSession.baslangic,
      bitis: staffSession.bitis,
      basladiMi: staffSession.basladiMi,
      baslamaZamani: staffSession.baslamaZamani,
    },
  });

  await prisma.staffAttendance.upsert({
    where: { staffSessionId: staffSession.id },
    create: {
      organizationId: orgId,
      staffSessionId: staffSession.id,
      staffId: staffSession.staffId,
      tarih: staffSession.tarih,
      status,
    },
    update: { status },
  });

  await prisma.actionLog.create({
    data: {
      organizationId: orgId,
      userId: (session.user as any).id,
      action: 'staff_session_started',
      entity: 'StaffSession',
      entityId: staffSession.id,
    },
  });

  return NextResponse.json({ success: true, status });
}
