import { bkdsProviderService } from './bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from './attendanceService';
import { generateAlerts } from './alertService';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export async function runBkdsPoll(): Promise<void> {
  if (isRunning) {
    console.log('[BKDS Poll] Önceki çalışma devam ediyor, atlıyor...');
    return;
  }

  isRunning = true;
  const tarih = new Date();
  console.log(`[BKDS Poll] Başlatıldı: ${tarih.toISOString()}`);

  try {
    // 1. BKDS'den veri çek
    const records = await bkdsProviderService.fetchToday();
    console.log(`[BKDS Poll] ${records.length} kayıt çekildi`);

    // 2. DB'ye kaydet ve aggregate et
    await bkdsProviderService.saveAndAggregate(records, tarih);

    // 3. Attendance yeniden hesapla
    await recalculateAttendance(tarih);
    await recalculateStaffAttendance(tarih);

    // 4. Alert üret
    await generateAlerts(tarih);

    console.log(`[BKDS Poll] Tamamlandı: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[BKDS Poll] Hata:', err);
  } finally {
    isRunning = false;
  }
}

export function startPolling(intervalMs?: number): void {
  const interval = intervalMs ?? Number(process.env.BKDS_POLL_INTERVAL ?? '60000');

  if (pollInterval) {
    clearInterval(pollInterval);
  }

  console.log(`[BKDS Poll] Polling başlatıldı (${interval}ms aralık)`);

  // Hemen bir kez çalıştır
  runBkdsPoll();

  pollInterval = setInterval(runBkdsPoll, interval);
}

export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[BKDS Poll] Polling durduruldu');
  }
}
