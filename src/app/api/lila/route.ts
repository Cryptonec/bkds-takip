import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { lilaImportService } from '@/lib/services/lilaImportService';
import type { LilaImportRow } from '@/types';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  const job = await prisma.importJob.create({
    data: { fileName: file.name, status: 'isleniyor', organizationId },
  });

  try {
    const rows = parseLilaHtmlXls(buffer);

    await prisma.importJob.update({
      where: { id: job.id },
      data: { totalRows: rows.length },
    });

    const { success, errors } = await lilaImportService.processRows(rows, job.id, organizationId);

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: errors.length > 0 ? (success > 0 ? 'tamamlandi' : 'hata') : 'tamamlandi',
        processedRows: success,
        errorRows: errors.length,
        errorDetails: errors.length > 0 ? errors : undefined,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ jobId: job.id, success, errors: errors.length, errorDetails: errors });
  } catch (err: any) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'hata', errorDetails: [{ reason: err.message }], completedAt: new Date() },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: 'Kurum bilgisi eksik' }, { status: 403 });

  const jobs = await prisma.importJob.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json(jobs);
}

/** HTML entity'leri temizle, boşlukları normalize et */
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

/** Türkçe karakterleri ASCII'ye çevirerek küçük harf yap (header karşılaştırma için) */
function normH(s: string): string {
  return s.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

/**
 * Lila XLS dosyasını parse eder.
 * Dosya aslında HTML tablosudur.
 * Başlık satırı otomatik tespit edilir; "Adı" + "Soyadı" ayrı sütun veya
 * "Adı Soyadı" tek sütun formatlarını destekler.
 */
function parseLilaHtmlXls(buffer: Buffer): LilaImportRow[] {
  const content = buffer.toString('utf-8');
  const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  // Tüm satırları hücre dizisine dönüştür
  const allRows = rowMatches.map(rowHtml =>
    (rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map(cleanCell)
  );

  // Başlık satırını bul: "tarih" veya "adi" içeren ilk satır
  let cols = { adi: -1, soyadi: -1, fullName: -1, tarih: -1, saat: -1, derslik: -1, ogretmen: -1 };
  let dataStart = 0;

  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const nh = allRows[i].map(normH);
    if (!nh.some(h => h === 'tarih' || h === 'adi' || h.includes('adi soyadi'))) continue;

    cols.tarih    = nh.findIndex(h => h === 'tarih');
    cols.saat     = nh.findIndex(h => h === 'saat' || h.includes('saat'));
    cols.adi      = nh.findIndex(h => h === 'adi' || h === 'ad');
    cols.soyadi   = nh.findIndex(h => h === 'soyadi' || h === 'soyad');
    cols.fullName = nh.findIndex(h => h.includes('adi soyadi') || h.includes('ad soyad') || (h.includes('adi') && h.includes('soyadi')));
    cols.derslik  = nh.findIndex(h => h.includes('derslik'));
    cols.ogretmen = nh.findIndex(h => h.includes('egitimci') || h.includes('ogretmen') || h.includes('egitmen'));
    dataStart = i + 1;
    break;
  }

  // Başlık bulunamadıysa sabit sütun sırasına geri dön
  // Sira | Tarih | Saat | Adi [Soyadi] | Seans | Derslik | Egitimci
  const useFallback = cols.tarih === -1;
  if (useFallback) {
    cols = { adi: -1, soyadi: -1, fullName: 3, tarih: 1, saat: 2, derslik: 5, ogretmen: 6 };
    dataStart = 0;
  }

  const rows: LilaImportRow[] = [];

  for (const cells of allRows.slice(dataStart)) {
    if (cells.length < 4) continue;

    // Tarih kontrolü
    const tarihRaw = cols.tarih >= 0 ? (cells[cols.tarih] ?? '') : '';
    if (!/\d{2}\.\d{2}\.\d{4}/.test(tarihRaw)) continue;

    // Öğrenci adı: ayrı Adı+Soyadı varsa birleştir, yoksa fullName sütunu
    let ogrenciAdi = '';
    if (cols.adi >= 0 && cols.soyadi >= 0) {
      ogrenciAdi = `${cells[cols.adi] ?? ''} ${cells[cols.soyadi] ?? ''}`.trim();
    } else if (cols.fullName >= 0) {
      ogrenciAdi = cells[cols.fullName] ?? '';
    }

    // Saat
    const saatRaw = cols.saat >= 0 ? (cells[cols.saat] ?? '') : '';
    if (!saatRaw) continue;

    // Öğretmen ve derslik (fallback: boş string yerine "Belirtilmedi")
    const ogretmenAdi = (cols.ogretmen >= 0 ? cells[cols.ogretmen] : '') || 'Belirtilmedi';
    const derslik     = (cols.derslik  >= 0 ? cells[cols.derslik]  : '') || 'Salon';

    if (!ogrenciAdi) continue;

    const saatParts    = saatRaw.split('-').map((s: string) => s.trim());
    const baslangicSaati = saatParts[0] ?? '00:00';
    const bitisSaati     = saatParts[1] ?? '00:00';

    const [d, m, y] = tarihRaw.split('.');
    const tarih = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

    rows.push({ ogrenciAdi, ogretmenAdi, tarih, baslangicSaati, bitisSaati, derslik });
  }

  return rows;
}
