export async function register() {
  // Sadece Node.js runtime'da çalış (Edge runtime'da değil)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAllPollers } = await import('@/lib/services/bkdsPoller');
    // DB hazır olana kadar kısa bekle (Docker'da migrate tamamlanmış ama bağlantı kurulmuyor olabilir)
    setTimeout(() => {
      startAllPollers().catch(err =>
        console.error('[instrumentation] BKDS poller başlatılamadı:', err)
      );
    }, 5000);
  }
}
