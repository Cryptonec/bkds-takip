# rehapp-backend/schemas.py — eklenecek şemalar
#
# Mevcut schemas.py dosyasının SONUNA ekle (SavedGroupOut'tan sonra)

from typing import Optional


# ── BKDS Takip SSO kimlik bilgileri ───────────────────────────────────────

class BkdsCredentialsUpdate(BaseModel):
    """Kurum, kendi bkds-takip giriş bilgilerini bu şemayla günceller."""
    bkds_email:    Optional[str] = None
    bkds_password: Optional[str] = None


class BkdsCredentialsOut(BaseModel):
    """Mevcut BKDS ayarlarını döner — şifre asla gönderilmez."""
    bkds_email: Optional[str] = None
    bkds_configured: bool      # email VE password dolu mu?

    model_config = {"from_attributes": True}
