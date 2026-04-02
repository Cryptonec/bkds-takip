"""
bkds_router.py — Rehapp FastAPI router (Rehapp-spesifik implementasyon)

Mimari:
  Rehapp'ta kullanıcı = Kurum. Her kurum kendi JWT token'ıyla giriş yapar.
  get_current_kurum dependency JWT'den kurum_id okur.

Kurulum (rehapp-backend/main.py veya app/routers/__init__.py):
    from routers.bkds import router as bkds_router
    app.include_router(bkds_router, prefix="/bkds", tags=["BKDS"])

Gerekli ortam değişkenleri (.env):
    BKDS_APP_URL    = "https://bkds.rehapp.com"
    BKDS_SSO_SECRET = "<bkds-takip SSO_SECRET ile aynı değer>"
"""

import os
from fastapi import APIRouter, Depends, HTTPException
import httpx

# Rehapp'ın mevcut auth dependency'si
from auth import get_current_kurum          # rehapp-backend/auth.py
from db import get_db                       # gerekirse
from sqlalchemy.orm import Session

router = APIRouter()

BKDS_APP_URL    = os.getenv("BKDS_APP_URL",    "https://bkds.rehapp.com")
BKDS_SSO_SECRET = os.getenv("BKDS_SSO_SECRET", "")


def _org_slug(kurum) -> str:
    """
    Rehapp kurum_id → bkds-takip Organization.slug

    Rehapp'ta Kurum.id (integer) kullanılıyor.
    bkds-takip'te kurum oluştururken slug = str(rehapp_kurum_id) set edilmeli.
    Örnek: Rehapp kurum_id=42 → bkds-takip slug="42"
    """
    return str(kurum.id)


@router.get(
    "/sso-url",
    summary="BKDS Takip SSO URL'i üret",
    description=(
        "Streamlit frontend'i bu endpoint'i çağırır. "
        "Tek kullanımlık (2 dk geçerli) bir redirect URL döner. "
        "Streamlit bu URL'i link olarak gösterir."
    ),
)
async def get_bkds_sso_url(kurum=Depends(get_current_kurum)):
    """
    Kurum için bkds-takip'ten SSO token alır ve redirect URL döner.
    Streamlit Authorization header ile bu endpoint'i çağırır.
    """
    if not BKDS_SSO_SECRET:
        raise HTTPException(status_code=500, detail="BKDS_SSO_SECRET tanımlı değil")

    org_slug = _org_slug(kurum)

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{BKDS_APP_URL}/api/sso",
                json={
                    "org_slug": org_slug,
                    "role": "admin",        # Rehapp'ta tek rol: kurum admini
                    "secret": BKDS_SSO_SECRET,
                },
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = "BKDS'e erişim reddedildi"
            if exc.response.status_code == 404:
                detail = (
                    f"Kurum '{org_slug}' bkds-takip'te bulunamadı. "
                    "Superadmin panelden organizasyon oluşturun."
                )
            raise HTTPException(status_code=502, detail=detail)
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="BKDS uygulamasına bağlanılamadı")

    data = resp.json()
    redirect_url = data.get("redirect_url")
    if not redirect_url:
        raise HTTPException(status_code=502, detail="BKDS'den geçersiz yanıt")

    return {"redirect_url": redirect_url, "org_slug": org_slug}
