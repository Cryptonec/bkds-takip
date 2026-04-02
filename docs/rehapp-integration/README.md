# Rehapp ↔ BKDS Takip Entegrasyon Rehberi

Bu klasördeki dosyalar Rehapp FastAPI + Streamlit projesine BKDS Takip modülünü eklemek için kullanılır.

---

## Mimari

```
Rehapp Streamlit  →  [BKDS Takip butonu]
       ↓
Rehapp FastAPI    →  GET /bkds/redirect
       ↓  (JWT üret, SSO_SECRET ile imzala)
bkds-takip        →  GET /api/sso?token=<JWT>
       ↓  (token doğrula, oturum aç)
bkds-takip        →  /dashboard  ✓
```

---

## 1. Bağımlılık Ekle

```bash
pip install PyJWT
```

---

## 2. Secret Üret

Her iki tarafta da **aynı** secret kullanılır:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Çıktıyı kopyalayın.

---

## 3. .env Dosyalarını Güncelle

**Rehapp `.env`:**
```env
BKDS_SSO_SECRET=<üretilen-secret>
BKDS_APP_URL=https://bkds.rehapp.com
```

**bkds-takip `.env`:**
```env
SSO_SECRET=<aynı-secret>
NEXTAUTH_URL=https://bkds.rehapp.com
```

> ⚠️ Her iki taraftaki secret **birebir aynı** olmalıdır.

---

## 4. FastAPI'ye Router Ekle

`bkds_router.py` dosyasını Rehapp'ın `routers/` klasörüne kopyalayın, ardından `main.py`'ye ekleyin:

```python
from routers.bkds_router import router as bkds_router
app.include_router(bkds_router, prefix="/bkds", tags=["bkds"])
```

`bkds_router.py` içindeki TODO yorumlarını kendi Rehapp modellerinize göre doldurun:

```python
# bkds_router.py içinde değiştirin:
user = current_user
org = user.organization
bkds_role = role_map.get(user.role, "danisma")

redirect_url = create_bkds_sso_token(
    user_email=user.email,
    user_name=user.full_name,
    user_role=bkds_role,
    org_slug=org.slug,           # bkds-takip'teki Organization.slug ile aynı olmalı
    sso_secret=settings.BKDS_SSO_SECRET,
    bkds_app_url=settings.BKDS_APP_URL,
)
return RedirectResponse(url=redirect_url)
```

---

## 5. Streamlit'e Buton Ekle

`bkds_page.py` dosyasını Streamlit projenize kopyalayın.

**Sidebar'a eklemek için** (`app.py` veya `sidebar.py`):
```python
from bkds_page import render_bkds_sidebar_item

with st.sidebar:
    render_bkds_sidebar_item(
        api_base_url=settings.API_URL,   # Rehapp backend URL
        auth_token=st.session_state.token,
    )
```

**Ayrı sayfa olarak** (`pages/5_BKDS_Takip.py`):
```python
from bkds_page import render_bkds_page

render_bkds_page(
    current_user=st.session_state.user,
    api_base_url=settings.API_URL,
    auth_token=st.session_state.token,
)
```

---

## 6. bkds-takip'te Organizasyon Oluştur

Her Rehapp müşterisi için bkds-takip'te bir organizasyon kaydı gerekir.
`org_slug` her iki sistemde eşleşmelidir.

**Admin panel üzerinden** (superadmin hesabıyla):
```
POST /api/admin/organizations
{
  "name": "Kurum Adı",
  "slug": "kurum-slug",      # Rehapp'taki org.slug ile AYNI
  "bkdsUsername": "bkds_kullanici",
  "bkdsPassword": "bkds_sifre",
  "plan": "profesyonel",
  "subscriptionStatus": "aktif"
}
```

**Ya da seed ile** (`prisma/seed.ts`'yi düzenleyin).

---

## 7. Rol Eşleştirme

| Rehapp Rolü | BKDS Rolü |
|-------------|-----------|
| superadmin  | admin     |
| admin       | admin     |
| manager     | yonetici  |
| counselor   | danisma   |

---

## 8. Test Etme

1. bkds-takip uygulamasını başlatın: `npm run dev`
2. Rehapp'ı başlatın
3. Rehapp'ta "BKDS Takip" butonuna tıklayın
4. bkds-takip'te `/dashboard`'a otomatik yönlendirilmelisiniz

**Hata durumları:**
- `sso_gecersiz` → Secret'lar eşleşmiyor
- `kurum_bulunamadi` → org_slug yanlış veya organizasyon oluşturulmamış
- `abonelik_gecersiz` → Organizasyonun abonelik durumu `aktif` veya `deneme` değil
