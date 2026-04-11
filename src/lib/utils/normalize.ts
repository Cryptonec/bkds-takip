/**
 * Türkçe karakter normalizasyonu
 * ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Derslik adını normalize eder ve "evde destek eğitim" kontrolü yapar
 */
export function normalizeDerslik(derslik: string): {
  normalized: string;
  bkdsRequired: boolean;
} {
  const normalized = derslik
    .toLowerCase()
    .trim()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');

  const bkdsRequired = !normalized.includes('evde destek egitim');

  return { normalized, bkdsRequired };
}

/**
 * İsim benzerlik skoru (fuzzy match için)
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  
  // Levenshtein distance
  const m = na.length, n = nb.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = na[i-1] === nb[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  const maxLen = Math.max(m, n);
  return maxLen === 0 ? 1 : 1 - dp[m][n] / maxLen;
}

/**
 * Tarih + saat birleştir (Excel'den gelen string için)
 */
export function parseTarihSaat(tarih: string, saat: string): Date {
  // tarih: "DD.MM.YYYY" veya "YYYY-MM-DD"
  // saat: "HH:MM" veya "HH:MM:SS"
  let datePart = tarih.trim();
  const saatPart = saat.trim();

  // DD.MM.YYYY → YYYY-MM-DD
  if (datePart.includes('.')) {
    const [d, m, y] = datePart.split('.');
    datePart = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  return new Date(`${datePart}T${saatPart}:00`);
}

/**
 * Bugünün tarihini YYYY-MM-DD formatında döner
 */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Dakika farkı hesapla
 */
export function minutesDiff(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}

/**
 * BKDS maskeli ismi (MEH*****AYA) ile tam ismi (MEHMET KAYA) eşleştirir
 * Algoritma: prefix + suffix kontrolü + uzunluk uyumu
 */
export function matchMaskedName(masked: string, full: string): boolean {
  if (!masked || !full) return false;
  if (!masked.includes('*')) {
    // Maskeleme yoksa direkt karşılaştır
    return normalizeName(masked) === normalizeName(full);
  }

  const starStart = masked.indexOf('*');
  const starEnd = masked.lastIndexOf('*');

  const prefix = masked.slice(0, starStart).toUpperCase();
  const suffix = masked.slice(starEnd + 1).toUpperCase();

  // Boşluksuz tam isim
  const fullClean = full.replace(/\s+/g, '').toUpperCase()
    .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U');

  // prefix/suffix de boşluk ve Türkçe karakter normalize edilmeli
  const prefixNorm = prefix
    .replace(/\s+/g, '')
    .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U');

  const suffixNorm = suffix
    .replace(/\s+/g, '')
    .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U');

  if (!fullClean.startsWith(prefixNorm)) return false;
  if (suffixNorm && !fullClean.endsWith(suffixNorm)) return false;
  if (fullClean.length < prefixNorm.length + suffixNorm.length) return false;

  return true;
}

/**
 * Sadece prefix ile eşleştir (soyisim değişikliği için)
 * masked: AYŞ***ÇELİK → prefix: AYŞ
 * full: AYŞE DEMİR → prefix: AYŞ ✓
 * Skoru döner: 1.0 = tam eşleşme, 0.5 = sadece prefix, 0 = eşleşme yok
 */
export function matchMaskedNameFuzzy(masked: string, full: string): {
  score: number;
  type: 'tam_eslesme' | 'prefix_eslesme' | 'eslesme_yok';
} {
  if (!masked || !full) return { score: 0, type: 'eslesme_yok' };

  // Önce tam eşleştirmeyi dene
  if (matchMaskedName(masked, full)) {
    return { score: 1.0, type: 'tam_eslesme' };
  }

  // Yıldız yoksa direkt karşılaştır
  if (!masked.includes('*')) {
    return normalizeName(masked) === normalizeName(full)
      ? { score: 1.0, type: 'tam_eslesme' }
      : { score: 0, type: 'eslesme_yok' };
  }

  // Sadece prefix eşleştir (soyisim değişikliği senaryosu)
  const starIdx = masked.indexOf('*');
  const prefix = masked.slice(0, starIdx).toUpperCase()
    .replace(/\s+/g, '')
    .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U');

  const fullClean = full.replace(/\s+/g, '').toUpperCase()
    .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U');

  if (prefix.length >= 3 && fullClean.startsWith(prefix)) {
    return { score: 0.5, type: 'prefix_eslesme' };
  }

  return { score: 0, type: 'eslesme_yok' };
}
