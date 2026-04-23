import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import * as XLSX from 'xlsx';

/**
 * Toplu öğrenci yükleme. Birden fazla formatı otomatik tanır:
 *
 * 1) Lila yoklama HTML XLS — .xls aslında HTML; tablodan öğrenci adları çıkarılır
 *    (cells[3]).
 *
 * 2) BRY öğrenci listesi Excel — başlık satırları öncesinde "ÖĞRENCİ LİSTESİ"
 *    gibi title olabilir, header satırı tespit edilir, ADI + SOYADI ayrı
 *    kolonlardan birleştirilir, TC + Öğrenci No varsa eklenir.
 *
 * 3) Standart tek-kolon Excel/CSV — "Ad Soyad" başlıklı veya başlıksız tek
 *    kolon isim listesi.
 */

interface OgrenciKaydi {
  adSoyad: string;
  ogrenciNo: string | null;
  tc: string | null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let kayitlar: OgrenciKaydi[] = [];
  let formatTipi = 'bilinmeyen';
  let debug: any = undefined;

  // 1) Lila HTML XLS denetimi
  const head = buffer.slice(0, 200).toString('utf-8').trim().toLowerCase();
  if (head.startsWith('<') && (head.includes('<table') || head.includes('<html') || head.includes('<tr'))) {
    kayitlar = extractFromLilaHtmlXls(buffer);
    formatTipi = 'lila-html-xls';
  } else {
    // 2/3) Standart Excel — header tespiti ile
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const result = parseTabularExcel(sheet);
      kayitlar = result.kayitlar;
      formatTipi = result.formatTipi;
      debug = result.debug;
    } catch (err: any) {
      return NextResponse.json({ error: `Excel/CSV okunamadı: ${err.message}` }, { status: 400 });
    }
  }

  if (kayitlar.length === 0) {
    // Debug bilgisini errors içine koy ki UI'da görünsün
    const debugErrors: Array<{ row: number; reason: string }> = [];
    if (debug?.headerIdx !== undefined) {
      debugErrors.push({ row: 0, reason: `Header satırı ${debug.headerIdx + 1}'de bulundu ama veri yok` });
      if (Array.isArray(debug.headerRow)) {
        debugErrors.push({ row: 0, reason: `Header: ${debug.headerRow.join(' | ')}` });
      }
    } else if (Array.isArray(debug?.ilkSatirlar)) {
      debugErrors.push({ row: 0, reason: `Header satırı bulunamadı. İlk 3 satır:` });
      debug.ilkSatirlar.forEach((row: any[], i: number) => {
        debugErrors.push({ row: i + 1, reason: row.slice(0, 8).map(String).join(' | ') });
      });
    }
    return NextResponse.json({
      eklenen: 0,
      atlanan: 0,
      hatali: debugErrors.length || 1,
      toplam: 0,
      formatTipi,
      errors: debugErrors.length > 0 ? debugErrors : [{
        row: 0,
        reason: 'Dosya tanınamadı veya hiç öğrenci ismi bulunamadı. Lila yoklama .xls\'i, BRY öğrenci listesi Excel\'i ya da "Ad Soyad" sütunlu Excel/CSV yükleyin.',
      }],
    }, { status: 400 });
  }

  // İsim+soyad'a göre benzersizleştir (aynı dosyada tekrar varsa)
  const seen = new Set<string>();
  const benzersiz: OgrenciKaydi[] = [];
  for (const k of kayitlar) {
    const key = normalizeName(k.adSoyad);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    benzersiz.push(k);
  }

  let eklenen = 0;
  let atlanan = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < benzersiz.length; i++) {
    const k = benzersiz[i];
    if (!k.adSoyad || k.adSoyad.length < 2) {
      errors.push({ row: i + 1, reason: `Çok kısa: '${k.adSoyad}'` });
      continue;
    }
    const normName = normalizeName(k.adSoyad);
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
          adSoyad: k.adSoyad,
          normalizedName: normName,
          ogrenciNo: k.ogrenciNo,
          tc: k.tc,
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

/** Lila yoklama HTML XLS — cells[3] = öğrenci adı (tam ad). */
function extractFromLilaHtmlXls(buffer: Buffer): OgrenciKaydi[] {
  const content = buffer.toString('utf-8');
  const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: OgrenciKaydi[] = [];

  for (const rowHtml of rowMatches) {
    const cells = (rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])
      .map((cell) => cell.replace(/<[^>]+>/g, '').trim());

    if (cells.length < 4) continue;
    if (!/^\d+$/.test(cells[0])) continue;
    if (!/\d{2}\.\d{2}\.\d{4}/.test(cells[1] ?? '')) continue;

    const ad = (cells[3] ?? '').trim();
    if (ad && ad.length >= 2) {
      out.push({ adSoyad: ad, ogrenciNo: null, tc: null });
    }
  }
  return out;
}

/**
 * Tabular Excel parse:
 *  - Header satırını tespit eder (içinde 'ADI' / 'AD SOYAD' / 'İSİM' geçen ilk satır)
 *  - ADI + SOYADI kolonları varsa birleştirir
 *  - TEK 'AD SOYAD' kolonu varsa direkt kullanır
 *  - TC + Öğrenci No kolonları varsa çıkarır
 */
function parseTabularExcel(sheet: XLSX.WorkSheet): {
  kayitlar: OgrenciKaydi[];
  formatTipi: string;
  debug?: { headerIdx?: number; headerRow?: any[]; ilkSatirlar?: any[][] };
} {
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  if (rawRows.length === 0) return { kayitlar: [], formatTipi: 'bos' };

  // Türkçe-aware ASCII normalize: İ→i, ı→i, Ş→s, Ü→u, vb.
  const norm = (s: any) => String(s ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase()
    .trim()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ');

  // Header satırı ara — ilk 15 satırda ADI/AD/SOYAD/TC/NO içeren ilk satır
  const headerHints = ['adi', 'ad', 'ad soyad', 'adi soyadi', 'isim', 'name', 'soyadi', 'soyad', 'ogrenci no', 'kimlik no', 'tc kimlik'];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const cells = (rawRows[i] ?? []).map(norm);
    // Hücreden biri tam header anahtar kelimesi ise başlık satırıdır
    if (cells.some(c => c && headerHints.includes(c))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // Header yok — tek sütun isim listesi varsayımı
    const out: OgrenciKaydi[] = [];
    for (const row of rawRows) {
      const v = String(row?.[0] ?? '').trim();
      if (v && v.length >= 2 && !headerHints.includes(norm(v))) {
        out.push({ adSoyad: v, ogrenciNo: null, tc: null });
      }
    }
    return {
      kayitlar: out,
      formatTipi: 'tek-sutun-headersiz',
      debug: { ilkSatirlar: rawRows.slice(0, 3) },
    };
  }

  // Header'dan kolon indexlerini topla
  const headerRow = rawRows[headerIdx] as any[];
  const colMap = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const k = norm(cell);
    if (k && !colMap.has(k)) colMap.set(k, idx);
  });

  // Hem tam eşleşme hem substring fallback
  const findCol = (...keys: string[]): number => {
    for (const k of keys) {
      const nk = norm(k);
      const exact = colMap.get(nk);
      if (exact !== undefined) return exact;
    }
    // Substring fallback — herhangi bir başlık anahtar kelimeyi içeriyorsa
    for (const [headerKey, idx] of colMap) {
      for (const k of keys) {
        if (headerKey.includes(norm(k))) return idx;
      }
    }
    return -1;
  };

  const adIdx = findCol('adi', 'ad', 'ad soyad', 'adi soyadi', 'isim', 'name', 'ogrenci adi');
  const soyadIdx = findCol('soyadi', 'soyad', 'surname');
  const noIdx = findCol('ogrenci no', 'no', 'numara', 'student no');
  const tcIdx = findCol('t c kimlik no', 'tc kimlik no', 'tc kimlik', 'tc', 'tckn', 'kimlik no');

  const kayitlar: OgrenciKaydi[] = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] ?? [];
    let adSoyad = '';
    if (adIdx >= 0 && soyadIdx >= 0) {
      const a = String(row[adIdx] ?? '').trim();
      const s = String(row[soyadIdx] ?? '').trim();
      if (a && s) adSoyad = `${a} ${s}`;
      else if (a) adSoyad = a;
      else if (s) adSoyad = s;
    } else if (adIdx >= 0) {
      adSoyad = String(row[adIdx] ?? '').trim();
    }

    if (!adSoyad || adSoyad.length < 2) continue;

    const ogrenciNoRaw = noIdx >= 0 ? String(row[noIdx] ?? '').trim() : '';
    const ogrenciNo = ogrenciNoRaw && ogrenciNoRaw !== '0' ? ogrenciNoRaw : null;

    const tcRaw = tcIdx >= 0 ? String(row[tcIdx] ?? '').trim().replace(/\s/g, '') : '';
    const tc = /^\d{11}$/.test(tcRaw) ? tcRaw : null;

    kayitlar.push({ adSoyad, ogrenciNo, tc });
  }

  const formatTipi = (adIdx >= 0 && soyadIdx >= 0)
    ? 'excel-ad-soyad-ayri'
    : 'excel-tek-kolon';
  return {
    kayitlar,
    formatTipi,
    debug: { headerIdx, headerRow, ilkSatirlar: rawRows.slice(0, 5) },
  };
}
