/**
 * POST /api/ogrenciler/import
 * Rehapp'tan indirilen öğrenci listesi XLS/HTML dosyasını okur.
 * Lila ile aynı HTML-tablo parse yaklaşımı kullanılır.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';

/** HTML entity + tag temizleme */
function cleanCell(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normH(s: string): string {
  return s.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

const JUNK_EXACT = new Set([
  'sira', 'no', 'sira no', 'tc', 'tc no', 'tc kimlik', 'adi', 'soyadi', 'ad',
  'soyad', 'adi soyadi', 'ad soyad', 'ogrenci listesi', 'ogrenci bilgileri',
  'ogrenciler', 'isim', 'sinif', 'tarih', 'aciklama', 'ogrenci no',
]);
const JUNK_WORDS = [
  'rehberlik', 'arastirma', 'merkezi', 'mudurlugu', 'ilkokul',
  'ortaokul', 'lisesi', 'universitesi', 'hizmetleri',
];

function isJunk(name: string): boolean {
  if (!name || name.length < 2) return true;
  if (/^\d+$/.test(name)) return true;
  const n = normH(name);
  return JUNK_EXACT.has(n) || JUNK_WORDS.some(w => n.includes(w));
}

/** HTML tablo içeriğinden satır dizisini çıkar */
function parseHtmlRows(content: string): string[][] {
  const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  return rowMatches.map(rowHtml =>
    (rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map(cleanCell)
  );
}

/** Başlık satırını bul, ADI ve SOYADI sütun indekslerini döndür */
function detectColumns(rows: string[][]): {
  headerIdx: number;
  adiIdx: number;
  soyadiIdx: number;
  fullIdx: number;
} {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const normed = rows[i].map(normH);
    const ai = normed.findIndex(h => h === 'adi' || h === 'ad');
    const si = normed.findIndex(h => h === 'soyadi' || h === 'soyad');
    const fi = normed.findIndex(h =>
      h === 'adi soyadi' || h === 'ad soyad' || h === 'adsoyad' ||
      h.includes('ogrenci adi') || h === 'isim'
    );
    if (ai !== -1 || si !== -1 || fi !== -1) {
      return { headerIdx: i, adiIdx: ai, soyadiIdx: si, fullIdx: fi };
    }
  }
  // Başlık bulunamadı
  return { headerIdx: -1, adiIdx: -1, soyadiIdx: -1, fullIdx: -1 };
}

function extractNames(rows: string[][]): string[] {
  const { headerIdx, adiIdx, soyadiIdx, fullIdx } = detectColumns(rows);
  const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows;
  const names: string[] = [];

  for (const cells of dataRows) {
    let name = '';

    if (adiIdx !== -1 && soyadiIdx !== -1) {
      name = `${cells[adiIdx] ?? ''} ${cells[soyadiIdx] ?? ''}`.trim();
    } else if (fullIdx !== -1) {
      name = cells[fullIdx] ?? '';
    } else {
      // Fallback: ilk sütun sıra no ise D+E (3+4), yoksa B+C (1+2)
      const col0 = cells[0] ?? '';
      if (/^\d+$/.test(col0) && cells.length >= 5) {
        name = `${cells[3] ?? ''} ${cells[4] ?? ''}`.trim();
      } else if (/^\d+$/.test(col0) && cells.length >= 3) {
        name = `${cells[1] ?? ''} ${cells[2] ?? ''}`.trim();
      } else {
        name = col0;
      }
    }

    if (!isJunk(name)) names.push(name);
  }

  return names;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = buffer.toString('utf-8');

  // HTML tablosu mu yoksa gerçek Excel mi?
  let rows: string[][];
  if (/<tr[\s>]/i.test(content)) {
    rows = parseHtmlRows(content);
  } else {
    // Gerçek Excel: XLSX ile oku
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    rows = raw.map(r => r.map(c => String(c ?? '').trim()));
  }

  const names = extractNames(rows);
  if (names.length === 0) {
    return NextResponse.json({ error: 'Dosyada öğrenci adı bulunamadı. "Adı" ve "Soyadı" sütunları olduğundan emin olun.' }, { status: 422 });
  }

  // Mevcut öğrencileri önbellekle
  const existing = await prisma.student.findMany({
    where: { organizationId },
    select: { id: true, normalizedName: true },
  });
  const cache = new Map(existing.map(s => [s.normalizedName, s.id]));

  let created = 0;
  let updated = 0;

  for (const name of names) {
    const adSoyad = name.trim();
    const normalizedName = normalizeName(adSoyad);
    const existingId = cache.get(normalizedName);

    if (existingId) {
      await prisma.student.update({ where: { id: existingId }, data: { adSoyad, aktif: true } });
      updated++;
    } else {
      const s = await prisma.student.create({
        data: { organizationId, adSoyad, normalizedName, aktif: true },
      });
      cache.set(normalizedName, s.id);
      created++;
    }
  }

  // Otomatik dedup
  const allStudents = await prisma.student.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  });
  const groups = new Map<string, typeof allStudents>();
  for (const s of allStudents) {
    const g = groups.get(s.normalizedName) ?? [];
    g.push(s);
    groups.set(s.normalizedName, g);
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

  return NextResponse.json({ ok: true, total: names.length, created, updated, deletedDups });
}
