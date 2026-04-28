import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import { z } from 'zod';

const patchSchema = z.object({
  adSoyad: z.string().min(2).optional(),
  ogrenciNo: z.string().optional().or(z.literal('')),
  tc: z.string().regex(/^\d{4,11}$/).optional().or(z.literal('')),
  aktif: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });

  const existing = await prisma.student.findFirst({
    where: { id: params.id, organizationId: orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Öğrenci bulunamadı' }, { status: 404 });

  const data: any = {};
  if (parsed.data.adSoyad !== undefined) {
    data.adSoyad = parsed.data.adSoyad;
    data.normalizedName = normalizeName(parsed.data.adSoyad);
  }
  if (parsed.data.ogrenciNo !== undefined) data.ogrenciNo = parsed.data.ogrenciNo || null;
  if (parsed.data.tc !== undefined) data.tc = parsed.data.tc || null;
  if (parsed.data.aktif !== undefined) data.aktif = parsed.data.aktif;

  const updated = await prisma.student.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json(updated);
}

/**
 * Soft-delete (aktif=false). Geçmiş ders/yoklama kayıtlarına FK
 * referanslari oldugu icin hard-delete yapamayiz.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const existing = await prisma.student.findFirst({
    where: { id: params.id, organizationId: orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Öğrenci bulunamadı' }, { status: 404 });

  await prisma.student.update({
    where: { id: params.id },
    data: { aktif: false },
  });
  return NextResponse.json({ ok: true });
}
