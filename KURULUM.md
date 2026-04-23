# BKDS Takip — Pilot Kurulum Rehberi

Bu doküman uygulamayı **başka bir bilgisayarda** (geliştirme yapılmayan iş bilgisayarı gibi) pilot olarak çalıştırmak için hazırlanmıştır.

---

## Bir kerelik hazırlık

### 1. Bilgisayarın karşılaması gerekenler

- **Windows 10 veya 11**
- **Node.js 20+** — <https://nodejs.org/tr/download> → "LTS" sürümünü indir, Next > Next > Install
- **Git** (opsiyonel, kod taşımak için) — <https://git-scm.com/download/win>

Doğru kurulduğunu kontrol et (CMD veya PowerShell aç):
```
node --version    → v20.x.x veya üzeri görmeli
npm --version     → 10.x.x civarı görmeli
```

### 2. Kodu bu bilgisayara getir

İki yoldan biri:

**A) Git ile** (internet varsa):
```
git clone <repo-url> C:\bkds-takip
cd C:\bkds-takip
```

**B) USB/ağ ile**: Geliştirme bilgisayarındaki `bkds-takip` klasörünü (içinde `.env`, `package.json` olan) USB'ye kopyala, hedef bilgisayara yapıştır. Örnek hedef: `C:\bkds-takip`.

> **Önemli:** `.env` dosyası BRY kullanıcı adı/şifre ve IP adresi içerir. Bunu mutlaka taşıdığından emin ol.

### 3. Aynı wifi'de olduğundan emin ol

- Bu bilgisayar BRY'nin bulunduğu **aynı kurum ağında/wifi'sinde** olmalı
- Test: tarayıcıda `http://192.168.1.154:3000/` açılıyor mu kontrol et (BRY panelini görmelisin)

### 4. Kurulum scriptini çalıştır

`C:\bkds-takip` klasörüne gir, **`kur.bat`** dosyasına çift tıkla. Script şunları yapar otomatik:

1. `npm install` — paketleri indirir (~2-5 dk, internet gerekir)
2. `npx prisma generate` — Prisma client üretir
3. `npx prisma db push` — SQLite DB dosyası (dev.db) oluşturur, şemayı uygular
4. `npx prisma db seed` — demo admin hesabı + kurum kaydı
5. `npm run build` — production build
6. PM2 kurar ve servis olarak başlatır

Bittiğinde tarayıcıdan `http://localhost:3000` aç. Giriş:
- **admin@kurum.com / admin123** — demo kurum hesabı
- **superadmin@bkdstakip.com / admin123** — süper admin

---

## Günlük kullanım

### Açılış

Uygulama bilgisayar açılışında **otomatik başlar** (PM2 startup sayesinde). Tarayıcıdan `http://localhost:3000` aç, giriş yap.

Çalışmıyorsa `baslat.bat`'a çift tıkla — PM2 servisini yeniden başlatır.

### Sabah rutini

1. `http://localhost:3000/canli` aç
2. "Bugünün yoklama listesi yüklenmemiş" modalı çıkarsa → **Yoklama Yükle** butonuna bas
3. Lila'dan indirdiğin Excel'i yükle
4. Geri dön, canlı takip aktif

### Bildirim ekranı (TV/monitör için)

1. `http://localhost:3000/ekran` aç
2. Sağ üstteki **tam ekran** butonu — büyük ekran modu
3. Yoklama yüklü olmasa bile çalışır (ham BKDS'yi kullanır)

---

## Sorun giderme

### "Cannot connect to localhost:3000"
```
# CMD aç, proje klasörüne gir
cd C:\bkds-takip
pm2 status
# Eğer "bkds-takip" listede yoksa:
pm2 start npm --name bkds-takip -- start
pm2 save
```

### BKDS verileri gelmiyor
- Aynı wifi'de olduğunu doğrula
- `http://192.168.1.154:3000` browser'dan açılıyor mu?
- Ayarlar'dan BKDS kullanıcı adı/şifresi doğru mu?

### Uygulamayı durdurmak
```
pm2 stop bkds-takip
```

### Uygulamayı yeniden başlatmak
```
pm2 restart bkds-takip
```

### Log'ları görmek
```
pm2 logs bkds-takip
```

### Tamamen kaldırmak
```
pm2 delete bkds-takip
pm2 save
```

---

## Sık sorulanlar

**Bilgisayarı kapatırsam ne olur?**
Uygulama da kapanır. Tekrar açınca PM2 otomatik başlatır. Bilgisayar kapalıysa erişilemez.

**İkinci bir bilgisayardan da açabilir miyim?**
Evet. Uygulamanın çalıştığı bilgisayarın yerel IP'sini öğren (örn. `192.168.1.50`), diğer cihazdan `http://192.168.1.50:3000` yaz. Windows Firewall'da Node.js için gelen bağlantıya izin ver.

**Veri yedekleme?**
Tüm veri `C:\bkds-takip\prisma\dev.db` dosyasında. Bu tek dosyayı USB'ye kopyalayarak yedekleyebilirsin.

**Uygulamayı güncellemek?**
Geliştirme bilgisayarında `git pull` yapıp yeni klasörü bu bilgisayara kopyala, `kur.bat`'ı tekrar çalıştır (npm install + build yapar, DB'ye dokunmaz).
