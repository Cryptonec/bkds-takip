import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = (session.user as any).organizationId as string;
  if (!organizationId) return NextResponse.json({ error: 'Kurum yok' }, { status: 403 });

  const cred = await prisma.bkdsCredential.findUnique({ where: { organizationId } });
  return NextResponse.json({
    username:   cred?.username   ?? '',
    cityId:     cred?.cityId     ?? '',
    districtId: cred?.districtId ?? '',
    remId:      cred?.remId      ?? '',
    configured: !!cred?.username,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = (session.user as any).organizationId as string;
  if (!organizationId) return NextResponse.json({ error: 'Kurum yok' }, { status: 403 });

  const { username, password, cityId = '', districtId = '', remId = '' } = await req.json();
  if (!username) return NextResponse.json({ error: 'Kullanıcı adı zorunlu' }, { status: 400 });

  const data: any = { username, cityId, districtId, remId };
  if (password) data.password = password;

  const cred = await prisma.bkdsCredential.upsert({
    where:  { organizationId },
    create: { organizationId, password: password ?? '', ...data },
    update: data,
  });
  return NextResponse.json({ ok: true, username: cred.username });
}
