import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LilaImportService } from '@/lib/services/lilaImportService';
import type { LilaImportRow } from '@/types';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  const job = await prisma.importJob.create({
    data: { organizationId: orgId, fileName: file.name, status: 'isleniyor' },
  });

  try {
    const { rows, debug } = parseLilaHtmlXls(buffer);

    if (rows.length === 0) {
      const debugMsg = debug
        ? `Dosyadan hiç satır çıkarılamadı. Header: ${debug.headerFound ? 'bulundu' : 'bulunamadı'}. Tespit: ${debug.hint ?? '-'}. İlk 3 satır: ${(debug.ilkSatirlar ?? []).map(r => r.slice(0, 8).join(' | ')).join(' || ')}`
        : 'Dosyadan hiç satır çıkarılamadı.';
      throw new Error(debugMsg);
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: { totalRows: rows.length },
    });

    const importService = new LilaImportService(orgId);
    const { success, errors } = await importService.processRows(rows, job.id);

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: errors.length > 0 ? (success > 0 ? 'tamamlandi' : 'hata') : 'tamamlandi',
        processedRows: success,
        errorRows: errors.length,
        errorDetails: errors.length > 0 ? JSON.stringify(errors) : null,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ jobId: job.id, success, errors: errors.length, errorDetails: errors });
  } catch (err: any) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'hata', errorDetails: JSON.stringify([{ reason: err.message }]), completedAt: new Date() },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);

  const jobs = await prisma.importJob.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const parsedJobs = jobs.map(j => ({
    ...j,
    errorDetails: j.errorDetails ? safeJsonParse(j.errorDetails) : null,
  }));

  return NextResponse.json(parsedJobs);
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

interface ParseDebug {
  headerFound: boolean;
  hint?: string;
  ilkSatirlar?: string[][];
}

/**
 * Lila yoklama çizelgesi parser — .xls aslında HTML.
 *
 * Algoritma:
 *  1. <tr>/<td> regex ile satırları hücre matrisine çevir
 *  2. İlk 10 satırda header ara: "tarih" + ("adi"/"ad soyad"/"ogrenci") içeren satır
 *  3. Header bulunursa: sütun indekslerini dinamik al (tarih, saat, adi, soyadi
 *     VEYA adi soyadi tek sütun, derslik, egitimci/ogretmen)
 *  4. Bulunamazsa fallback: sabit indexler (col 1=tarih, 2=saat, 3=ad soyad,
 *     5=derslik, 6=egitimci) — eski format
 *  5. Her veri satırı için validate (tarih DD.MM.YYYY, saat HH:MM-HH:MM) ve
 *     LilaImportRow olarak döndür
 */
function parseLilaHtmlXls(buffer: Buffer): { rows: LilaImportRow[]; debug: ParseDebug } {
  const content = buffer.toString('utf-8');
  const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  const rawRows: string[][] = rowMatches.map(rowHtml =>
    (rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map(cell =>
      cell
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
    )
  );

  const debug: ParseDebug = {
    headerFound: false,
    ilkSatirlar: rawRows.slice(0, 3),
  };

  // Türkçe-aware ASCII normalize
  const norm = (s: string) =>
    (s ?? '')
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/Ş/g, 's').replace(/ş/g, 's')
      .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
      .replace(/Ü/g, 'u').replace(/ü/g, 'u')
      .replace(/Ö/g, 'o').replace(/ö/g, 'o')
      .replace(/Ç/g, 'c').replace(/ç/g, 'c')
      .toLowerCase().trim();

  // Header tespiti
  let headerIdx = -1;
  const cols = {
    tarih: -1, saat: -1, adi: -1, soyadi: -1, adSoyad: -1, derslik: -1, egitimci: -1,
  };

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const cells = rawRows[i].map(norm);
    const findCol = (exact: string[], partial?: string[]): number => {
      for (let j = 0; j < cells.length; j++) {
        if (exact.includes(cells[j])) return j;
      }
      if (partial) {
        for (let j = 0; j < cells.length; j++) {
          if (partial.some(p => cells[j].includes(p))) return j;
        }
      }
      return -1;
    };

    const tarihIdx = findCol(['tarih'], ['tarih']);
    const adiIdx = findCol(['adi', 'ad']);
    const soyadiIdx = findCol(['soyadi', 'soyad']);
    const adSoyadIdx = findCol(['adi soyadi', 'ad soyad', 'ogrenci', 'ogrenci adi']);

    if (tarihIdx >= 0 && (adiIdx >= 0 || adSoyadIdx >= 0)) {
      headerIdx = i;
      cols.tarih = tarihIdx;
      cols.saat = findCol(['saat'], ['saat']);
      cols.adi = adiIdx;
      cols.soyadi = soyadiIdx;
      cols.adSoyad = adSoyadIdx;
      cols.derslik = findCol(['derslik', 'sinif'], ['derslik', 'sinif']);
      cols.egitimci = findCol(['egitimci', 'ogretmen', 'personel'], ['egitimci', 'ogretmen', 'personel']);
      debug.headerFound = true;
      debug.hint = `header@${i}: tarih=${tarihIdx}, saat=${cols.saat}, ad=${adiIdx}, soyad=${soyadiIdx}, adSoyad=${adSoyadIdx}, derslik=${cols.derslik}, egitimci=${cols.egitimci}`;
      break;
    }
  }

  const rows: LilaImportRow[] = [];
  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;

  for (let i = startIdx; i < rawRows.length; i++) {
    const cells = rawRows[i];
    if (cells.length < 3) continue;

    let tarihCell = '';
    let saatCell = '';
    let ogrenciAdi = '';
    let derslikCell = '';
    let egitimciCell = '';

    if (headerIdx >= 0) {
      tarihCell = cols.tarih >= 0 ? cells[cols.tarih] ?? '' : '';
      saatCell = cols.saat >= 0 ? cells[cols.saat] ?? '' : '';
      if (cols.adi >= 0 && cols.soyadi >= 0) {
        const ad = cells[cols.adi] ?? '';
        const soyad = cells[cols.soyadi] ?? '';
        ogrenciAdi = `${ad} ${soyad}`.replace(/\s+/g, ' ').trim();
      } else if (cols.adSoyad >= 0) {
        ogrenciAdi = cells[cols.adSoyad] ?? '';
      }
      derslikCell = cols.derslik >= 0 ? cells[cols.derslik] ?? '' : '';
      egitimciCell = cols.egitimci >= 0 ? cells[cols.egitimci] ?? '' : '';
    } else {
      // Fallback: sabit sütun pozisyonları (eski Lila format)
      if (cells.length < 7) continue;
      if (!/^\d+$/.test(cells[0] ?? '')) continue;
      if (!/\d{2}\.\d{2}\.\d{4}/.test(cells[1] ?? '')) continue;
      tarihCell = cells[1];
      saatCell = cells[2];
      ogrenciAdi = cells[3];
      derslikCell = cells[5];
      egitimciCell = cells[6];
    }

    tarihCell = tarihCell.trim();
    saatCell = saatCell.trim();
    ogrenciAdi = ogrenciAdi.trim();
    derslikCell = derslikCell.trim();
    egitimciCell = egitimciCell.trim();

    // Satır validasyonu
    if (!/\d{2}\.\d{2}\.\d{4}/.test(tarihCell)) continue;
    if (!ogrenciAdi || !egitimciCell || !saatCell) continue;

    const saatParts = saatCell.split('-').map(s => s.trim());
    const baslangicSaati = saatParts[0] ?? '00:00';
    const bitisSaati = saatParts[1] ?? '00:00';

    const [d, m, y] = tarihCell.split('.');
    if (!d || !m || !y) continue;
    const tarih = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

    rows.push({ ogrenciAdi, ogretmenAdi: egitimciCell, tarih, baslangicSaati, bitisSaati, derslik: derslikCell });
  }

  if (!debug.hint) {
    debug.hint = `header yok, fallback fixed positions (col1=tarih, col3=ad soyad, col6=egitimci). Toplam ${rawRows.length} satır.`;
  }

  return { rows, debug };
}
