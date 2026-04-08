import { prisma } from '@/lib/prisma';
import { getBkdsService } from './bkdsProviderService';
import { recalculateAttendance, recalculateStaffAttendance } from './attendanceService';
import { generateAlerts } from './alertService';

const runningOrgs = new Set<string>();
const orgIntervals = new Map<string, ReturnType<typeof setInterval>>();

export async function runBkdsPollForOrg(organizationId: string): Promise<void> {
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

    console.log(`[BKDS Poll][${organizationId}] Tamamlandı: ${new Date().toISOString()}`);
  } catch (err) {
    console.error(`[BKDS Poll][${organizationId}] Hata:`, err);
  } finally {
    runningOrgs.delete(organizationId);
  }
}

export function startPollingForOrg(organizationId: string, intervalMs: number = 60000): void {
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

export async function startAllPollers(): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { active: true },
    include: {
      bkdsCredential: { select: { pollInterval: true } },
    },
  });

  for (const org of orgs) {
    const interval = org.bkdsCredential?.pollInterval ?? Number(process.env.BKDS_POLL_INTERVAL ?? '60000');
    startPollingForOrg(org.id, interval);
  }
}

export function stopAllPollers(): void {
  for (const orgId of orgIntervals.keys()) {
    stopPollingForOrg(orgId);
  }
}
