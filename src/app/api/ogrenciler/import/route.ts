import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import { parseStudentNamesFromSheet } from '@/lib/utils/parseStudentNames';
import * as XLSX from 'xlsx';

/**
 * Toplu öğrenci yükleme — Excel/CSV/Lila xls/HTML'den.
 *
 * Akış:
 *  1. Dosya HTML ise (Lila yoklama / öğrenci listesi): <tr>/<td> → satır matrisi
 *     → önce yoklama-özel çıkarıcı (tarih sütunlu), boşsa genel parser
 *  2. Gerçek XLSX binary: sheet_to_json (header:1) → satır matrisi
 *     → parseStudentNamesFromSheet (4 format)
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
    // Önce Lila yoklama'ya özel çıkarım (tarih sütununa göre)
    const yoklamaNames = extractYoklamaNames(rows);
    if (yoklamaNames.length > 0) {
      isimler = yoklamaNames;
      formatTipi = 'lila-yoklama-html';
    } else {
      // Yoklama değil — genel tablo parser'ına düş
      isimler = parseStudentNamesFromSheet(rows);
      formatTipi = 'lila-ogrenci-html';
    }
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
      { row: 0, reason: 'Dosyadan hiç öğrenci ismi çıkarılamadı. Desteklenen: Lila öğrenci listesi/yoklama, BRY öğrenci listesi (ADI/SOYADI), tek sütun isim listesi.' },
    ];
    if (rows.length > 0) {
      errors.push({ row: 0, reason: `Tespit edilen format: ${formatTipi}. Dosyanın ilk ${Math.min(rows.length, 5)} satırı:` });
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
      const existing = await prisma.student.findFirst({
        where: { organizationId: orgId, normalizedName: normName },
      });
      if (existing) { atlanan++; continue; }
      await prisma.student.create({
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

/** HTML tablosundan <tr>/<td> hücre matrisi çıkar. */
function htmlTableToRows(buffer: Buffer): unknown[][] {
  const content = buffer.toString('utf-8');
  const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const rows: unknown[][] = [];
  for (const rowHtml of rowMatches) {
    const cells = (rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])
      .map(cell =>
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

/** Lila yoklama HTML XLS — her satırda tarih sütunu var, cells[3] = öğrenci adı. */
function extractYoklamaNames(rows: unknown[][]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const cells = (r as string[]) ?? [];
    if (cells.length < 4) continue;
    if (!/^\d+$/.test(cells[0] ?? '')) continue;
    if (!/\d{2}\.\d{2}\.\d{4}/.test(cells[1] ?? '')) continue;
    const ad = (cells[3] ?? '').trim();
    if (ad && ad.length >= 2) out.push(ad);
  }
  return Array.from(new Set(out));
}
