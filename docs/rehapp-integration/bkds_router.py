"""
bkds_router.py — Rehapp FastAPI router

Kurulum (rehapp-backend/main.py):
    from routers.bkds import router as bkds_router
    app.include_router(bkds_router, prefix="/bkds", tags=["BKDS"])

Gerekli ortam değişkenleri (.env):
    BKDS_APP_URL    = "https://bkds.rehapp.com"
    BKDS_SSO_SECRET = "<bkds-takip SSO_SECRET ile aynı değer>"

bkds-takip'te her kurum için gerekli:
    - Organization.slug = str(rehapp kurum_id)
    - Kurumun bir admin User kaydı (email + password)
    - Bu email+password Rehapp'ta kurumun profilinde saklanacak
"""

import os
from fastapi import APIRouter, Depends, HTTPException
import httpx

from auth import get_current_kurum          # rehapp-backend/auth.py

router = APIRouter()

BKDS_APP_URL    = os.getenv("BKDS_APP_URL",    "https://bkds.rehapp.com")
BKDS_SSO_SECRET = os.getenv("BKDS_SSO_SECRET", "")


@router.get(
    "/sso-url",
    summary="BKDS Takip SSO URL'i üret",
)
async def get_bkds_sso_url(kurum=Depends(get_current_kurum)):
    """
    Kurum için bkds-takip'ten tek kullanımlık giriş URL'i alır.
    Streamlit bu endpoint'i Authorization header ile çağırır (server-side).
    Dönüş: { redirect_url: "https://bkds.rehapp.com/giris?token=xyz" }

    Kurum modelinde şu alanlar gerekli:
        kurum.bkds_email     # bkds-takip'teki admin kullanıcı e-postası
        kurum.bkds_password  # bkds-takip'teki admin kullanıcı şifresi (düz metin veya decrypt)

    TODO: Rehapp'ta kurum.bkds_email ve kurum.bkds_password alanları yoksa
          onları Kurum modeline ekle (şifreli saklama önerilir).
    """
    if not BKDS_SSO_SECRET:
        raise HTTPException(status_code=500, detail="BKDS_SSO_SECRET tanımlı değil")

    # Kurum modelinden BKDS kimlik bilgilerini al
    # TODO: alan adlarını kendi Kurum modeline göre güncelle
    bkds_email    = getattr(kurum, "bkds_email", None)
    bkds_password = getattr(kurum, "bkds_password", None)
    org_slug      = str(kurum.id)   # bkds-takip'te Organization.slug = str(kurum.id)

    if not bkds_email or not bkds_password:
        raise HTTPException(
            status_code=422,
            detail="Kurumun BKDS giriş bilgileri tanımlı değil. Lütfen kurum ayarlarını güncelleyin.",
        )

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{BKDS_APP_URL}/api/sso/rehapp",
                json={
                    "email": bkds_email,
                    "password": bkds_password,
                    "org_slug": org_slug,
                    "rehapp_secret": BKDS_SSO_SECRET,
                },
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 404:
                raise HTTPException(
                    status_code=502,
                    detail=f"Kurum '{org_slug}' bkds-takip'te bulunamadı. Superadmin'e bildirin.",
                )
            if status == 401:
                raise HTTPException(
                    status_code=502,
                    detail="BKDS kimlik bilgileri geçersiz. Kurum ayarlarını kontrol edin.",
                )
            raise HTTPException(status_code=502, detail=f"BKDS hatası: {status}")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="BKDS uygulamasına bağlanılamadı")

    data = resp.json()
    redirect_url = data.get("redirect_url")
    if not redirect_url:
        raise HTTPException(status_code=502, detail="BKDS'den geçersiz yanıt")

    return {"redirect_url": redirect_url}
