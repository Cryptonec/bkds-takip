import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const body = await req.json();
  const names: string[] = body.names ?? [];

  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ error: 'names dizisi boş' }, { status: 400 });
  }

  // Mevcut öğrencileri önbelleğe al
  const existing = await prisma.student.findMany({
    where: { organizationId },
    select: { id: true, normalizedName: true },
  });
  const cache = new Map(existing.map(s => [s.normalizedName, s.id]));

  let created = 0;
  let updated = 0;

  for (const raw of names) {
    const adSoyad = raw.trim();
    if (!adSoyad) continue;
    const normalizedName = normalizeName(adSoyad);

    const existingId = cache.get(normalizedName);
    if (existingId) {
      await prisma.student.update({
        where: { id: existingId },
        data: { adSoyad, aktif: true },
      });
      updated++;
    } else {
      const s = await prisma.student.create({
        data: { organizationId, adSoyad, normalizedName, aktif: true },
      });
      cache.set(normalizedName, s.id);
      created++;
    }
  }

  // Import sonrası otomatik dedup
  const dedupResult = await deduplicateStudents(organizationId);

  return NextResponse.json({ ok: true, created, updated, ...dedupResult });
}

/** Aynı normalizedName'e sahip yinelenen kayıtları temizler */
async function deduplicateStudents(organizationId: string) {
  const all = await prisma.student.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<string, typeof all>();
  for (const s of all) {
    const list = groups.get(s.normalizedName) ?? [];
    list.push(s);
    groups.set(s.normalizedName, list);
  }

  let deletedDups = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const [keep, ...dupes] = group;
    for (const dupe of dupes) {
      await prisma.lessonSession.updateMany({ where: { studentId: dupe.id }, data: { studentId: keep.id } });
      await prisma.attendance.updateMany({ where: { studentId: dupe.id }, data: { studentId: keep.id } });
      await prisma.bkdsAggregate.deleteMany({ where: { studentId: dupe.id } });
      await prisma.student.delete({ where: { id: dupe.id } });
      deletedDups++;
    }
  }

  return { deletedDups };
}
