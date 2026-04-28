/**
 * Excel'den parse edilmiş satır matrisinden öğrenci isimlerini çıkarır.
 *
 * Desteklenen formatlar:
 *  1. Başlık satırında 'Adı' + 'Soyadı' ayrı kolonlar (BRY öğrenci listesi)
 *  2. Başlık satırında 'Adı Soyadı' tek kolon (veya 'İsim' / 'Ad Soyad')
 *  3. Başlıksız, ilk kolon sıra numarası → col[1]+col[2] veya col[3]+col[4]
 *  4. Başlıksız, tek kolon isim listesi → col[0]
 *
 * Junk filtreleri: sayılar, başlık kelimeleri, kurum adları atlanır.
 */

const HEADER_JUNK = new Set([
  'sira', 'no', 'numara', 'ogrenci listesi', 'ogr listesi',
  'ogrenci no', 'kayit tipi', 'kayit', 'kimlik no', 'tc', 'tckn',
  't c kimlik no', 't c kimlik', 'cinsiyet', 'cinsiyeti',
  'engel', 'engel tipi', 'kan grubu', 'dogum tarihi', 'dogum yeri',
  'telefon', 'cep', 'adres', 'email', 'eposta', 'veli', 'baba', 'anne',
]);

const INSTITUTION_JUNK = [
  'rehberlik', 'merkezi', 'anadolu lisesi', 'ilkokul', 'ortaokul',
  'ozel egitim', 'rehabilitasyon', 'milli egitim', 'mudurlugu',
  'bakanligi', 'il milli', 'ilce milli',
];

function normalize(s: string): string {
  return s
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase().trim()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ');
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function isJunkCell(s: string): boolean {
  const n = normalize(s);
  if (!n) return true;
  if (/^\d+$/.test(n)) return true;                     // salt sayı
  if (/^\d+[\/\.\-]\d+/.test(n)) return true;            // tarih/numara
  if (HEADER_JUNK.has(n)) return true;
  for (const k of INSTITUTION_JUNK) if (n.includes(k)) return true;
  return false;
}

interface HeaderInfo {
  idx: number;
  adCol: number;
  soyadCol: number;
  fullCol: number;
}

function findHeaderRow(rows: unknown[][]): HeaderInfo | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] ?? []).map(c => normalize(cellStr(c)));
    let adCol = -1, soyadCol = -1, fullCol = -1;
    for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      if ((c === 'adi' || c === 'ad') && adCol === -1) adCol = j;
      if ((c === 'soyadi' || c === 'soyad' || c === 'surname') && soyadCol === -1) soyadCol = j;
      if ((c === 'adi soyadi' || c === 'ad soyad' || c === 'isim' || c === 'name' ||
           c === 'ogrenci adi' || c === 'ogrenci' || c === 'ogr adi') && fullCol === -1) fullCol = j;
    }
    if (adCol >= 0 && soyadCol >= 0) return { idx: i, adCol, soyadCol, fullCol: -1 };
    if (fullCol >= 0) return { idx: i, adCol: -1, soyadCol: -1, fullCol };
  }
  return null;
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = normalize(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n.trim().replace(/\s+/g, ' '));
  }
  return out;
}

export interface StudentRecord {
  adSoyad: string;
  ogrenciNo?: string;
  tc?: string;
}

interface HeaderInfoEx extends HeaderInfo {
  tcCol: number;
  ogrenciNoCol: number;
}

function findHeaderRowEx(rows: unknown[][]): HeaderInfoEx | null {
  const base = findHeaderRow(rows);
  if (!base) return null;
  const cells = (rows[base.idx] ?? []).map(c => normalize(cellStr(c)));
  let tcCol = -1, ogrenciNoCol = -1;
  for (let j = 0; j < cells.length; j++) {
    const c = cells[j];
    // TC kolonu
    if (tcCol === -1 && (
      c === 'tc' || c === 'tckn' || c === 't c kimlik' || c === 't c kimlik no' ||
      c === 'kimlik no' || c === 'kimlik' || c === 'tc kimlik' || c === 'tc no' ||
      c === 't c no' || c === 'tc kimlik no'
    )) tcCol = j;
    // Öğrenci no
    if (ogrenciNoCol === -1 && (
      c === 'ogrenci no' || c === 'okul no' || c === 'no' || c === 'numara' ||
      c === 'ogr no'
    )) ogrenciNoCol = j;
  }
  return { ...base, tcCol, ogrenciNoCol };
}

/**
 * parseStudentNamesFromSheet'in genişletilmiş hali — ad-soyad'ın yanında
 * TC ve öğrenci no'yu da yakalar. BRY öğrenci listesi Excel'inde
 * 'T.C. KİMLİK NO' ve 'ÖĞRENCİ NO' kolonları otomatik tanınır.
 */
export function parseStudentRecordsFromSheet(rows: unknown[][]): StudentRecord[] {
  if (!rows || rows.length === 0) return [];

  const header = findHeaderRowEx(rows);

  if (header) {
    const seen = new Set<string>();
    const out: StudentRecord[] = [];
    for (let i = header.idx + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      let ad = '';
      if (header.fullCol >= 0) {
        ad = cellStr(r[header.fullCol]);
      } else if (header.adCol >= 0 && header.soyadCol >= 0) {
        const a = cellStr(r[header.adCol]);
        const s = cellStr(r[header.soyadCol]);
        ad = [a, s].filter(Boolean).join(' ').trim();
      }
      if (!ad || ad.length < 2 || isJunkCell(ad)) continue;

      const tcRaw = header.tcCol >= 0 ? cellStr(r[header.tcCol]) : '';
      const tc = tcRaw.replace(/\D/g, '');
      const ogrNo = header.ogrenciNoCol >= 0 ? cellStr(r[header.ogrenciNoCol]) : '';

      const key = normalize(ad);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        adSoyad: ad.trim().replace(/\s+/g, ' '),
        ogrenciNo: ogrNo || undefined,
        tc: tc.length >= 4 && tc.length <= 11 ? tc : undefined,
      });
    }
    return out;
  }

  // Header yoksa sadece isim çek (TC tahmin edilemez)
  return parseStudentNamesFromSheet(rows).map(adSoyad => ({ adSoyad }));
}

// JS-only export uyumlulugu icin yardimci - isJunkCell ve normalize zaten yukarida.

export function parseStudentNamesFromSheet(rows: unknown[][]): string[] {
  if (!rows || rows.length === 0) return [];

  const header = findHeaderRow(rows);

  if (header) {
    const collected: string[] = [];
    for (let i = header.idx + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      let ad = '';
      if (header.fullCol >= 0) {
        ad = cellStr(r[header.fullCol]);
      } else if (header.adCol >= 0 && header.soyadCol >= 0) {
        const a = cellStr(r[header.adCol]);
        const s = cellStr(r[header.soyadCol]);
        ad = [a, s].filter(Boolean).join(' ').trim();
      }
      if (ad && ad.length >= 2 && !isJunkCell(ad)) collected.push(ad);
    }
    return dedupe(collected);
  }

  // Başlıksız — her satır için strateji seç
  const collected: string[] = [];
  for (const r of rows) {
    const cells = (r ?? []).map(cellStr);
    if (cells.every(c => !c)) continue;

    const c0 = cells[0] ?? '';
    const firstIsNumber = /^\d+$/.test(c0);

    if (firstIsNumber) {
      // İlk sütun sıra no; ad+soyad genelde 1-2 veya 3-4'te
      const tryPairs = [[1, 2], [3, 4]];
      for (const [a, s] of tryPairs) {
        const av = cells[a] ?? '';
        const sv = cells[s] ?? '';
        if (av && sv && !isJunkCell(av) && !isJunkCell(sv)) {
          collected.push(`${av} ${sv}`.trim());
          break;
        }
        if (av && !sv && !isJunkCell(av) && av.split(' ').length >= 2) {
          collected.push(av);
          break;
        }
      }
    } else {
      if (c0 && c0.length >= 2 && !isJunkCell(c0)) collected.push(c0);
    }
  }
  return dedupe(collected);
}
