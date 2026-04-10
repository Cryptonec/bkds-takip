import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bkdsEvents } from '@/lib/services/bkdsPoller';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Yetkisiz', { status: 401 });

  const organizationId = (session.user as any).organizationId as string | undefined;
  if (!organizationId) return new Response('Kurum bilgisi eksik', { status: 403 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (data: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); } catch {}
      };

      // Bağlantı kuruldu sinyali
      send('connected');

      // BKDS poller tamamlandığında anında bildir
      const onUpdate = ({ organizationId: updatedOrg }: { organizationId: string }) => {
        if (updatedOrg === organizationId) send('update');
      };
      bkdsEvents.on('update', onUpdate);

      // Bağlantıyı canlı tut
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(': \n\n')); } catch {}
      }, 15000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        bkdsEvents.off('update', onUpdate);
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
