/**
 * Excel/CSV'den öğrenci adlarını parse eder.
 *
 * Desteklenen formatlar:
 *  - SIRA | ADI | SOYADI  (Rehapp/okul listesi tipik formatı)
 *  - Ayrı "Adı" + "Soyadı" sütunları
 *  - "Ad Soyad" / "Adı Soyadı" tek sütun
 *  - Başlıksız, ilk sütun ad soyad
 */

// Başlık karşılaştırması için Türkçe normalize
function nh(s: string) {
  return s.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

// Öğrenci olmayan bilinen başlık/junk değerleri (tam eşleşme)
const JUNK_EXACT = new Set([
  'sira', 'no', 'sira no', 'ogrenci no', 'tc', 'tc no', 'tc kimlik',
  'adi', 'soyadi', 'ad', 'soyad', 'adi soyadi', 'ad soyad',
  'ogrenci listesi', 'ogrenci bilgileri', 'ogrenciler',
  'isim', 'isim soyisim', 'sinif', 'tarih', 'aciklama',
]);

// Bu kelimeleri içeriyorsa kurum/başlık satırıdır
const JUNK_WORDS = [
  'rehberlik', 'arastirma', 'merkezi', 'mudurlugu', 'mudürlüğü',
  'ilkokul', 'ortaokul', 'anadolu', 'lisesi', 'universitesi',
  'hizmetleri', 'egitim bolgesi',
];

export function parseStudentNamesFromSheet(rows: unknown[][]): string[] {
  if (rows.length === 0) return [];

  const toStr = (v: unknown) => String(v ?? '').trim();

  // İlk 10 satırı tarayarak başlık satırını bul
  let headerRowIdx = -1;
  let adiIdx = -1, soyadiIdx = -1, fullIdx = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map(toStr);
    const normed = cells.map(nh);

    const ai = normed.findIndex(h => h === 'adi' || h === 'ad');
    const si = normed.findIndex(h => h === 'soyadi' || h === 'soyad');
    const fi = normed.findIndex(h =>
      h.includes('adi soyadi') || h === 'ad soyad' || h === 'adsoyad' ||
      h.includes('ogrenci adi') || h === 'isim'
    );

    if (ai !== -1 || si !== -1 || fi !== -1) {
      headerRowIdx = i;
      adiIdx   = ai;
      soyadiIdx = si;
      fullIdx  = fi;
      break;
    }
  }

  const dataRows = headerRowIdx >= 0 ? rows.slice(headerRowIdx + 1) : rows;
  const names: string[] = [];

  for (const row of dataRows) {
    const cells = row.map(toStr);

    let name = '';
    if (adiIdx !== -1 && soyadiIdx !== -1) {
      name = `${cells[adiIdx] ?? ''} ${cells[soyadiIdx] ?? ''}`.trim();
    } else if (fullIdx !== -1) {
      name = cells[fullIdx] ?? '';
    } else {
      // Başlık bulunamadıysa: ilk sütun sıra numarasıysa D+E sütunlarını dene (index 3+4)
      const col0 = cells[0] ?? '';
      if (/^\d+$/.test(col0) && cells.length >= 5) {
        name = `${cells[3] ?? ''} ${cells[4] ?? ''}`.trim();
      } else if (/^\d+$/.test(col0) && cells.length >= 3) {
        name = `${cells[1] ?? ''} ${cells[2] ?? ''}`.trim();
      } else {
        name = col0;
      }
    }

    // Junk filtresi
    const normalized = nh(name);
    const isJunk =
      name.length < 2 ||
      /^\d+$/.test(name) ||
      JUNK_EXACT.has(normalized) ||
      JUNK_WORDS.some(w => normalized.includes(w));

    if (!isJunk) {
      names.push(name);
    }
  }

  return names;
}
