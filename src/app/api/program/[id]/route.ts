import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = (session.user as any).organizationId as string;

  const lesson = await prisma.lessonSession.findFirst({
    where: { id: params.id, organizationId },
  });
  if (!lesson) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });

  // Attendance sil
  await prisma.attendance.deleteMany({ where: { lessonSessionId: params.id } });
  // LessonSession sil
  await prisma.lessonSession.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = (session.user as any).organizationId as string;

  const lesson = await prisma.lessonSession.findFirst({
    where: { id: params.id, organizationId },
  });
  if (!lesson) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.lessonSession.update({
    where: { id: params.id },
    data: {
      ...(body.derslik    !== undefined ? { derslik: body.derslik } : {}),
      ...(body.bkdsRequired !== undefined ? { bkdsRequired: body.bkdsRequired } : {}),
    },
    include: { student: { select: { id: true, adSoyad: true } }, staff: { select: { id: true, adSoyad: true } } },
  });

  return NextResponse.json(updated);
}
