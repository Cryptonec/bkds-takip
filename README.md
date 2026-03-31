# BKDS Takip Sistemi

Özel eğitim ve rehabilitasyon merkezleri için kurum içi BKDS devamsızlık takip ve yoklama karşılaştırma sistemi.

## Özellikler

- **BKDS Anlık Senkronizasyon** — Playwright ile bkds.meb.gov.tr'den otomatik veri çekme (60 sn)
- **Lila Excel/CSV Aktarımı** — Ders listesini tek tıkla yükle
- **Canlı Takip Ekranı** — Öğrenci ve personel durumu anlık izleme
- **Akıllı Eşleştirme** — Türkçe karakter normalizasyonu ile isim bazlı eşleştirme
- **Evde Destek Muafiyeti** — Bu dersler otomatik BKDS muaf olarak işaretlenir
- **Alert Sistemi** — Kritik durumlar için uyarı üretimi

## Kurulum

### Gereksinimler

- Node.js 18+
- PostgreSQL 14+
- Chromium (Playwright için)

### 1. Projeyi klonlayın ve bağımlılıkları yükleyin

```bash
git clone <repo>
cd bkds-takip
npm install
```

### 2. Playwright browser kurulumu

```bash
npx playwright install chromium
```

### 3. Ortam değişkenlerini ayarlayın

```bash
cp .env.example .env
```

`.env` dosyasını düzenleyin:

```env
DATABASE_URL="postgresql://kullanici:sifre@localhost:5432/bkds_takip"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="openssl rand -hex 32 ile üretin"

# BKDS giriş bilgileri
BKDS_URL="https://bkds.meb.gov.tr"
BKDS_USERNAME="kurumunuzun_kullanici_adi"
BKDS_PASSWORD="kurumunuzun_sifresi"
BKDS_KURUM_KODU="123456"

# Polling aralığı (ms) - varsayılan 60 saniye
BKDS_POLL_INTERVAL="60000"
```

### 4. Veritabanını hazırlayın

```bash
npm run db:generate    # Prisma client oluştur
npm run db:push        # Tabloları oluştur (dev için)
# veya migration ile:
npm run db:migrate
```

### 5. Seed veriyi yükleyin (isteğe bağlı)

```bash
npm run db:seed
```

Bu işlem şunları oluşturur:
- 10 öğrenci
- 3 öğretmen
- Bugün için ders programı
- Test amaçlı eksik BKDS kayıtları

**Varsayılan giriş bilgileri:**
- `admin@kurum.com` / `admin123`
- `danisma@kurum.com` / `admin123`

### 6. Geliştirme sunucusunu başlatın

```bash
npm run dev
```

Uygulama `http://localhost:3000` adresinde çalışır.

---

## BKDS Bağlantısı

Sistem Playwright kullanarak BKDS'ye otomatik giriş yapar. `src/lib/services/bkdsProviderService.ts` içindeki CSS seçiciler kurumunuzun BKDS arayüzüne göre güncellenmelidir.

### BKDS Selector Güncelleme

```ts
// bkdsProviderService.ts içinde

// Login alanları (kuruma göre değişebilir):
await page.fill('#KurumKodu', this.kurumKodu);
await page.fill('#KullaniciAdi', this.username);
await page.fill('#Sifre', this.password);
await page.click('button[type="submit"]');

// Rapor sayfası URL ve tablo yapısı:
await page.goto(`${this.url}/Rapor/GirisCikisListesi`);
```

Test için:
```bash
# Ayarlar sayfasından "BKDS'yi Test Et" butonuna tıklayın
# veya API ile:
curl -X POST http://localhost:3000/api/bkds
```

---

## Lila İçe Aktarma

**Ayarlar → Lila İçe Aktar** sayfasından Excel veya CSV dosyası yükleyin.

### Beklenen Sütunlar

| Sütun | Açıklama |
|-------|----------|
| `Öğrenci Adı` | Öğrencinin tam adı |
| `Öğretmen` | Öğretmen adı |
| `Tarih` | `DD.MM.YYYY` veya `YYYY-MM-DD` |
| `Başlangıç` | `HH:MM` formatında |
| `Bitiş` | `HH:MM` formatında |
| `Derslik` | Derslik adı |

> **Not:** `Derslik` alanında "Evde Destek Eğitim" geçiyorsa bu ders BKDS muaf sayılır ve uyarı üretilmez.

---

## Kullanım

### Canlı Takip

`/canli` sayfası 60 saniyede bir otomatik yenilenir.

**Öğrenci Paneli** — Durum renkleri:
- 🔴 Kırmızı: Kritik / Giriş Eksik
- 🟠 Turuncu: Çıkış Eksik
- 🟡 Sarı: Gecikiyor / Geç Geldi
- 🟢 Yeşil: Girişte / Tamamlandı
- 🔵 Mavi: BKDS Muaf

**Personel Paneli** — "Ders Başladı" butonuna tıklanarak personel giriş kaydı oluşturulur.

### Raporlar

`/raporlar` sayfasından tarih seçerek günlük rapor görüntülenebilir ve CSV olarak indirilebilir.

---

## Mimari

```
src/
├── app/
│   ├── (auth)/          # Oturum gerektiren sayfalar
│   │   ├── dashboard/
│   │   ├── canli/       # Canlı takip ekranı
│   │   ├── import/      # Lila yükleme
│   │   ├── ogrenciler/
│   │   ├── personel/
│   │   └── raporlar/
│   ├── api/             # REST API routes
│   └── giris/           # Login sayfası
├── lib/
│   ├── services/
│   │   ├── attendanceEngine.ts      # Öğrenci iş kuralları
│   │   ├── staffAttendanceEngine.ts # Personel iş kuralları
│   │   ├── bkdsProviderService.ts   # Playwright BKDS çekici
│   │   ├── bkdsPoller.ts            # 60sn cron
│   │   ├── lilaImportService.ts     # Excel/CSV işleme
│   │   ├── attendanceService.ts     # DB güncelleme
│   │   └── alertService.ts          # Uyarı üretimi
│   ├── utils/
│   │   └── normalize.ts             # Türkçe karakter normalizasyonu
│   └── hooks/
│       └── useLiveAttendance.ts     # Polling React hook
└── components/
    ├── layout/          # Sidebar, AppShell
    ├── canli/           # OgrenciPaneli, PersonelPaneli
    └── dashboard/       # StatCard
```

---

## Testler

```bash
npm test
```

Test kapsamı:
- İsim normalizasyonu (Türkçe karakter dönüşümü)
- Evde Destek Eğitim muafiyet kuralı
- Öğrenci attendance hesaplama (tüm senaryolar)
- Personel devamsızlık hesaplama

---

## Üretim Dağıtımı

```bash
npm run build
npm start
```

> BKDS polling'in çalışması için uygulamanın sürekli ayakta olması gerekir. `pm2`, `systemd` veya benzeri bir process manager kullanın.

```bash
pm2 start npm --name "bkds-takip" -- start
```
