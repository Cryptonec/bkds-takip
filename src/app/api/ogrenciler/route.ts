import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import { z } from 'zod';

const studentSchema = z.object({
  adSoyad: z.string().min(2),
  ogrenciNo: z.string().optional(),
  tc: z.string().length(11).optional(),
  aktif: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = getOrgId(session);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const aktif = searchParams.get('aktif');

  const students = await prisma.student.findMany({
    where: {
      organizationId: orgId,
      ...(q ? { normalizedName: { contains: normalizeName(q) } } : {}),
      ...(aktif !== null ? { aktif: aktif === 'true' } : {}),
    },
    orderBy: { adSoyad: 'asc' },
  });

  return NextResponse.json(students);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = getOrgId(session);
  const body = await req.json();
  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const student = await prisma.student.create({
    data: {
      ...parsed.data,
      organizationId: orgId,
      normalizedName: normalizeName(parsed.data.adSoyad),
    },
  });

  return NextResponse.json(student, { status: 201 });
}
