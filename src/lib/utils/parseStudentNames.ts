/**
 * Excel/CSV'den öğrenci adlarını parse eder.
 *
 * Desteklenen formatlar:
 *  - Ayrı "Adı" + "Soyadı" sütunları  → birleştirilir
 *  - "Ad Soyad" / "Adı Soyadı" gibi tek sütun
 *  - Başlık yok, ilk sütun ad soyad
 */
export function parseStudentNamesFromSheet(rows: unknown[][]): string[] {
  if (rows.length === 0) return [];

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[ığüşöç]/g, (c) =>
      ({ ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c' }[c] ?? c)
    );

  // Başlık satırı olup olmadığını kontrol et
  const firstRow = rows[0].map((c) => String(c ?? '').trim());
  const normHeaders = firstRow.map(normalize);

  const adiIdx   = normHeaders.findIndex(h => h === 'adi' || h === 'ad');
  const soyadiIdx = normHeaders.findIndex(h => h === 'soyadi' || h === 'soyad');
  const fullIdx  = normHeaders.findIndex(h =>
    h.includes('ad soyad') || h.includes('adi soyadi') || h.includes('adsoyad') ||
    h.includes('isim') || h === 'ogrenci' || h.includes('ogrenci adi')
  );

  const hasHeader = adiIdx !== -1 || soyadiIdx !== -1 || fullIdx !== -1;
  const dataRows  = hasHeader ? rows.slice(1) : rows;

  const names: string[] = [];

  for (const row of dataRows) {
    const cells = row.map((c) => String(c ?? '').trim());

    let name = '';
    if (adiIdx !== -1 && soyadiIdx !== -1) {
      const adi   = cells[adiIdx]   ?? '';
      const soyad = cells[soyadiIdx] ?? '';
      name = `${adi} ${soyad}`.trim();
    } else if (fullIdx !== -1) {
      name = cells[fullIdx] ?? '';
    } else {
      name = cells[0] ?? '';
    }

    // Sadece sayıdan oluşan ve çok kısa girişleri atla
    if (name.length > 1 && !/^\d+$/.test(name)) {
      names.push(name);
    }
  }

  return names;
}
