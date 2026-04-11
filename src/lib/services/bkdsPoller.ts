import { EventEmitter } from 'events';
import { prisma } from '@/lib/prisma';
import { getBkdsService } from './bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from './attendanceService';
import { generateAlerts } from './alertService';

export const bkdsEvents = new EventEmitter();
bkdsEvents.setMaxListeners(200);

const runningOrgs = new Set<string>();
const orgIntervals = new Map<string, ReturnType<typeof setInterval>>();

// Son poll sonucunun hash'i — aynıysa işlem atlanır
const lastPollHash = new Map<string, string>();

/** BKDS kaydı setinin değişim hash'i — individual_uuid + first_entry + last_exit */
function hashRecords(records: { individual_uuid: string; first_entry: string; last_exit?: string | null }[]): string {
  if (records.length === 0) return 'empty';
  return records
    .map(r => `${r.individual_uuid}|${r.first_entry}|${r.last_exit ?? ''}`)
    .sort()
    .join(';');
}

export async function runBkdsPollForOrg(organizationId: string): Promise<void> {
  if (runningOrgs.has(organizationId)) return;
  runningOrgs.add(organizationId);

  const t0 = Date.now();
  try {
    const service = getBkdsService(organizationId);
    const records = await service.fetchToday();

    // Hash kontrolü — BKDS verisi değişmediyse DB işlemlerini tamamen atla
    const hash = hashRecords(records);
    const prevHash = lastPollHash.get(organizationId);
    if (hash === prevHash) {
      return; // Değişiklik yok — sessizce çık
    }
    lastPollHash.set(organizationId, hash);

    console.log(`[BKDS Poll][${organizationId}] ${records.length} kayıt, değişiklik var (${Date.now() - t0}ms)`);

    const tarih = new Date();
    await service.saveAndAggregate(records, tarih);

    // Öğrenci ve personel hesaplamalarını paralel çalıştır
    await Promise.all([
      recalculateAttendance(tarih, organizationId),
      recalculateStaffAttendance(tarih, organizationId),
    ]);
    await generateAlerts(tarih, organizationId);

    bkdsEvents.emit('update', { organizationId });
    console.log(`[BKDS Poll][${organizationId}] Tamamlandı (${Date.now() - t0}ms toplam)`);
  } catch (err) {
    console.error(`[BKDS Poll][${organizationId}] Hata:`, err);
  } finally {
    runningOrgs.delete(organizationId);
  }
}

export function startPollingForOrg(organizationId: string, intervalMs: number): void {
  stopPollingForOrg(organizationId);
  console.log(`[BKDS Poll][${organizationId}] ${intervalMs}ms aralıkla başlatıldı`);
  runBkdsPollForOrg(organizationId); // İlk poll hemen çalışsın
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
  const interval = envInterval > 0 && !isNaN(envInterval) ? envInterval : 5000; // varsayılan 5s
  startPollingForOrg(organizationId, interval);
}

export async function startAllPollers(): Promise<void> {
  const envInterval = Number(process.env.BKDS_POLL_INTERVAL);
  const useEnv = envInterval > 0 && !isNaN(envInterval);

  const orgs = await prisma.organization.findMany({
    where: { active: true },
    include: { credentials: { select: { pollInterval: true } } },
  });

  for (const org of orgs) {
    const interval = useEnv ? envInterval : (org.credentials[0]?.pollInterval ?? 5000); // varsayılan 5s
    startPollingForOrg(org.id, interval);
  }
}

export function stopAllPollers(): void {
  for (const orgId of orgIntervals.keys()) {
    stopPollingForOrg(orgId);
  }
}
