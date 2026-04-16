import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getOrgId } from '@/lib/auth';
import { getLiveAttendance, getLiveStaffAttendance } from '@/lib/services/attendanceService';
import { getActiveAlerts } from '@/lib/services/alertService';

const HEARTBEAT_INTERVAL_MS = 10_000; // 10s ping

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Yetkisiz' }), { status: 401 });
  }

  const orgId = await getOrgId(session);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          closed = true;
        }
      };

      // İlk veriyi hemen gönder
      try {
        const tarih = new Date();
        const [ogrenciRows, personelRows, alerts] = await Promise.all([
          getLiveAttendance(tarih, orgId),
          getLiveStaffAttendance(tarih, orgId),
          getActiveAlerts(tarih, orgId),
        ]);
        send({ type: 'data', ogrenciRows, personelRows, alerts, ts: Date.now() });
      } catch (err) {
        console.error('[SSE] İlk veri hatası:', err);
        send({ type: 'ping', ts: Date.now() });
      }

      // Heartbeat — istemci bağlı mı belli olsun
      const heartbeat = setInterval(() => {
        send({ type: 'ping', ts: Date.now() });
      }, HEARTBEAT_INTERVAL_MS);

      // Bağlantı kesilince temizle
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
