import { BkdsProviderService } from './bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from './attendanceService';
import { generateAlerts } from './alertService';
import { prisma } from '@/lib/prisma';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Tek bir kurum için BKDS poll döngüsü çalıştır.
 */
export async function runBkdsPollForOrg(organizationId: string): Promise<void> {
  const tarih = new Date();
  console.log(`[BKDS Poll] Org ${organizationId} başlatıldı: ${tarih.toISOString()}`);

  try {
    const service = await BkdsProviderService.forOrganization(organizationId);
    const records = await service.fetchToday();
    console.log(`[BKDS Poll] Org ${organizationId}: ${records.length} kayıt çekildi`);

    await service.saveAndAggregate(records, tarih);
    await recalculateAttendance(tarih, organizationId);
    await recalculateStaffAttendance(tarih, organizationId);
    await generateAlerts(tarih, organizationId);

    console.log(`[BKDS Poll] Org ${organizationId} tamamlandı: ${new Date().toISOString()}`);
  } catch (err) {
    console.error(`[BKDS Poll] Org ${organizationId} hata:`, err);
  }
}

/**
 * Tüm aktif kurumlar için poll döngüsü.
 */
export async function runBkdsPoll(): Promise<void> {
  if (isRunning) {
    console.log('[BKDS Poll] Önceki çalışma devam ediyor, atlıyor...');
    return;
  }

  isRunning = true;
  try {
    const orgs = await prisma.organization.findMany({
      where: { active: true },
      include: { credentials: true },
    });

    const activeOrgs = orgs.filter(o => o.credentials !== null);
    console.log(`[BKDS Poll] ${activeOrgs.length} aktif kurum için poll başlatıldı`);

    await Promise.allSettled(activeOrgs.map(o => runBkdsPollForOrg(o.id)));
  } catch (err) {
    console.error('[BKDS Poll] Genel hata:', err);
  } finally {
    isRunning = false;
  }
}

export function startPolling(intervalMs?: number): void {
  const interval = intervalMs ?? Number(process.env.BKDS_POLL_INTERVAL ?? '60000');

  if (pollInterval) clearInterval(pollInterval);

  console.log(`[BKDS Poll] Polling başlatıldı (${interval}ms aralık)`);
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
