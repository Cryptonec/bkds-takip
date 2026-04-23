import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeName } from '@/lib/utils/normalize';
import * as XLSX from 'xlsx';

/**
 * Toplu öğrenci yükleme — Excel/CSV dosyasından.
 * Beklenen sütun isimleri (esnek):
 *   - "Ad Soyad" / "Adi Soyadi" / "Ad" / "Ogrenci Adi" / "İsim"
 *   - "Öğrenci No" / "Ogrenci No" / "No" (opsiyonel)
 *   - "TC" / "T.C." / "Kimlik No" (opsiyonel)
 *
 * Mevcut öğrenci varsa (aynı normalizedName) atlanır — duplicate olmaz.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const orgId = await getOrgId(session);
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let rows: Record<string, any>[];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  } catch (err: any) {
    return NextResponse.json({ error: `Excel/CSV okunamadı: ${err.message}` }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Dosya boş veya format tanınmadı' }, { status: 400 });
  }

  // Esnek alan eşleştirme — Türkçe/İngilizce, boşluklu/boşluksuz, türlü yazımlar
  function pickField(row: Record<string, any>, candidates: string[]): string {
    const normalizedKeys = Object.keys(row).map(k => [k, k.toLowerCase().replace(/[^a-z0-9ığüşöç]/gi, '')] as const);
    for (const c of candidates) {
      const cNorm = c.toLowerCase().replace(/[^a-z0-9ığüşöç]/gi, '');
      const match = normalizedKeys.find(([, k]) => k === cNorm);
      if (match) {
        const val = row[match[0]];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
    return '';
  }

  const errors: Array<{ row: number; reason: string }> = [];
  let eklenen = 0;
  let atlanan = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const adSoyad = pickField(row, [
      'Ad Soyad', 'Adi Soyadi', 'AdSoyad', 'Ad', 'Öğrenci Adı', 'Ogrenci Adi',
      'Öğrenci', 'Ogrenci', 'İsim', 'Isim', 'Name', 'Full Name',
    ]);

    if (!adSoyad || adSoyad.length < 2) {
      errors.push({ row: i + 2, reason: 'Ad Soyad bulunamadı veya çok kısa' });
      continue;
    }

    const ogrenciNo = pickField(row, ['Öğrenci No', 'Ogrenci No', 'No', 'Numara', 'Student No']) || null;
    const tcRaw = pickField(row, ['TC', 'T.C.', 'TCKN', 'Kimlik No', 'TC Kimlik']);
    const tc = tcRaw && /^\d{11}$/.test(tcRaw.replace(/\s/g, '')) ? tcRaw.replace(/\s/g, '') : null;

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
          ogrenciNo,
          tc,
        },
      });
      eklenen++;
    } catch (err: any) {
      errors.push({ row: i + 2, reason: err.message ?? 'Bilinmeyen hata' });
    }
  }

  return NextResponse.json({ eklenen, atlanan, hatali: errors.length, toplam: rows.length, errors });
}
