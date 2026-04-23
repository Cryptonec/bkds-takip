import type { AttendanceStatus } from '@/lib/constants/enums';
import { minutesDiff } from '@/lib/utils/normalize';

interface AttendanceInput {
  lesson: {
    baslangic: Date;
    bitis: Date;
    bkdsRequired: boolean;
  };
  bkdsGiris?: Date | null;
  bkdsCikis?: Date | null;
  now?: Date;
}

export function calculateAttendanceStatus(input: AttendanceInput): AttendanceStatus {
  const { lesson, bkdsGiris, bkdsCikis, now = new Date() } = input;

  if (!lesson.bkdsRequired) return 'bkds_muaf';

  const dersBaslangic = new Date(lesson.baslangic);
  const dersBitis = new Date(lesson.bitis);
  const gecenDakika = minutesDiff(dersBaslangic, now);

  if (now < dersBaslangic) return 'bekleniyor';

  if (!bkdsGiris) {
    if (gecenDakika < 5) return 'bekleniyor';
    if (gecenDakika < 10) return 'gecikiyor';
    if (gecenDakika < 15) return 'giris_eksik';
    return 'kritik';
  }

  // 1 saniye bile geç ise geç geldi
  const girisGecSaniye = (new Date(bkdsGiris).getTime() - dersBaslangic.getTime()) / 1000;
  const gecGeldi = girisGecSaniye > 0;

  // Erken çıkış: ders BAŞLANGICINDAN itibaren 40 dk geçmeden çıkış yapıldıysa
  const MIN_KALMA_DK = 40;

  if (bkdsCikis) {
    // Ders başlangıcından çıkışa kadar geçen süre
    const dersBasindanCikisaDk = minutesDiff(dersBaslangic, new Date(bkdsCikis));
    if (dersBasindanCikisaDk < MIN_KALMA_DK) return 'erken_cikis';
  }

  if (now > dersBitis) {
    const cikisGereken = new Date(dersBitis.getTime() + 10 * 60 * 1000);
    if (!bkdsCikis && now > cikisGereken) return 'cikis_eksik';
    if (bkdsCikis) return 'tamamlandi';
    return gecGeldi ? 'gec_geldi' : 'derste';
  }

  // Ders devam ediyor
  if (bkdsCikis) return 'erken_cikis'; // Ders bitmeden çıktıysa ve 40 dk dolmadıysa zaten yukarıda yakalandı
  return gecGeldi ? 'gec_geldi' : 'derste';
}

export function getAttendanceStatusInfo(status: AttendanceStatus) {
  const map: Record<AttendanceStatus, { label: string; color: string; bg: string; border: string }> = {
    bekleniyor:  { label: 'Bekleniyor',   color: 'text-gray-500',    bg: 'bg-gray-50',    border: 'border-gray-200' },
    gecikiyor:   { label: 'Gecikiyor',    color: 'text-yellow-700',  bg: 'bg-yellow-50',  border: 'border-yellow-300' },
    giris_eksik: { label: 'Giriş Eksik', color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-300' },
    kritik:      { label: 'Kritik',       color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-400' },
    gec_geldi:   { label: 'Geç Geldi',   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-300' },
    giris_tamam: { label: 'Derste',       color: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-300' },
    derste:      { label: 'Derste',       color: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-300' },
    cikis_eksik: { label: 'Çıkış Eksik', color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200' },
    erken_cikis: { label: 'Erken Çıktı', color: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-300' },
    tamamlandi:  { label: 'Tamamlandı',   color: 'text-green-700',   bg: 'bg-green-100',  border: 'border-green-300' },
    bkds_muaf:   { label: 'BKDS Muaf',   color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  };
  return map[status] ?? map.bekleniyor;
}
