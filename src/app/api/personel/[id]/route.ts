import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import { z } from 'zod';

const patchSchema = z.object({
  adSoyad: z.string().min(2).optional(),
  aktif: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });

  const existing = await prisma.staff.findFirst({
    where: { id: params.id, organizationId: orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Personel bulunamadı' }, { status: 404 });

  const data: any = {};
  if (parsed.data.adSoyad !== undefined) {
    data.adSoyad = parsed.data.adSoyad;
    data.normalizedName = normalizeName(parsed.data.adSoyad);
  }
  if (parsed.data.aktif !== undefined) data.aktif = parsed.data.aktif;

  const updated = await prisma.staff.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}

/**
 * Soft-delete: aktif=false.
 * Hard-delete edilemiyor çünkü Staff'a bağlı LessonSession/StaffSession/
 * StaffAttendance/BkdsPersonelLog kayıtları olabilir (geçmiş veri).
 * Pasif yapıldığında listeden kaybolur, geçmiş veriler korunur.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const existing = await prisma.staff.findFirst({
    where: { id: params.id, organizationId: orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Personel bulunamadı' }, { status: 404 });

  await prisma.staff.update({
    where: { id: params.id },
    data: { aktif: false },
  });

  return NextResponse.json({ ok: true });
}
