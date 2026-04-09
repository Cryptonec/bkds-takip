import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const { id } = params;

  const student = await prisma.student.findFirst({ where: { id, organizationId } });
  if (!student) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });

  // İlişkili kayıtları sil
  await prisma.attendance.deleteMany({ where: { studentId: id } });
  await prisma.lessonSession.deleteMany({ where: { studentId: id } });
  await prisma.bkdsAggregate.deleteMany({ where: { studentId: id } });
  await prisma.student.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
