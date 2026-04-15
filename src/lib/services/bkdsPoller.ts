import { EventEmitter } from 'events';
import { prisma } from '@/lib/prisma';
import { getBkdsService } from './bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from './attendanceService';
import { generateAlerts } from './alertService';
import { getEkranData } from './ekranDataService';

export const bkdsEvents = new EventEmitter();
bkdsEvents.setMaxListeners(200);

const runningOrgs = new Set<string>();
const orgIntervals = new Map<string, ReturnType<typeof setInterval>>();
const lastPollHash = new Map<string, string>();

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

    const hash = hashRecords(records);
    if (hash === lastPollHash.get(organizationId)) {
      // Veri değişmedi — yine de "son kontrol" saatini client'a bildir
      bkdsEvents.emit('update', { organizationId, ekranData: null });
      return;
    }
    lastPollHash.set(organizationId, hash);

    const tarih = new Date();
    await service.saveAndAggregate(records, tarih);

    // ── HIZLI YOL: ekranı hemen bildir ──────────────────────────────────
    // saveAndAggregate BkdsAggregate + BkdsPersonelLog'u güncelledi.
    // Ekran verisini hemen sorgula ve SSE ile push et — client fetch yapmak zorunda kalmaz.
    const ekranData = await getEkranData(organizationId);
    bkdsEvents.emit('update', { organizationId, ekranData });
    console.log(`[BKDS][${organizationId}] Ekran güncellendi (${Date.now() - t0}ms)`);

  } catch (err) {
    console.error(`[BKDS Poll][${organizationId}] Hata:`, err);
    return;
  } finally {
    // Poll kilidi burada serbest bırakılır — recalculate beklenmez
    runningOrgs.delete(organizationId);
  }

  // ── ARKA PLAN: devamsızlık hesapları (ekranı bloke etmez) ────────────
  const tarih = new Date();
  Promise.all([
    recalculateAttendance(tarih, organizationId),
    recalculateStaffAttendance(tarih, organizationId),
  ])
    .then(() => generateAlerts(tarih, organizationId))
    .catch(err => console.error(`[BKDS][${organizationId}] Recalculate hatası:`, err));
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
  if (handle) { clearInterval(handle); orgIntervals.delete(organizationId); }
}

export function isPollingActive(organizationId: string): boolean {
  return orgIntervals.has(organizationId);
}

export async function ensurePollerRunning(organizationId: string): Promise<void> {
  if (isPollingActive(organizationId)) return;
  const envInterval = Number(process.env.BKDS_POLL_INTERVAL);
  const interval = envInterval > 0 && !isNaN(envInterval) ? envInterval : 2000; // varsayılan 2s
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
    const interval = useEnv ? envInterval : (org.credentials[0]?.pollInterval ?? 2000); // varsayılan 2s
    startPollingForOrg(org.id, interval);
  }
}

export function stopAllPollers(): void {
  for (const orgId of orgIntervals.keys()) stopPollingForOrg(orgId);
}
