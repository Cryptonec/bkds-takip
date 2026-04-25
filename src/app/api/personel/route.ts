import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName, matchMaskedName } from '@/lib/utils/normalize';
import { z } from 'zod';

/**
 * Yeni staff oluşturulduğunda bugünün eşleşmemiş bkdsPersonelLog
 * kayıtlarını yeniden tarar — masked isim bu staff'a uyuyorsa staffId set
 * eder. Böylece kullanıcı /personel'den maskeli giriş ekledikten sonra
 * canlı sayfasında hemen gerçek isim görünür (BKDS yeniden çekmeden).
 */
async function relinkTodayUnmatched(orgId: string, staffId: string, adSoyad: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const unmatched = await prisma.bkdsPersonelLog.findMany({
    where: { organizationId: orgId, tarih: today, staffId: null },
  });
  const matchingIds: string[] = [];
  for (const log of unmatched) {
    if (matchMaskedName(log.maskedAd, adSoyad)) {
      matchingIds.push(log.id);
    }
  }
  if (matchingIds.length > 0) {
    await prisma.bkdsPersonelLog.updateMany({
      where: { id: { in: matchingIds } },
      data: { staffId, eslesmeDurumu: 'tam_eslesme' },
    });
  }
  return matchingIds.length;
}

const staffSchema = z.object({
  adSoyad: z.string().min(2),
  aktif: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const aktif = searchParams.get('aktif');

  const staff = await prisma.staff.findMany({
    where: {
      organizationId: orgId,
      ...(q ? { normalizedName: { contains: normalizeName(q) } } : {}),
      ...(aktif !== null ? { aktif: aktif === 'true' } : {}),
    },
    orderBy: { adSoyad: 'asc' },
  });

  return NextResponse.json(staff);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const body = await req.json();
  const parsed = staffSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const normalized = normalizeName(parsed.data.adSoyad);

  // Aynı isimde pasif kayıt varsa onu reaktif et — yeni duplicate yaratma
  const existing = await prisma.staff.findFirst({
    where: { organizationId: orgId, normalizedName: normalized },
  });
  if (existing) {
    if (existing.aktif) {
      return NextResponse.json({ error: 'Aynı isimde personel zaten kayıtlı' }, { status: 409 });
    }
    const reactivated = await prisma.staff.update({
      where: { id: existing.id },
      data: { aktif: true, adSoyad: parsed.data.adSoyad },
    });
    await relinkTodayUnmatched(orgId, reactivated.id, reactivated.adSoyad);
    return NextResponse.json(reactivated, { status: 200 });
  }

  const member = await prisma.staff.create({
    data: {
      ...parsed.data,
      organizationId: orgId,
      normalizedName: normalized,
    },
  });

  await relinkTodayUnmatched(orgId, member.id, member.adSoyad);

  return NextResponse.json(member, { status: 201 });
}
