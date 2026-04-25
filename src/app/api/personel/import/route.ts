import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import { parseStudentNamesFromSheet } from '@/lib/utils/parseStudentNames';
import * as XLSX from 'xlsx';

/**
 * Personel toplu Excel/CSV/HTML yükleme — öğrenci import'unun aynısı.
 * BRY personel listesi, Lila yoklama, ya da basit isim listesi destekler.
 *
 * Aynı parser kullanılır: parseStudentNamesFromSheet — student/staff fark
 * etmez, sadece "isim listesi çıkar".
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let isimler: string[] = [];
  let formatTipi = 'bilinmeyen';
  let rows: unknown[][] = [];

  const head = buffer.slice(0, 200).toString('utf-8').trim().toLowerCase();
  const isHtml = head.startsWith('<') && (head.includes('<table') || head.includes('<html') || head.includes('<tr'));

  if (isHtml) {
    rows = htmlTableToRows(buffer);
    isimler = parseStudentNamesFromSheet(rows);
    formatTipi = 'html-table';
  } else {
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      isimler = parseStudentNamesFromSheet(rows);
      formatTipi = 'xlsx';
    } catch (err: any) {
      return NextResponse.json({
        eklenen: 0, atlanan: 0, hatali: 1, toplam: 0, formatTipi: 'hata',
        errors: [{ row: 0, reason: `Dosya okunamadı: ${err.message}` }],
      }, { status: 400 });
    }
  }

  if (isimler.length === 0) {
    const errors: Array<{ row: number; reason: string }> = [
      { row: 0, reason: 'Dosyadan hiç personel ismi çıkarılamadı.' },
    ];
    if (rows.length > 0) {
      errors.push({ row: 0, reason: `Format: ${formatTipi}. İlk ${Math.min(rows.length, 5)} satır:` });
      rows.slice(0, 5).forEach((row, i) => {
        const cells = Array.isArray(row) ? row.slice(0, 10).map(c => String(c ?? '')).join(' | ') : String(row);
        errors.push({ row: i + 1, reason: cells || '(boş)' });
      });
    }
    return NextResponse.json({
      eklenen: 0, atlanan: 0, hatali: errors.length, toplam: 0, formatTipi, errors,
    }, { status: 400 });
  }

  let eklenen = 0;
  let atlanan = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < isimler.length; i++) {
    const adSoyad = isimler[i];
    if (adSoyad.length < 2) {
      errors.push({ row: i + 1, reason: `Çok kısa: '${adSoyad}'` });
      continue;
    }
    const normName = normalizeName(adSoyad);
    try {
      const existing = await prisma.staff.findFirst({
        where: { organizationId: orgId, normalizedName: normName },
      });
      if (existing) { atlanan++; continue; }
      await prisma.staff.create({
        data: { organizationId: orgId, adSoyad, normalizedName: normName },
      });
      eklenen++;
    } catch (err: any) {
      errors.push({ row: i + 1, reason: err.message ?? 'Bilinmeyen hata' });
    }
  }

  return NextResponse.json({
    eklenen, atlanan, hatali: errors.length, toplam: isimler.length, formatTipi, errors,
  });
}

function htmlTableToRows(buffer: Buffer): unknown[][] {
  const content = buffer.toString('utf-8');
  const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const rows: unknown[][] = [];
  for (const rowHtml of rowMatches) {
    const cells = (rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map(cell =>
      cell
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
    );
    rows.push(cells);
  }
  return rows;
}
