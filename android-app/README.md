# BKDS Takip — Android Tablet APK

Capacitor tabanlı Android kiosk uygulaması. Yerel ağdaki Next.js sunucusuna bağlanarak `/ekran` sayfasını tam ekran gösterir.

## Hızlı Kurulum

```bash
cd android-app
npm install
bash setup.sh          # Sunucu IP'si sorar, yamaları uygular
npx cap add android
npx cap sync android
npx cap open android   # Android Studio ile aç → APK üret
```

## Yapılandırma

Sunucu IP/port'u değiştirmek için `www/js/config.js` dosyasını düzenleyin:

```js
window.BKDS_CONFIG = {
  SERVER_URL: 'http://192.168.1.50:3000',  // ← kurumunuzun sunucu adresi
};
```

Değişiklikten sonra `npx cap sync android` çalıştırın.

## Giriş Akışı

```
Tablet açılır
  → index.html sunucuya bağlanmayı dener
  → Bağlantı kurulunca /ekran'a yönlendirir
  → Oturum yoksa → /giris
  → "Rehapp ile Giriş Yap" → rehapp.com.tr
  → Rehapp SSO → BKDS /ekran (otomatik giriş)
```

## Kiosk Özellikleri

- Yatay mod (landscape) zorunlu
- Wake Lock — ekran kapanmaz
- `keepScreenOn` — sistem tarafından da korunur
- Tam ekran desteği (Fullscreen API)

## Dosya Yapısı

```
android-app/
├── package.json              Capacitor bağımlılıkları
├── capacitor.config.ts       Uygulama yapılandırması
├── setup.sh                  Kurulum ve yama betiği
├── www/
│   ├── index.html            Yükleme ekranı (sunucuya bağlanır)
│   └── js/
│       └── config.js         Sunucu URL yapılandırması
└── patches/
    └── network_security_config.xml   HTTP yerel ağ izni
```
