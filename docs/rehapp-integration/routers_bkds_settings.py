# rehapp-backend/routers/bkds_settings.py — YENİ DOSYA
#
# main.py'a ekle:
#     from routers.bkds_settings import router as bkds_settings_router
#     app.include_router(bkds_settings_router, prefix="/kurum", tags=["Kurum"])
#
# (Mevcut bkds_router ile karıştırma — o SSO yönlendirmesini yapıyor,
#  bu router BKDS kimlik bilgilerini kaydetmek için.)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from auth import get_current_kurum
from models import Kurum
from schemas import BkdsCredentialsUpdate, BkdsCredentialsOut

router = APIRouter()


@router.get(
    "/bkds-credentials",
    response_model=BkdsCredentialsOut,
    summary="BKDS giriş bilgilerini getir",
)
def get_bkds_credentials(
    kurum: Kurum = Depends(get_current_kurum),
):
    return BkdsCredentialsOut(
        bkds_email=kurum.bkds_email,
        bkds_configured=bool(kurum.bkds_email and kurum.bkds_password),
    )


@router.patch(
    "/bkds-credentials",
    response_model=BkdsCredentialsOut,
    summary="BKDS giriş bilgilerini güncelle",
)
def update_bkds_credentials(
    body: BkdsCredentialsUpdate,
    kurum: Kurum = Depends(get_current_kurum),
    db: Session = Depends(get_db),
):
    if body.bkds_email is not None:
        kurum.bkds_email = body.bkds_email.strip() or None

    if body.bkds_password is not None:
        # Boş string → temizle; dolu string → kaydet
        kurum.bkds_password = body.bkds_password or None

    db.commit()
    db.refresh(kurum)

    return BkdsCredentialsOut(
        bkds_email=kurum.bkds_email,
        bkds_configured=bool(kurum.bkds_email and kurum.bkds_password),
    )
