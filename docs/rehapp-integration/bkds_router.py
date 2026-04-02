"""
BKDS Takip — FastAPI SSO Entegrasyonu
======================================
Bu dosyayı Rehapp FastAPI projesine ekleyin.

Kurulum:
  pip install PyJWT

Rehapp main.py veya routers/__init__.py'e ekleyin:
  from routers.bkds_router import router as bkds_router
  app.include_router(bkds_router, prefix="/bkds", tags=["bkds"])

.env / settings'e ekleyin:
  BKDS_SSO_SECRET=gizli-paylasilan-anahtar-buraya
  BKDS_APP_URL=https://bkds.rehapp.com        # Production
  # BKDS_APP_URL=http://localhost:3000         # Development
"""

import time
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

# Rehapp'ınızın mevcut bağımlılıklarına göre import'ları uyarlayın:
# from core.config import settings
# from core.security import get_current_user
# from models.user import User
# from models.organization import Organization

router = APIRouter()


def create_bkds_sso_token(
    user_email: str,
    user_name: str,
    user_role: str,          # "admin" | "yonetici" | "danisma"
    org_slug: str,           # bkds-takip'teki Organization.slug ile eşleşmeli
    sso_secret: str,
    bkds_app_url: str,
    ttl_seconds: int = 300,  # 5 dakika
) -> str:
    """Rehapp kullanıcısı için BKDS SSO token üretir."""
    now = int(time.time())
    payload = {
        "sub": user_email,
        "email": user_email,
        "name": user_name,
        "role": user_role,
        "org_slug": org_slug,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    token = jwt.encode(payload, sso_secret, algorithm="HS256")
    return f"{bkds_app_url}/api/sso?token={token}"


# ---------------------------------------------------------------------------
# FastAPI Endpoint
# ---------------------------------------------------------------------------

@router.get("/redirect")
async def bkds_redirect(
    # current_user: User = Depends(get_current_user),  # ← kendi auth'unuzu kullanın
):
    """
    Rehapp kullanıcısını BKDS Takip uygulamasına SSO ile yönlendirir.

    Streamlit veya frontend'den çağrılır:
        GET /bkds/redirect
        Authorization: Bearer <rehapp_jwt>

    Yanıt: 302 → bkds-takip /dashboard
    """
    # TODO: Aşağıdaki satırları kendi Rehapp modellerine göre uyarlayın
    # ---------------------------------------------------------------
    # user = current_user
    # org = user.organization  # veya await db.get(Organization, user.organization_id)
    #
    # # Rol eşleştirme (Rehapp rolünü BKDS rolüne çevir)
    # role_map = {
    #     "superadmin": "admin",
    #     "admin": "admin",
    #     "manager": "yonetici",
    #     "counselor": "danisma",
    # }
    # bkds_role = role_map.get(user.role, "danisma")
    #
    # redirect_url = create_bkds_sso_token(
    #     user_email=user.email,
    #     user_name=user.full_name,
    #     user_role=bkds_role,
    #     org_slug=org.slug,           # bkds-takip Organization.slug ile aynı olmalı
    #     sso_secret=settings.BKDS_SSO_SECRET,
    #     bkds_app_url=settings.BKDS_APP_URL,
    # )
    # return RedirectResponse(url=redirect_url)
    # ---------------------------------------------------------------

    # Geçici placeholder (entegrasyon tamamlanana kadar):
    raise HTTPException(status_code=501, detail="BKDS entegrasyonu henüz yapılandırılmadı")


# ---------------------------------------------------------------------------
# Abonelik kontrolü (opsiyonel — UI'da buton göster/gizle için)
# ---------------------------------------------------------------------------

@router.get("/status")
async def bkds_status(
    # current_user: User = Depends(get_current_user),
):
    """
    Kurumun aktif BKDS aboneliği olup olmadığını döner.
    Streamlit'te butonu göster/gizle kararı için kullanılır.

    Yanıt:
        { "active": true, "plan": "profesyonel" }
        { "active": false, "reason": "abonelik_yok" }
    """
    # TODO: Kendi abonelik modelinize göre uyarlayın
    # sub = await db.get(BkdsSubscription, current_user.organization_id)
    # if not sub or sub.status not in ("aktif", "deneme"):
    #     return {"active": False, "reason": sub.status if sub else "abonelik_yok"}
    # return {"active": True, "plan": sub.plan}

    return {"active": True, "plan": "demo"}  # Geçici
