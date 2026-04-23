/**
 * Enum sabitleri — SQLite native enum desteklemediği için schema'da String
 * olarak saklanıyor. TypeScript tarafında union type'larla güvenlik sağlanır.
 */

export const ROLES = ['superadmin', 'admin', 'yonetici', 'danisma'] as const;
export type Role = typeof ROLES[number];

export const ATTENDANCE_STATUSES = [
  'bekleniyor',
  'gecikiyor',
  'giris_eksik',
  'kritik',
  'gec_geldi',
  'giris_tamam',
  'cikis_eksik',
  'tamamlandi',
  'bkds_muaf',
  'erken_cikis',
  'derste',
] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

export const STAFF_ATTENDANCE_STATUSES = [
  'bekleniyor',
  'derste',
  'gelmedi',
  'gec_basladi',
  'gecikiyor',
] as const;
export type StaffAttendanceStatus = typeof STAFF_ATTENDANCE_STATUSES[number];

export const ALERT_SEVERITIES = ['normal', 'uyari', 'kritik'] as const;
export type AlertSeverity = typeof ALERT_SEVERITIES[number];

export const IMPORT_STATUSES = ['bekliyor', 'isleniyor', 'tamamlandi', 'hata'] as const;
export type ImportStatus = typeof IMPORT_STATUSES[number];

export const SUBSCRIPTION_STATUSES = ['aktif', 'pasif', 'deneme', 'iptal'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];
