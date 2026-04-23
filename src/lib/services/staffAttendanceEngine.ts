import type { StaffAttendanceStatus } from '@/lib/constants/enums';
import { minutesDiff } from '@/lib/utils/normalize';

interface StaffAttendanceInput {
  session: {
    baslangic: Date;
    bitis: Date;
    basladiMi: boolean;
    baslamaZamani?: Date | null;
  };
  now?: Date;
}

/**
 * Personel devamsızlık motoru
 */
export function calculateStaffStatus(input: StaffAttendanceInput): StaffAttendanceStatus {
  const { session, now = new Date() } = input;

  const dersBaslangic = new Date(session.baslangic);
  const dersBitis = new Date(session.bitis);

  // Ders henüz başlamamış
  if (now < dersBaslangic) {
    // BKDS girişi varsa (basladiMi=true) bekleniyor değil, derste say
    if (session.basladiMi) return 'derste';
    return 'bekleniyor';
  }

  // Ders bitti
  if (now > dersBitis) {
    if (session.basladiMi) return 'derste';
    return 'gelmedi';
  }

  // Ders zamanında
  if (session.basladiMi) {
    const baslamaDak = session.baslamaZamani
      ? minutesDiff(dersBaslangic, new Date(session.baslamaZamani))
      : 0;
    return baslamaDak > 5 ? 'gec_basladi' : 'derste';
  }

  const gecenDak = minutesDiff(dersBaslangic, now);
  if (gecenDak < 5) return 'bekleniyor';
  if (gecenDak < 10) return 'gecikiyor';
  return 'gelmedi';
}

export function getStaffStatusInfo(status: StaffAttendanceStatus) {
  const map: Record<StaffAttendanceStatus, { label: string; color: string; bg: string; border: string }> = {
    bekleniyor: { label: 'Bekleniyor', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
    derste: { label: 'Derste', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-300' },
    gelmedi: { label: 'Gelmedi', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300' },
    gec_basladi: { label: 'Geç Başladı', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300' },
    gecikiyor: { label: 'Gecikiyor', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  };
  return map[status] ?? map.bekleniyor;
}
