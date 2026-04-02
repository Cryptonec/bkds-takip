# Rehapp ↔ BKDS Takip Entegrasyon Rehberi

## Mimari

```
Rehapp (Streamlit + FastAPI)              BKDS Takip (Next.js)
────────────────────────────────          ─────────────────────────────
Kullanıcı BKDS butonuna tıklar
         │
         ▼
_fetch_bkds_url()  (Streamlit, server-side)
  GET /bkds/sso-url  +  Authorization: Bearer <JWT>
         │
         ▼ get_current_kurum → kurum.bkds_email + kurum.bkds_password
  POST /api/sso/rehapp
  { email, password, org_slug, rehapp_secret }
         │───────────────────────────────────►
         │  1. rehapp_secret doğrula
         │  2. email+password doğrula
         │  3. Kullanıcı bu org'a ait mi?
         │  4. Tek kullanımlık token üret (2 dk)
         │◄───────────────────────────────────
  { redirect_url: "…/giris?token=xyz" }
         │
         ▼
  Streamlit HTML link render eder
         │
         ▼ Kullanıcı linke tıklar (yeni sekme)
  GET /giris?token=xyz
         │  useEffect → token görürse signIn('credentials', {ssoToken})
         ▼
  Otomatik giriş → /dashboard ✓
```

**Güvenlik katmanları:** shared secret + gerçek email+password doğrulaması

---

## Adım Adım Kurulum

### 1. Shared Secret Oluştur

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Rehapp `.env`

```env
BKDS_APP_URL=https://bkds.rehapp.com
BKDS_SSO_SECRET=<yukarıdaki_değer>
REHAPP_INTERNAL_API_URL=http://rehapp-backend:8000
```

### 3. bkds-takip `.env`

```env
SSO_SECRET=<1. adımdaki değer>        # Rehapp ile aynı!
NEXTAUTH_URL=https://bkds.rehapp.com
NEXTAUTH_SECRET=<ayrı random değer>
DATABASE_URL=postgresql://...
```

### 4. Kurum Modeline Alan Ekle (rehapp-backend)

`models.py`'daki `Kurum` modeline şu alanları ekle:

```python
bkds_email    = Column(String, nullable=True)   # bkds-takip admin e-posta
bkds_password = Column(String, nullable=True)   # bkds-takip admin şifresi
```

> Bu şifre bkds-takip uygulamasına giriş şifresidir, BKDS API şifresi değil.
> Production'da şifrelenmiş saklanmalı (Fernet/AES önerilir).

### 5. rehapp-backend Router Ekle

`bkds_router.py`'ı `rehapp-backend/routers/bkds.py` olarak kopyala.

`TODO` satırını kurum modeline göre güncelle:
```python
bkds_email    = getattr(kurum, "bkds_email", None)
bkds_password = getattr(kurum, "bkds_password", None)
```

`main.py`'a ekle:
```python
from routers.bkds import router as bkds_router
app.include_router(bkds_router, prefix="/bkds", tags=["BKDS"])
```

### 6. rehapp-frontend Buton Ekle

`bkds_page.py`'ı `rehapp-frontend/bkds_page.py` olarak kopyala.

Sidebar'a eklemek için `app.py`'da:
```python
from bkds_page import render_bkds_sidebar_button
render_bkds_sidebar_button()   # sidebar bloğu içinde
```

### 7. bkds-takip'te Kurum ve Kullanıcı Oluştur

Her kurum için superadmin panelden:

```bash
# 1. Kurum oluştur (slug = str(rehapp_kurum_id))
curl -X POST https://bkds.rehapp.com/api/admin/organizations \
  -H "Cookie: ..." \
  -d '{"name":"ABC Rehab","slug":"42","plan":"pro","credentials":{...}}'

# 2. Bu kuruma bir admin kullanıcısı ekle (normal kayıt yolu veya doğrudan DB)
#    email + şifre → Rehapp'taki kurum.bkds_email / bkds_password ile eşleşmeli
```

### 8. Uçtan Uca Test

1. Rehapp'ta giriş yap → BKDS butonuna tıkla
2. Yeni sekmede `/giris?token=xyz` açılmalı
3. Otomatik giriş → `/dashboard` görünmeli
4. Farklı iki kurumla test et — veriler karışmamalı
5. 2 dakika bekleyip aynı token'ı tekrar kullan → "geçersiz" hatası vermeli

---

## Slug Eşleştirme

| Rehapp         | bkds-takip                 |
|----------------|----------------------------|
| `kurum.id = 42`| `Organization.slug = "42"` |
| `kurum.bkds_email` | `User.email`          |
| `kurum.bkds_password` | `User.password`    |

---

## Dosya Listesi

| Dosya | Nereye kopyalanır |
|-------|-------------------|
| `bkds_router.py` | `rehapp-backend/routers/bkds.py` |
| `bkds_page.py` | `rehapp-frontend/bkds_page.py` |
| `README.md` | Bu dosya |
