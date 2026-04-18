import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const lesson = await prisma.lessonSession.findFirst({
    where: { id: params.id, organizationId: orgId },
  });
  if (!lesson) return NextResponse.json({ error: 'Ders bulunamadı' }, { status: 404 });

  await prisma.attendance.deleteMany({ where: { lessonSessionId: params.id } });
  await prisma.lessonSession.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
