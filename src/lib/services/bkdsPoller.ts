import { EventEmitter } from 'events';
import { prisma } from '@/lib/prisma';
import { getBkdsService } from './bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from './attendanceService';
import { generateAlerts } from './alertService';

// Poller tamamlandığında SSE endpoint'leri uyarır
export const bkdsEvents = new EventEmitter();
bkdsEvents.setMaxListeners(200); // Çok sayıda eş zamanlı SSE bağlantısı için

const runningOrgs = new Set<string>();
const orgIntervals = new Map<string, ReturnType<typeof setInterval>>();

export async function runBkdsPollForOrg(organizationId: string): Promise<void> {
  if (runningOrgs.has(organizationId)) return;

  runningOrgs.add(organizationId);
  const tarih = new Date();

  try {
    const service = getBkdsService(organizationId);
    const records = await service.fetchToday();
    console.log(`[BKDS Poll][${organizationId}] ${records.length} kayıt`);

    await service.saveAndAggregate(records, tarih);
    await recalculateAttendance(tarih, organizationId);
    await recalculateStaffAttendance(tarih, organizationId);
    await generateAlerts(tarih, organizationId);

    // Bağlı ekranlara "veri hazır" sinyali gönder
    bkdsEvents.emit('update', { organizationId });
  } catch (err) {
    console.error(`[BKDS Poll][${organizationId}] Hata:`, err);
  } finally {
    runningOrgs.delete(organizationId);
  }
}

export function startPollingForOrg(organizationId: string, intervalMs: number): void {
  stopPollingForOrg(organizationId);
  console.log(`[BKDS Poll][${organizationId}] ${intervalMs}ms aralıkla başlatıldı`);
  runBkdsPollForOrg(organizationId);
  const handle = setInterval(() => runBkdsPollForOrg(organizationId), intervalMs);
  orgIntervals.set(organizationId, handle);
}

export function stopPollingForOrg(organizationId: string): void {
  const handle = orgIntervals.get(organizationId);
  if (handle) {
    clearInterval(handle);
    orgIntervals.delete(organizationId);
  }
}

export function isPollingActive(organizationId: string): boolean {
  return orgIntervals.has(organizationId);
}

export async function ensurePollerRunning(organizationId: string): Promise<void> {
  if (isPollingActive(organizationId)) return;
  const envInterval = Number(process.env.BKDS_POLL_INTERVAL);
  const interval = (envInterval > 0 && !isNaN(envInterval)) ? envInterval : 10000;
  startPollingForOrg(organizationId, interval);
}

export async function startAllPollers(): Promise<void> {
  // BKDS_POLL_INTERVAL env değişkeni DB değerinden önce gelir
  const envInterval = Number(process.env.BKDS_POLL_INTERVAL);
  const useEnv = envInterval > 0 && !isNaN(envInterval);

  const orgs = await prisma.organization.findMany({
    where: { active: true },
    include: { credentials: { select: { pollInterval: true } } },
  });

  for (const org of orgs) {
    const interval = useEnv ? envInterval : (org.credentials[0]?.pollInterval ?? 10000);
    startPollingForOrg(org.id, interval);
  }
}

export function stopAllPollers(): void {
  for (const orgId of orgIntervals.keys()) {
    stopPollingForOrg(orgId);
  }
}
