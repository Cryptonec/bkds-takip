# Rehapp ↔ BKDS Takip Entegrasyon Rehberi

## Mimari Özet

```
Rehapp (Streamlit + FastAPI)          BKDS Takip (Next.js)
─────────────────────────────         ───────────────────────────
Kullanıcı BKDS butonuna tıklar
        │
        ▼
GET /bkds/redirect  (FastAPI)
        │
        ▼ POST /api/sso  {org_slug, role, secret}
        │────────────────────────────────────────►
        │◄────────────────────────────────────────
        │  { redirect_url: "…/api/sso/callback?token=…" }
        │
        ▼
302 Redirect → BKDS Takip callback
        │
        ▼ Token doğrulama + NextAuth oturumu
Otomatik giriş tamamlandı ✓
```

## Adım Adım Kurulum

### 1. Paylaşılan Secret Oluştur

```bash
python -c "import secrets; print(secrets.token_hex(32))"
# Örnek: a3f8c2...
```

### 2. Rehapp `.env` Dosyasına Ekle

```env
BKDS_APP_URL=https://bkds.rehapp.com
BKDS_SSO_SECRET=<yukarıdaki_değer>
```

### 3. BKDS Takip `.env` Dosyasına Ekle

```env
SSO_SECRET=<yukarıdaki_değer>          # Rehapp ile aynı!
NEXTAUTH_URL=https://bkds.rehapp.com
NEXTAUTH_SECRET=<ayrı_bir_random_değer>
DATABASE_URL=postgresql://...
```

### 4. Rehapp `settings.py`'a Alan Ekle

`settings_snippet.py` dosyasındaki alanları kopyala:

```python
BKDS_APP_URL: str = "https://bkds.rehapp.com"
BKDS_SSO_SECRET: str
```

### 5. FastAPI Router'ı Ekle

```python
# app/main.py veya app/api/router.py
from bkds_router import bkds_router
app.include_router(bkds_router, prefix="/bkds", tags=["BKDS"])
```

`bkds_router.py` içindeki 2 TODO'yu doldur:
- `_org_slug_for_user(user)` → `user.organization.bkds_slug` veya benzeri
- `_role_for_user(user)` → Rehapp rollerini `admin|yonetici|danisma`'ya map et

### 6. Streamlit'e Buton Ekle

```python
# Sidebar'a:
from bkds_page import render_bkds_button
with st.sidebar:
    render_bkds_button(st.session_state.current_user)

# Veya ayrı sayfa olarak pages/bkds.py:
from bkds_page import render_bkds_page
render_bkds_page(st.session_state.current_user)
```

### 7. BKDS Takip'te Kurum Oluştur

Superadmin hesabıyla giriş yap ve her müşteri için:

```bash
curl -X POST https://bkds.rehapp.com/api/admin/organizations \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ABC Özel Eğitim",
    "slug": "abc-ozel-egitim",     ← Rehapp org_slug ile aynı!
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

1. Rehapp'ta BKDS butonuna tıkla
2. `GET /bkds/redirect` → `POST /api/sso` → `302 /api/sso/callback?token=...`
3. BKDS Takip'te otomatik giriş → dashboard görünmeli
4. Farklı kurumların verisinin birbirini görmediğini doğrula

## Güvenlik Notları

- `SSO_SECRET` / `BKDS_SSO_SECRET` production'da asla git'e commit edilmemeli
- SSO token tek kullanımlıktır ve 2 dakikada sona erer
- HTTPS zorunlu; HTTP üzerinde secret gönderilmemeli
- `BkdsCredential.password` production'da uygulama seviyesinde şifrelenebilir
  (örn. `@prisma/client` öncesinde AES-256-GCM ile)

## Dosya Listesi

| Dosya | Açıklama |
|-------|----------|
| `bkds_router.py` | FastAPI endpoint — SSO token alıp redirect |
| `bkds_page.py` | Streamlit buton/sayfa bileşeni |
| `settings_snippet.py` | Pydantic Settings eklentisi |
| `README.md` | Bu dosya |
