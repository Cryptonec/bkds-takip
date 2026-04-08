/**
 * POST /api/ogrenciler/sync
 * Rehapp tarafından çağrılır. Öğrenci listesini upsert eder.
 *
 * Body: {
 *   secret: string,           // SSO_SECRET
 *   org_slug: string,
 *   students: Array<{
 *     name: string,           // Tam ad soyad
 *     studentNo?: string,     // Öğrenci numarası (opsiyonel)
 *   }>
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';

const SSO_SECRET = process.env.SSO_SECRET ?? '';

export async function POST(req: NextRequest) {
  if (!SSO_SECRET) {
    return NextResponse.json({ error: 'SSO yapılandırılmamış' }, { status: 500 });
  }

  let body: { secret?: string; org_slug?: string; students?: Array<{ name: string; studentNo?: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 });
  }

  const { secret, org_slug, students } = body;

  if (secret !== SSO_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  if (!org_slug) {
    return NextResponse.json({ error: 'org_slug zorunlu' }, { status: 400 });
  }

  if (!Array.isArray(students) || students.length === 0) {
    return NextResponse.json({ error: 'students dizisi boş veya eksik' }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({ where: { slug: org_slug } });
  if (!org || !org.active) {
    return NextResponse.json({ error: 'Kurum bulunamadı' }, { status: 404 });
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const s of students) {
    if (!s.name?.trim()) continue;
    const adSoyad = s.name.trim();
    const normalizedName = normalizeName(adSoyad);

    try {
      // ogrenciNo varsa ona göre upsert; yoksa normalizedName'e göre bul-veya-oluştur
      if (s.studentNo) {
        const existing = await prisma.student.findFirst({
          where: { ogrenciNo: s.studentNo, organizationId: org.id },
        });
        if (existing) {
          await prisma.student.update({
            where: { id: existing.id },
            data: { adSoyad, normalizedName, aktif: true },
          });
          updated++;
        } else {
          await prisma.student.create({
            data: { organizationId: org.id, adSoyad, normalizedName, ogrenciNo: s.studentNo, aktif: true },
          });
          created++;
        }
      } else {
        const existing = await prisma.student.findFirst({
          where: { normalizedName, organizationId: org.id },
        });
        if (existing) {
          await prisma.student.update({
            where: { id: existing.id },
            data: { adSoyad, aktif: true },
          });
          updated++;
        } else {
          await prisma.student.create({
            data: { organizationId: org.id, adSoyad, normalizedName, aktif: true },
          });
          created++;
        }
      }
    } catch (e: any) {
      errors.push(`${adSoyad}: ${e.message}`);
    }
  }

  return NextResponse.json({ ok: true, created, updated, errors });
}
