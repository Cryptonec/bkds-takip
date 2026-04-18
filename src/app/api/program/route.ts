import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeDerslik, parseTarihSaat, normalizeName } from '@/lib/utils/normalize';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
    const organizationId = (session.user as any).organizationId as string | undefined;
    if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tarihStr = searchParams.get('tarih');
    const dateOnly = tarihStr ? new Date(tarihStr) : new Date();
    dateOnly.setHours(0, 0, 0, 0);

    // En son tamamlanan import job'ı bul — eski importlardan gelen dersleri filtrele
    const latestJob = await prisma.importJob.findFirst({
      where: { organizationId, status: 'tamamlandi', lessonSessions: { some: { tarih: dateOnly } } },
      orderBy: { completedAt: 'desc' },
    });
    const importJobId = latestJob?.id;

    const lessons = await prisma.lessonSession.findMany({
      where: {
        tarih: dateOnly,
        organizationId,
        ...(importJobId ? { OR: [{ importJobId }, { importJobId: null }] } : {}),
      },
      include: {
        student:    { select: { id: true, adSoyad: true } },
        staff:      { select: { id: true, adSoyad: true } },
        attendance: { select: { status: true, gercekGiris: true, gercekCikis: true } },
      },
      orderBy: [{ baslangic: 'asc' }, { student: { adSoyad: 'asc' } }],
    });

    return NextResponse.json(lessons);
  } catch (err: any) {
    console.error('[/api/program GET]', err);
    return NextResponse.json({ error: err.message ?? 'Sunucu hatası' }, { status: 500 });
  }
}

/** Öğretmen yoksa otomatik "Belirtilmedi" staff oluştur */
async function getOrCreateDefaultStaff(organizationId: string) {
  const normalized = normalizeName('Belirtilmedi');
  const existing = await prisma.staff.findFirst({
    where: { organizationId, normalizedName: normalized },
  });
  if (existing) return existing;
  return prisma.staff.create({
    data: { organizationId, adSoyad: 'Belirtilmedi', normalizedName: normalized },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = (session.user as any).organizationId as string;

  const body = await req.json();
  const { studentId, staffId: rawStaffId, tarih, baslangicSaati, bitisSaati, derslik, bkdsRequired } = body;

  if (!studentId || !tarih || !baslangicSaati || !bitisSaati) {
    return NextResponse.json({ error: 'Eksik alan' }, { status: 400 });
  }

  // Öğretmen yoksa varsayılanı kullan
  const defaultStaff = rawStaffId ? null : await getOrCreateDefaultStaff(organizationId);
  const staffId = rawStaffId || defaultStaff!.id;
  const isDefaultStaff = !rawStaffId;

  const derslikStr = derslik || 'Salon';
  const { normalized: derslikNorm } = normalizeDerslik(derslikStr);
  const baslangic = parseTarihSaat(tarih, baslangicSaati);
  const bitis     = parseTarihSaat(tarih, bitisSaati);
  const dateOnly  = new Date(baslangic);
  dateOnly.setHours(0, 0, 0, 0);

  // Aynı ders var mı?
  const existing = await prisma.lessonSession.findFirst({
    where: { studentId, baslangic, organizationId },
  });
  if (existing) return NextResponse.json({ error: 'Bu öğrenci bu saatte zaten kayıtlı' }, { status: 409 });

  const lesson = await prisma.lessonSession.create({
    data: { organizationId, studentId, staffId, tarih: dateOnly, baslangic, bitis, derslik: derslikNorm, bkdsRequired: bkdsRequired ?? true },
    include: {
      student: { select: { id: true, adSoyad: true } },
      staff:   { select: { id: true, adSoyad: true } },
    },
  });

  await prisma.attendance.upsert({
    where: { lessonSessionId: lesson.id },
    create: { organizationId, lessonSessionId: lesson.id, studentId, tarih: dateOnly, status: 'bekleniyor' },
    update: {},
  });

  // StaffSession — sadece gerçek öğretmen seçilmişse
  if (!isDefaultStaff) {
    const existingStaff = await prisma.staffSession.findFirst({
      where: { staffId, baslangic, bitis, organizationId },
    });
    if (!existingStaff) {
      const ss = await prisma.staffSession.create({
        data: { organizationId, staffId, tarih: dateOnly, baslangic, bitis, derslik: derslikNorm },
      });
      await prisma.staffAttendance.upsert({
        where: { staffSessionId: ss.id },
        create: { organizationId, staffSessionId: ss.id, staffId, tarih: dateOnly, status: 'bekleniyor' },
        update: {},
      });
    }
  }

  return NextResponse.json(lesson, { status: 201 });
}
