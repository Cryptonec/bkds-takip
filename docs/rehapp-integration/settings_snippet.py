"""
settings_snippet.py — Rehapp Pydantic Settings örneği
Mevcut settings.py / config.py dosyanıza eklenecek alanlar.
"""

from pydantic_settings import BaseSettings  # pydantic v2
# from pydantic import BaseSettings          # pydantic v1


class Settings(BaseSettings):
    # ... mevcut ayarlarınız ...

    # ── BKDS Takip entegrasyonu ──────────────────────────────────────────────
    BKDS_APP_URL: str = "https://bkds.rehapp.com"
    """BKDS Takip uygulamasının public URL'i"""

    BKDS_SSO_SECRET: str
    """
    bkds-takip .env'indeki SSO_SECRET ile birebir aynı olmalı.
    Güvenli bir değer üretmek için:
        python -c "import secrets; print(secrets.token_hex(32))"
    """

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()


# ── .env dosyasına eklenecek satırlar ────────────────────────────────────────
#
# BKDS_APP_URL=https://bkds.rehapp.com
# BKDS_SSO_SECRET=<python -c "import secrets; print(secrets.token_hex(32))">
#
# bkds-takip .env dosyasında da aynı değer olmalı:
# SSO_SECRET=<yukarıdaki değer>
# NEXTAUTH_URL=https://bkds.rehapp.com
