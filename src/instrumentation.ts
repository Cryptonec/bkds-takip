/**
 * Next.js Instrumentation — sunucu başlarken bir kez çalışır.
 * BKDS poller'larını burada başlatıyoruz.
 */
export async function register() {
  // Yalnızca Node.js runtime'da çalış (Edge runtime'da Prisma yok)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { startAllPollers } = await import('@/lib/services/bkdsPoller');
      await startAllPollers();
    } catch (err) {
      // Poller hatası sunucuyu durdurmamalı — DB hazır olmayabilir
      console.error('[Instrumentation] BKDS poller başlatılamadı:', err);
    }
  }
}
