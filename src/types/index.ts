import type { AttendanceStatus, StaffAttendanceStatus, AlertSeverity, Role } from '@/lib/constants/enums';

export type { AttendanceStatus, StaffAttendanceStatus, AlertSeverity, Role };

export interface AttendanceStatusInfo {
  status: AttendanceStatus;
  color: 'green' | 'yellow' | 'red' | 'gray' | 'blue';
  label: string;
  icon: string;
}

export interface StaffAttendanceStatusInfo {
  status: StaffAttendanceStatus;
  color: 'green' | 'yellow' | 'red' | 'gray';
  label: string;
}

export interface LiveAttendanceRow {
  lessonSessionId: string;
  ogrenciAdi: string;
  ogrenciId: string;
  ogretmenAdi: string;
  derslik: string;
  baslangic: Date;
  bitis: Date;
  status: AttendanceStatus;
  girisZamani?: Date;
  cikisZamani?: Date;
  bkdsRequired: boolean;
}

export interface LiveStaffRow {
  staffSessionId: string;
  ogretmenAdi: string;
  staffId: string;
  derslik: string;
  baslangic: Date;
  bitis: Date;
  status: StaffAttendanceStatus;
  basladiMi: boolean;
}

export interface DashboardStats {
  tarih: string;
  toplamDers: number;
  bkdsGerekli: number;
  bkdsMuaf: number;
  girisEksik: number;
  cikisEksik: number;
  personelGelmeyen: number;
  tamamlanan: number;
}

export interface LilaImportRow {
  ogrenciAdi: string;
  ogretmenAdi: string;
  tarih: string;
  baslangicSaati: string;
  bitisSaati: string;
  derslik: string;
}

export interface BkdsRecord {
  adSoyad: string;
  maskedTc?: string;
  tarih: Date;
  girisZamani: Date;
  cikisZamani?: Date;
}

export interface BkdsAggregateResult {
  adSoyad: string;
  tarih: Date;
  ilkGiris: Date;
  sonCikis?: Date;
}
