import { describe, it, expect } from 'vitest';
import { normalizeName, normalizeDerslik } from '../utils/normalize';
import { calculateAttendanceStatus } from '../services/attendanceEngine';
import { calculateStaffStatus } from '../services/staffAttendanceEngine';

// ─── Normalize tests ───────────────────────────────────────────────────────

describe('normalizeName', () => {
  it('Türkçe karakterleri dönüştürür', () => {
    expect(normalizeName('Çiğdem Şahin')).toBe('cigdem sahin');
    expect(normalizeName('Ömer Güneş')).toBe('omer gunes');
    expect(normalizeName('Işık Ünal')).toBe('isik unal');
  });

  it('Büyük harf ve boşlukları normalize eder', () => {
    expect(normalizeName('  AHMET   YILMAZ  ')).toBe('ahmet yilmaz');
  });

  it('BKDS isim eşleşmesi için tutarlı çıktı üretir', () => {
    const lilaIsim = normalizeName('Mehmet Şahin');
    const bkdsIsim = normalizeName('MEHMET ŞAHİN');
    expect(lilaIsim).toBe(bkdsIsim);
  });
});

describe('normalizeDerslik', () => {
  it('Normal dersliği BKDS gerekli olarak işaretler', () => {
    const r = normalizeDerslik('Derslik 1');
    expect(r.bkdsRequired).toBe(true);
  });

  it('Evde Destek Eğitim dersliğini muaf tutar', () => {
    const r = normalizeDerslik('Evde Destek Eğitim');
    expect(r.bkdsRequired).toBe(false);
  });

  it('Büyük harfli evde destek eğitim de muaf olur', () => {
    const r = normalizeDerslik('EVDE DESTEK EĞİTİM');
    expect(r.bkdsRequired).toBe(false);
  });

  it('Kısmi eşleşmede de muaf olur', () => {
    const r = normalizeDerslik('Sınıf 3 - Evde Destek Eğitim');
    expect(r.bkdsRequired).toBe(false);
  });
});

// ─── Attendance Engine tests ───────────────────────────────────────────────

describe('calculateAttendanceStatus - BKDS muaf', () => {
  it('bkdsRequired false ise bkds_muaf döner', () => {
    const status = calculateAttendanceStatus({
      lesson: {
        baslangic: new Date('2024-01-15T09:00:00'),
        bitis: new Date('2024-01-15T10:00:00'),
        bkdsRequired: false,
      },
      now: new Date('2024-01-15T09:30:00'),
    });
    expect(status).toBe('bkds_muaf');
  });
});

describe('calculateAttendanceStatus - giriş yok', () => {
  const lesson = {
    baslangic: new Date('2024-01-15T09:00:00'),
    bitis: new Date('2024-01-15T10:00:00'),
    bkdsRequired: true,
  };

  it('Ders başlamadıysa bekleniyor', () => {
    const s = calculateAttendanceStatus({
      lesson,
      now: new Date('2024-01-15T08:55:00'),
    });
    expect(s).toBe('bekleniyor');
  });

  it('0-5 dk sonra hala bekleniyor', () => {
    const s = calculateAttendanceStatus({
      lesson,
      now: new Date('2024-01-15T09:03:00'),
    });
    expect(s).toBe('bekleniyor');
  });

  it('5-10 dk sonra gecikiyor', () => {
    const s = calculateAttendanceStatus({
      lesson,
      now: new Date('2024-01-15T09:07:00'),
    });
    expect(s).toBe('gecikiyor');
  });

  it('10-15 dk sonra giris_eksik', () => {
    const s = calculateAttendanceStatus({
      lesson,
      now: new Date('2024-01-15T09:12:00'),
    });
    expect(s).toBe('giris_eksik');
  });

  it('15+ dk sonra kritik', () => {
    const s = calculateAttendanceStatus({
      lesson,
      now: new Date('2024-01-15T09:20:00'),
    });
    expect(s).toBe('kritik');
  });
});

describe('calculateAttendanceStatus - giriş var', () => {
  const lesson = {
    baslangic: new Date('2024-01-15T09:00:00'),
    bitis: new Date('2024-01-15T10:00:00'),
    bkdsRequired: true,
  };

  it('Zamanında giriş (ders saatinde) → derste', () => {
    const s = calculateAttendanceStatus({
      lesson,
      bkdsGiris: new Date('2024-01-15T09:00:00'),
      now: new Date('2024-01-15T09:30:00'),
    });
    expect(s).toBe('derste');
  });

  it('Geç giriş → gec_geldi', () => {
    const s = calculateAttendanceStatus({
      lesson,
      bkdsGiris: new Date('2024-01-15T09:10:00'),
      now: new Date('2024-01-15T09:30:00'),
    });
    expect(s).toBe('gec_geldi');
  });

  it('Giriş var çıkış var ders bitti → tamamlandi', () => {
    const s = calculateAttendanceStatus({
      lesson,
      bkdsGiris: new Date('2024-01-15T09:02:00'),
      bkdsCikis: new Date('2024-01-15T10:05:00'),
      now: new Date('2024-01-15T10:15:00'),
    });
    expect(s).toBe('tamamlandi');
  });

  it('Ders bitti +10 dk çıkış yok → cikis_eksik', () => {
    const s = calculateAttendanceStatus({
      lesson,
      bkdsGiris: new Date('2024-01-15T09:02:00'),
      bkdsCikis: null,
      now: new Date('2024-01-15T10:15:00'), // bitis +15dk
    });
    expect(s).toBe('cikis_eksik');
  });
});

// ─── Staff Attendance Engine tests ─────────────────────────────────────────

describe('calculateStaffStatus', () => {
  const base = {
    baslangic: new Date('2024-01-15T09:00:00'),
    bitis: new Date('2024-01-15T10:00:00'),
    basladiMi: false,
    baslamaZamani: null,
  };

  it('Ders öncesi → bekleniyor', () => {
    const s = calculateStaffStatus({
      session: base,
      now: new Date('2024-01-15T08:50:00'),
    });
    expect(s).toBe('bekleniyor');
  });

  it('0-5 dk geçti işaret yok → bekleniyor', () => {
    const s = calculateStaffStatus({
      session: base,
      now: new Date('2024-01-15T09:03:00'),
    });
    expect(s).toBe('bekleniyor');
  });

  it('5-10 dk geçti işaret yok → gecikiyor', () => {
    const s = calculateStaffStatus({
      session: base,
      now: new Date('2024-01-15T09:07:00'),
    });
    expect(s).toBe('gecikiyor');
  });

  it('10+ dk geçti işaret yok → gelmedi', () => {
    const s = calculateStaffStatus({
      session: base,
      now: new Date('2024-01-15T09:15:00'),
    });
    expect(s).toBe('gelmedi');
  });

  it('Zamanında başladı → derste', () => {
    const s = calculateStaffStatus({
      session: {
        ...base,
        basladiMi: true,
        baslamaZamani: new Date('2024-01-15T09:02:00'),
      },
      now: new Date('2024-01-15T09:30:00'),
    });
    expect(s).toBe('derste');
  });

  it('Geç başladı → gec_basladi', () => {
    const s = calculateStaffStatus({
      session: {
        ...base,
        basladiMi: true,
        baslamaZamani: new Date('2024-01-15T09:10:00'),
      },
      now: new Date('2024-01-15T09:30:00'),
    });
    expect(s).toBe('gec_basladi');
  });
});
