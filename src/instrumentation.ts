export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAllPollers } = await import('@/lib/services/bkdsPoller');

    const tryStart = async (attempt: number = 1): Promise<void> => {
      try {
        await startAllPollers();
        console.log('[instrumentation] BKDS poller başlatıldı');
      } catch (err) {
        const delay = Math.min(attempt * 5000, 30000);
        console.error(`[instrumentation] Poller başlatılamadı (deneme ${attempt}), ${delay}ms sonra tekrar:`, (err as Error).message);
        setTimeout(() => tryStart(attempt + 1), delay);
      }
    };

    // DB bağlantısı için kısa bekle, sonra başlat
    setTimeout(() => tryStart(), 3000);
  }
}
