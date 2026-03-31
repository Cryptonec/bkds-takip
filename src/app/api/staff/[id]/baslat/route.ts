import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateStaffStatus } from '@/lib/services/staffAttendanceEngine';

// Personel ders başlatma
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const staffSession = await prisma.staffSession.update({
    where: { id: params.id },
    data: {
      basladiMi: true,
      baslamaZamani: new Date(),
    },
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
      staffSessionId: staffSession.id,
      staffId: staffSession.staffId,
      tarih: staffSession.tarih,
      status,
    },
    update: { status },
  });

  // Action log
  await prisma.actionLog.create({
    data: {
      userId: (session.user as any).id,
      action: 'staff_session_started',
      entity: 'StaffSession',
      entityId: staffSession.id,
    },
  });

  return NextResponse.json({ success: true, status });
}
