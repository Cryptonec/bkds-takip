import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recalculateAttendance } from '@/lib/services/attendanceService';
import { normalizeName } from '@/lib/utils/normalize';
import { z } from 'zod';

const createSchema = z.object({
  studentId: z.string().min(1),
  staffId: z.string().nullable().optional(),
  tarih: z.string().min(1),
  baslangic: z.string().min(1),
  bitis: z.string().min(1),
  derslik: z.string().optional().default('Belirtilmemiş'),
  bkdsRequired: z.boolean().optional().default(true),
});

/** 'Belirtilmemiş Personel' kaydını bul veya oluştur — staff atanmamış dersler için */
async function getOrCreateDefaultStaff(orgId: string) {
  const ad = 'Belirtilmemiş Personel';
  const norm = normalizeName(ad);
  let staff = await prisma.staff.findFirst({ where: { organizationId: orgId, normalizedName: norm } });
  if (!staff) {
    staff = await prisma.staff.create({
      data: { organizationId: orgId, adSoyad: ad, normalizedName: norm },
    });
  }
  return staff;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { studentId, staffId, tarih, baslangic, bitis, derslik, bkdsRequired } = parsed.data;

  const student = await prisma.student.findFirst({ where: { id: studentId, organizationId: orgId } });
  if (!student) return NextResponse.json({ error: 'Öğrenci bulunamadı' }, { status: 404 });

  let staff;
  if (staffId) {
    staff = await prisma.staff.findFirst({ where: { id: staffId, organizationId: orgId } });
    if (!staff) return NextResponse.json({ error: 'Personel bulunamadı' }, { status: 404 });
  } else {
    staff = await getOrCreateDefaultStaff(orgId);
  }

  const effectiveDerslik = derslik && derslik.trim() ? derslik : 'Belirtilmemiş';

  const dateOnly = new Date(tarih);
  dateOnly.setHours(0, 0, 0, 0);
  const baslangicDt = new Date(baslangic);
  const bitisDt = new Date(bitis);

  if (isNaN(baslangicDt.getTime()) || isNaN(bitisDt.getTime())) {
    return NextResponse.json({ error: 'Geçersiz tarih formatı' }, { status: 400 });
  }
  if (baslangicDt >= bitisDt) {
    return NextResponse.json({ error: 'Başlangıç saati bitişten önce olmalı' }, { status: 400 });
  }

  const lesson = await prisma.lessonSession.create({
    data: {
      organizationId: orgId,
      studentId,
      staffId: staff.id,
      tarih: dateOnly,
      baslangic: baslangicDt,
      bitis: bitisDt,
      derslik: effectiveDerslik,
      bkdsRequired,
    },
  });

  await recalculateAttendance(dateOnly, orgId, new Date());

  return NextResponse.json({ id: lesson.id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const { searchParams } = new URL(req.url);
  const tarihStr = searchParams.get('tarih');
  const tarih = tarihStr ? new Date(tarihStr) : new Date();
  tarih.setHours(0, 0, 0, 0);

  const lessons = await prisma.lessonSession.findMany({
    where: { organizationId: orgId, tarih },
    include: {
      student: { select: { id: true, adSoyad: true } },
      staff: { select: { id: true, adSoyad: true } },
    },
    orderBy: { baslangic: 'asc' },
  });

  return NextResponse.json(lessons);
}
