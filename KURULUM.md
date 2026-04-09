# BKDS Takip — Kurulum Rehberi

## Gereksinimler

- **Docker Desktop** (ücretsiz): [indirmek için tıklayın](https://www.docker.com/products/docker-desktop)
- İnternet bağlantısı (ilk kurulum için)

---

## Kurulum (Windows)

1. Bu klasörü bilgisayarınıza kopyalayın veya indirin.
2. **Docker Desktop**'ı başlatın ve çalıştığından emin olun (sistem tepsisinde balina ikonu).
3. `kurulum.bat` dosyasına **çift tıklayın**.
4. Sorulan bilgileri girin:
   - **Kurum Kısa Adı**: Rehapp'taki `org_slug` ile aynı olmalı (ör: `ankara-rem`)
   - **Kurum Tam Adı**: Görüntülenecek ad
   - **Yönetici E-posta**: Giriş için kullanılacak
   - **Yönetici Şifre**: En az 6 karakter
5. Kurulum tamamlandığında tarayıcı otomatik açılır.

---

## Kurulum (Mac / Linux)

```bash
chmod +x kurulum.sh
./kurulum.sh
```

---

## Giriş

Uygulama `http://localhost:3000` adresinde çalışır.

Giriş için **Rehapp SSO** kullanın. Rehapp'ta kurum ayarlarından BKDS Takip'e yönlendirme yapılandırılmalıdır.

---

## Günlük Kullanım

| İşlem | Komut |
|-------|-------|
| Başlat | `docker compose start` |
| Durdur | `docker compose stop` |
| Güncelle | `kurulum.bat` → E |
| Günlükler | `docker compose logs -f app` |

> **Not**: Veriler `postgres_data` Docker volume'unda saklanır. Docker'ı kaldırsanız bile veriler korunur.

---

## Sorun Giderme

**Uygulama açılmıyor:**
```
docker compose logs app
```

**Veritabanı hatası:**
```
docker compose restart db
```

**Sıfırdan başlamak (veriler silinir!):**
```
docker compose down -v
kurulum.bat
```
