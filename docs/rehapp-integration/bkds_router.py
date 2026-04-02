"""
bkds_router.py — Rehapp FastAPI router
BKDS Takip uygulamasına SSO yönlendirmesi sağlar.

Kurulum:
    app.include_router(bkds_router, prefix="/bkds", tags=["BKDS"])

Gerekli ortam değişkenleri:
    BKDS_APP_URL    = "https://bkds.rehapp.com"
    BKDS_SSO_SECRET = "<paylaşılan gizli anahtar>"
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
import httpx

from app.core.config import settings          # TODO: kendi config sınıfını kullan
from app.api.deps import get_current_user     # TODO: kendi auth dependency'ni kullan
from app.models.user import User              # TODO: kendi User modelini kullan

bkds_router = APIRouter()


def _org_slug_for_user(user: User) -> str:
    """
    Kullanıcının kurumuna ait org_slug döndür.
    Bu slug bkds-takip veritabanındaki Organization.slug ile eşleşmeli.

    TODO: Kendi modelinden org_slug'ı çek. Örnek:
        return user.organization.bkds_slug
        veya
        return user.kurum.slug
    """
    raise NotImplementedError(
        "user nesnesinden org_slug çekme mantığını implement et. "
        "bkds-takip'teki Organization.slug ile eşleşmeli."
    )


def _role_for_user(user: User) -> str:
    """
    Rehapp rolünü bkds-takip rolüne map et.
    bkds-takip rolleri: admin | yonetici | danisma

    TODO: Kendi rol yapına göre map et. Örnek:
        role_map = {
            "kurum_admin": "admin",
            "mudur":       "yonetici",
            "danisma":     "danisma",
        }
        return role_map.get(user.role, "danisma")
    """
    return "admin"  # varsayılan: admin olarak gönder


@bkds_router.get("/redirect", summary="BKDS Takip SSO yönlendirmesi")
async def bkds_redirect(current_user: User = Depends(get_current_user)):
    """
    Kullanıcıyı BKDS Takip uygulamasına SSO ile yönlendirir.
    Rehapp'taki BKDS butonuna tıklandığında bu endpoint çağrılır.
    """
    org_slug = _org_slug_for_user(current_user)
    role = _role_for_user(current_user)

    # bkds-takip'ten tek kullanımlık SSO token al
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{settings.BKDS_APP_URL}/api/sso",
                json={
                    "org_slug": org_slug,
                    "role": role,
                    "secret": settings.BKDS_SSO_SECRET,
                },
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"BKDS SSO token alınamadı: {exc.response.status_code}",
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"BKDS uygulamasına bağlanılamadı: {exc}",
            )

    data = resp.json()
    redirect_url = data.get("redirect_url")
    if not redirect_url:
        raise HTTPException(status_code=502, detail="BKDS'den geçersiz yanıt")

    return RedirectResponse(url=redirect_url, status_code=302)
