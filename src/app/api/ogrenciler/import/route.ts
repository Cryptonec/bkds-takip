import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import * as XLSX from 'xlsx';

/**
 * Toplu öğrenci yükleme. Üç formatı otomatik tanır:
 *
 * 1) Lila yoklama HTML XLS — Lila'dan indirilen .xls aslında HTML.
 *    Hücre dizilimi: [no, tarih, saat, OGRENCI ADI, ?, derslik, ogretmen, ...]
 *    Öğrenci adı 4. sütunda (index 3).
 *
 * 2) Standart Excel/CSV — başlık satırı 'Ad Soyad' / 'Öğrenci Adı' / 'İsim' vs.
 *
 * 3) Tek sütunlu Excel/CSV — sadece isim listesi, başlık opsiyonel.
 *
 * Tüm formatlarda mevcut öğrenci varsa atlanır (duplicate olmaz).
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

  // 1) Lila HTML XLS denetimi — buffer'ın başı '<' (HTML) ile başlıyorsa
  const head = buffer.slice(0, 200).toString('utf-8').trim().toLowerCase();
  if (head.startsWith('<') && (head.includes('<table') || head.includes('<html') || head.includes('<tr'))) {
    isimler = extractFromLilaHtmlXls(buffer);
    formatTipi = 'lila-html-xls';
  } else {
    // 2/3) Standart Excel/CSV — xlsx ile parse et
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      if (rows.length > 0) {
        for (const row of rows) {
          const ad = pickField(row, [
            'Ad Soyad', 'Adi Soyadi', 'AdSoyad', 'Ad', 'Öğrenci Adı', 'Ogrenci Adi',
            'Öğrenci', 'Ogrenci', 'İsim', 'Isim', 'Name', 'Full Name',
          ]);
          if (ad) isimler.push(ad);
        }
        formatTipi = 'excel-baslikli';
      }

      // Eğer başlıklı format'tan hiç isim çıkmadıysa, tek sütunlu olabilir — header'sız parse et
      if (isimler.length === 0) {
        const arr = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
        for (const row of arr) {
          const ad = String(row?.[0] ?? '').trim();
          if (ad && ad.length >= 2 && !isHeader(ad)) isimler.push(ad);
        }
        if (isimler.length > 0) formatTipi = 'tek-sutun';
      }
    } catch (err: any) {
      return NextResponse.json({ error: `Excel/CSV okunamadı: ${err.message}` }, { status: 400 });
    }
  }

  if (isimler.length === 0) {
    return NextResponse.json({
      error: 'Dosya tanınamadı veya hiç öğrenci ismi bulunamadı. Lila yoklama .xls\'ini ya da "Ad Soyad" sütunlu Excel/CSV yükleyin.',
      formatTipi,
    }, { status: 400 });
  }

  // Tekrarları temizle (aynı dosyada aynı öğrenci birden çok kez gelebilir — Lila'da her ders bir satır)
  const benzersiz = Array.from(new Set(isimler.map(s => s.trim()).filter(Boolean)));

  let eklenen = 0;
  let atlanan = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < benzersiz.length; i++) {
    const adSoyad = benzersiz[i];
    if (adSoyad.length < 2) {
      errors.push({ row: i + 1, reason: `Çok kısa: '${adSoyad}'` });
      continue;
    }
    const normName = normalizeName(adSoyad);
    try {
      const existing = await prisma.student.findFirst({
        where: { organizationId: orgId, normalizedName: normName },
      });
      if (existing) {
        atlanan++;
        continue;
      }
      await prisma.student.create({
        data: {
          organizationId: orgId,
          adSoyad,
          normalizedName: normName,
        },
      });
      eklenen++;
    } catch (err: any) {
      errors.push({ row: i + 1, reason: err.message ?? 'Bilinmeyen hata' });
    }
  }

  return NextResponse.json({
    eklenen,
    atlanan,
    hatali: errors.length,
    toplam: benzersiz.length,
    formatTipi,
    errors,
  });
}

/** Lila'nın HTML formatındaki .xls dosyasından öğrenci isimlerini çek. */
function extractFromLilaHtmlXls(buffer: Buffer): string[] {
  const content = buffer.toString('utf-8');
  const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const isimler: string[] = [];

  for (const rowHtml of rowMatches) {
    const cells = (rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])
      .map((cell) => cell.replace(/<[^>]+>/g, '').trim());

    if (cells.length < 4) continue;
    // Lila yoklama satırı: ilk hücre numara, ikinci tarih (DD.MM.YYYY)
    if (!/^\d+$/.test(cells[0])) continue;
    if (!/\d{2}\.\d{2}\.\d{4}/.test(cells[1] ?? '')) continue;

    const ad = (cells[3] ?? '').trim();
    if (ad && ad.length >= 2) isimler.push(ad);
  }
  return isimler;
}

function pickField(row: Record<string, any>, candidates: string[]): string {
  const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9ığüşöç]/gi, '');
  const keys = Object.keys(row).map(k => [k, normalized(k)] as const);
  for (const c of candidates) {
    const cNorm = normalized(c);
    const match = keys.find(([, k]) => k === cNorm);
    if (match) {
      const val = row[match[0]];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
  }
  return '';
}

function isHeader(s: string): boolean {
  const lo = s.toLowerCase();
  return ['ad', 'soyad', 'adı', 'adi', 'isim', 'name', 'öğrenci', 'ogrenci'].some(h => lo === h || lo.includes(h + ' '));
}
