import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tr.rehapp.bkdstakip',
  appName: 'BKDS Takip',
  webDir: 'www',
  server: {
    // Yerel ağdaki Next.js sunucusuna yönlendir
    // Gerçek IP/port için www/js/config.js dosyasını düzenleyin
    url: 'http://192.168.1.100:3000/ekran',
    cleartext: true,        // HTTP'ye izin ver (yerel ağ)
    allowNavigation: [
      '192.168.*.*',
      '10.*.*.*',
      '172.16.*.*',
      'rehapp.com.tr',
      '*.rehapp.com.tr',
    ],
  },
  android: {
    allowMixedContent: true,  // HTTP + HTTPS karışık içerik
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
