# Rehapp ↔ BKDS Takip Entegrasyon Rehberi

## Mimari

```
Rehapp (Streamlit + FastAPI)              BKDS Takip (Next.js)
────────────────────────────────          ─────────────────────────────
Kullanıcı BKDS butonuna tıklar
         │
         ▼
_fetch_bkds_url()  (Streamlit, server-side)
  GET /bkds/sso-url
  Authorization: Bearer <JWT>
         │
         ▼ JWT doğrulama → get_current_kurum
  POST /api/sso  {org_slug, role, secret}
         │───────────────────────────────────►
         │◄───────────────────────────────────
         │  { redirect_url: "…/api/sso/callback?token=…" }
         │
         ▼
  { redirect_url } → Streamlit HTML link
         │
         ▼ Kullanıcı linke tıklar (yeni sekme)
  GET /api/sso/callback?token=…
         │
         ▼ Token doğrulama → NextAuth oturumu
  Otomatik giriş tamamlandı ✓
```

> **Neden direkt link değil?**
> Streamlit'ten gelen link istekleri `Authorization` header taşıyamaz.
> Bu yüzden Streamlit Python kodu `/bkds/sso-url` endpoint'ini server-side
> çağırır, dönüş URL'ini HTML link olarak render eder.

---

## Adım Adım Kurulum

### 1. Paylaşılan Secret Oluştur

```bash
python -c "import secrets; print(secrets.token_hex(32))"
# Çıktıyı kopyala — her iki .env'e aynı değer girilecek
```

### 2. rehapp-backend `.env`

```env
BKDS_APP_URL=https://bkds.rehapp.com
BKDS_SSO_SECRET=<yukarıdaki_değer>
```

### 3. rehapp-frontend `.env`

```env
REHAPP_INTERNAL_API_URL=http://rehapp-backend:8000   # internal URL
```

### 4. bkds-takip `.env`

```env
SSO_SECRET=<1. adımdaki değer>        # Rehapp ile aynı!
NEXTAUTH_URL=https://bkds.rehapp.com
NEXTAUTH_SECRET=<ayrı random değer>
DATABASE_URL=postgresql://...
```

### 5. rehapp-backend'e Router Ekle

`rehapp-backend/routers/bkds.py` olarak kopyala, sonra `main.py`'a ekle:

```python
from routers.bkds import router as bkds_router
app.include_router(bkds_router, prefix="/bkds", tags=["BKDS"])
```

### 6. rehapp-frontend'e Buton Ekle

**Seçenek A — Sidebar'a ekle** (`app.py`):

```python
from bkds_page import render_bkds_sidebar_button

# Sidebar'ın uygun yerine:
render_bkds_sidebar_button()
```

**Seçenek B — Ayrı sayfa** (`pages/bkds.py` oluştur):

```python
import streamlit as st
from bkds_page import render_bkds_page

if st.session_state.get("page") != "app":
    st.error("Lütfen giriş yapın.")
    st.stop()

render_bkds_page()
```

### 7. bkds-takip'te Kurum Oluştur (Superadmin)

`org_slug` = Rehapp'taki `kurum_id` (string olarak):

```bash
curl -X POST https://bkds.rehapp.com/api/admin/organizations \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ABC Özel Eğitim",
    "slug": "42",                ← Rehapp kurum_id ile aynı! str(kurum.id)
    "plan": "pro",
    "credentials": {
      "username": "bkds_kullanici",
      "password": "bkds_sifre",
      "cityId": "34",
      "districtId": "123",
      "remId": "456"
    }
  }'
```

### 8. Uçtan Uca Test

1. Rehapp'ta giriş yap
2. BKDS butonuna tıkla
3. Yeni sekmede BKDS Takip açılmalı — şifre sorulmadan
4. Farklı kurumların verisinin birbirini görmediğini doğrula

---

## Slug Eşleştirme

| Rehapp                  | bkds-takip                  |
|-------------------------|-----------------------------|
| `kurum.id` (int, ör 42) | `Organization.slug = "42"`  |
| Her kurum tek kullanıcı | Role her zaman `"admin"`    |

---

## Güvenlik

- `SSO_SECRET` / `BKDS_SSO_SECRET` asla git'e commit edilmemeli
- SSO token tek kullanımlıktır, 2 dakikada sona erer
- HTTPS zorunlu
- Superadmin hesabı güçlü şifreyle korunmalı

---

## Dosya Listesi

| Dosya | Nereye kopyalanır |
|-------|-------------------|
| `bkds_router.py` | `rehapp-backend/routers/bkds.py` |
| `bkds_page.py` | `rehapp-frontend/bkds_page.py` |
| `settings_snippet.py` | `.env` referansı |
| `README.md` | Bu dosya |
