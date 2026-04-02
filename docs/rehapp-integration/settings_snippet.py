"""
BKDS Takip — Rehapp Settings Güncelleme Rehberi
=================================================
Rehapp'ınızın core/config.py veya settings.py dosyasına ekleyin.
"""

# ---------------------------------------------------------------------------
# Pydantic v2 (BaseSettings) örneği
# ---------------------------------------------------------------------------
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ... mevcut ayarlarınız ...

    # BKDS Takip entegrasyonu
    BKDS_SSO_SECRET: str = ""          # bkds-takip .env'deki SSO_SECRET ile AYNI olmalı
    BKDS_APP_URL: str = ""             # örn: https://bkds.rehapp.com

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()


# ---------------------------------------------------------------------------
# .env dosyasına eklenecek satırlar
# ---------------------------------------------------------------------------
ENV_EXAMPLE = """
# ── BKDS Takip Entegrasyonu ──────────────────────────────────
# Bu değer bkds-takip uygulamasının .env dosyasındaki SSO_SECRET ile AYNI olmalıdır.
BKDS_SSO_SECRET=buraya-guclu-rastgele-bir-deger-koyun

# bkds-takip uygulamasının adresi
BKDS_APP_URL=https://bkds.rehapp.com
# BKDS_APP_URL=http://localhost:3000   # Geliştirme ortamı için
"""

# ---------------------------------------------------------------------------
# Güvenli secret üretimi (bir kez çalıştırın, değeri .env'e yapıştırın)
# ---------------------------------------------------------------------------
# python -c "import secrets; print(secrets.token_hex(32))"
