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

// 429 aldığında o kurum için backoff süresi (ms)
const backoffUntil = new Map<string, number>();
const backoffDelay = new Map<string, number>(); // mevcut bekleme süresi

const MIN_BACKOFF = 30_000;  // 30 saniye
const MAX_BACKOFF = 300_000; // 5 dakika

function hashRecords(records: { individual_uuid: string; first_entry: string; last_exit?: string | null }[]): string {
  if (records.length === 0) return 'empty';
  return records
    .map(r => `${r.individual_uuid}|${r.first_entry}|${r.last_exit ?? ''}`)
    .sort()
    .join(';');
}

export async function runBkdsPollForOrg(organizationId: string): Promise<void> {
  // Backoff süresi dolmadıysa atla
  const until = backoffUntil.get(organizationId) ?? 0;
  if (Date.now() < until) return;

  if (runningOrgs.has(organizationId)) return;
  runningOrgs.add(organizationId);

  const t0 = Date.now();
  try {
    const service = getBkdsService(organizationId);
    const records = await service.fetchToday();

    // Başarılı istek — backoff sıfırla
    backoffUntil.delete(organizationId);
    backoffDelay.delete(organizationId);

    const hash = hashRecords(records);
    if (hash === lastPollHash.get(organizationId)) {
      // Veri değişmedi — yine de "son kontrol" saatini client'a bildir
      bkdsEvents.emit('update', { organizationId, ekranData: null });
      return;
    }
    lastPollHash.set(organizationId, hash);

    const tarih = new Date();
    await service.saveAndAggregate(records, tarih);

    const ekranData = await getEkranData(organizationId);
    bkdsEvents.emit('update', { organizationId, ekranData });
    console.log(`[BKDS][${organizationId}] Ekran güncellendi (${Date.now() - t0}ms)`);

  } catch (err: any) {
    // 429 Too Many Requests → backoff uygula
    if (err?.message?.includes('429')) {
      const current = backoffDelay.get(organizationId) ?? MIN_BACKOFF;
      const next = Math.min(current * 2, MAX_BACKOFF);
      backoffDelay.set(organizationId, next);
      backoffUntil.set(organizationId, Date.now() + next);
      console.warn(`[BKDS Poll][${organizationId}] 429 alındı — ${next / 1000}s beklenecek`);
    } else {
      console.error(`[BKDS Poll][${organizationId}] Hata:`, err);
    }
    return;
  } finally {
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
  const interval = envInterval > 0 && !isNaN(envInterval) ? envInterval : 15000; // varsayılan 15s
  startPollingForOrg(organizationId, interval);
}

export async function startAllPollers(): Promise<void> {
  const envInterval = Number(process.env.BKDS_POLL_INTERVAL);
  const useEnv = envInterval > 0 && !isNaN(envInterval);
  const orgs = await prisma.organization.findMany({
    where: { active: true },
    include: { credentials: { select: { pollInterval: true } } },
  });
  // Kurumları 3 saniye aralıklı başlat — aynı anda API'ye çarpma
  for (let i = 0; i < orgs.length; i++) {
    const org = orgs[i];
    const interval = useEnv ? envInterval : (org.credentials[0]?.pollInterval ?? 15000);
    setTimeout(() => startPollingForOrg(org.id, interval), i * 3000);
  }
}

export function stopAllPollers(): void {
  for (const orgId of orgIntervals.keys()) stopPollingForOrg(orgId);
}
