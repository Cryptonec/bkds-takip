import { prisma } from '@/lib/prisma';
import { getBkdsService } from './bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from './attendanceService';
import { generateAlerts } from './alertService';

// Per-org poll durumu
const runningOrgs = new Set<string>();
const orgIntervals = new Map<string, ReturnType<typeof setInterval>>();

// ──────────────────────────────────────────────
// Global backoff — BKDS IP bazlı rate limit
// Herhangi bir kurum 429 alırsa TÜM kurumlar durur.
// ──────────────────────────────────────────────
const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 240_000, 300_000]; // max 5dk
let globalBackoffLevel = 0;
let globalBackoffUntil = 0;

function isGlobalBackoff(): boolean {
  return Date.now() < globalBackoffUntil;
}

function escalateBackoff(orgId: string): void {
  const delay = BACKOFF_STEPS_MS[Math.min(globalBackoffLevel, BACKOFF_STEPS_MS.length - 1)];
  globalBackoffUntil = Date.now() + delay;
  globalBackoffLevel = Math.min(globalBackoffLevel + 1, BACKOFF_STEPS_MS.length - 1);
  console.warn(`[BKDS Backoff][${orgId}] 429 — tüm kurumlar ${delay / 1000}s bekliyor (seviye ${globalBackoffLevel})`);
}

function resetBackoff(): void {
  if (globalBackoffLevel > 0) {
    console.log('[BKDS Backoff] Başarılı istek — backoff sıfırlandı');
    globalBackoffLevel = 0;
    globalBackoffUntil = 0;
  }
}

// ──────────────────────────────────────────────
// Tek kurum için poll
// ──────────────────────────────────────────────
export async function runBkdsPollForOrg(organizationId: string): Promise<void> {
  if (isGlobalBackoff()) {
    const kalan = Math.ceil((globalBackoffUntil - Date.now()) / 1000);
    console.log(`[BKDS Poll][${organizationId}] Global backoff aktif, ${kalan}s kaldı — atlıyor`);
    return;
  }

  if (runningOrgs.has(organizationId)) {
    console.log(`[BKDS Poll][${organizationId}] Önceki çalışma devam ediyor, atlıyor...`);
    return;
  }

  runningOrgs.add(organizationId);
  const tarih = new Date();
  console.log(`[BKDS Poll][${organizationId}] Başlatıldı: ${tarih.toISOString()}`);

  try {
    const service = getBkdsService(organizationId);
    const records = await service.fetchToday();
    console.log(`[BKDS Poll][${organizationId}] ${records.length} kayıt çekildi`);

    await service.saveAndAggregate(records, tarih);
    await recalculateAttendance(tarih, organizationId);
    await recalculateStaffAttendance(tarih, organizationId);
    await generateAlerts(tarih, organizationId);

    resetBackoff();
    console.log(`[BKDS Poll][${organizationId}] Tamamlandı: ${new Date().toISOString()}`);
  } catch (err: any) {
    // 429 → global backoff
    const status = err?.status ?? err?.response?.status;
    if (status === 429) {
      escalateBackoff(organizationId);
    } else {
      console.error(`[BKDS Poll][${organizationId}] Hata:`, err);
    }
  } finally {
    runningOrgs.delete(organizationId);
  }
}

export function startPollingForOrg(organizationId: string, intervalMs: number = 30_000): void {
  stopPollingForOrg(organizationId);

  console.log(`[BKDS Poll][${organizationId}] Polling başlatıldı (${intervalMs}ms aralık)`);
  runBkdsPollForOrg(organizationId);

  const handle = setInterval(() => runBkdsPollForOrg(organizationId), intervalMs);
  orgIntervals.set(organizationId, handle);
}

export function stopPollingForOrg(organizationId: string): void {
  const handle = orgIntervals.get(organizationId);
  if (handle) {
    clearInterval(handle);
    orgIntervals.delete(organizationId);
    console.log(`[BKDS Poll][${organizationId}] Polling durduruldu`);
  }
}

/**
 * Tüm aktif & aboneliği geçerli kurumlar için polling başlat.
 * Kurumlar 3'er saniye aralıklı başlatılır — BKDS'e aynı anda çarpmayı önler.
 */
export async function startAllPollers(): Promise<void> {
  let orgs: any[];

  try {
    orgs = await prisma.organization.findMany({
      where: { active: true },
      include: {
        bkdsCredential: { select: { pollInterval: true } },
        subscription: { select: { status: true } },
      },
    });
  } catch {
    // Subscription tablosu henüz DB'de yok — abonelik kontrolü olmadan çalıştır
    orgs = await prisma.organization.findMany({
      where: { active: true },
      include: {
        bkdsCredential: { select: { pollInterval: true } },
      },
    });
  }

  let delay = 0;
  for (const org of orgs) {
    const sub = (org as any).subscription;
    const subOk = !sub || ['aktif', 'deneme'].includes(sub.status);
    if (!subOk) continue;

    const interval = org.bkdsCredential?.pollInterval
      ?? Number(process.env.BKDS_POLL_INTERVAL ?? '30000');

    setTimeout(() => startPollingForOrg(org.id, interval), delay);
    delay += 3000;
  }
}

export function stopAllPollers(): void {
  for (const orgId of orgIntervals.keys()) {
    stopPollingForOrg(orgId);
  }
}
