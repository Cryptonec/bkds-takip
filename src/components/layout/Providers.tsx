'use client';
import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';

/**
 * ChunkLoadError otomatik recovery — Next.js dev'de uzun calisan dev server
 * eski chunk hash'lerini eskittiginde tarayici yeni chunk'i bulamaz, timeout
 * verir. Ayni isim production build'de de nadir olarak (deploy sirasinda
 * eski tab acik kalmissa) gorulebilir. Hata yakalanip otomatik reload
 * yapilir; kullanici 'tekrar dene' diye ugrasmasin.
 */
function useChunkErrorRecovery() {
  useEffect(() => {
    const handler = (e: ErrorEvent | PromiseRejectionEvent) => {
      const err = (e as any).reason ?? (e as any).error ?? e;
      const msg = err?.message ?? err?.toString?.() ?? '';
      if (
        err?.name === 'ChunkLoadError' ||
        /Loading chunk [\w/-]+ failed/i.test(msg) ||
        /Loading CSS chunk/i.test(msg)
      ) {
        const key = 'chunk-error-reload-ts';
        const last = Number(sessionStorage.getItem(key) ?? '0');
        // 10sn icinde 2 kez olursa tekrar yukleme — sonsuz dongu olmasin
        if (Date.now() - last < 10_000) return;
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    };
    window.addEventListener('error', handler);
    window.addEventListener('unhandledrejection', handler);
    return () => {
      window.removeEventListener('error', handler);
      window.removeEventListener('unhandledrejection', handler);
    };
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useChunkErrorRecovery();
  return <SessionProvider>{children}</SessionProvider>;
}
