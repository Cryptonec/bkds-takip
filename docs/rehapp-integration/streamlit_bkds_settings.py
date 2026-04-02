# rehapp-frontend/pages/admin.py (veya yonetim.py) içine ekle
#
# Bu fonksiyonu sayfanın uygun yerine çağır:
#     render_bkds_credentials_form()
#
# Gerekli: api_client.py'da şu fonksiyonlar olmalı (aşağıda da tanımlı)

import streamlit as st
import requests
import os

API_URL = os.getenv("REHAPP_API_URL", "http://localhost:8000")


# ── api_client.py'a eklenecek fonksiyonlar ───────────────────────────────

def get_bkds_credentials(token: str) -> dict:
    r = requests.get(
        f"{API_URL}/kurum/bkds-credentials",
        headers={"Authorization": f"Bearer {token}"},
        timeout=8,
    )
    r.raise_for_status()
    return r.json()


def update_bkds_credentials(token: str, email: str, password: str) -> dict:
    payload = {}
    if email:
        payload["bkds_email"] = email
    if password:
        payload["bkds_password"] = password
    r = requests.patch(
        f"{API_URL}/kurum/bkds-credentials",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=8,
    )
    r.raise_for_status()
    return r.json()


# ── Streamlit form bileşeni ───────────────────────────────────────────────

def render_bkds_credentials_form() -> None:
    """
    BKDS Takip giriş bilgilerini ayarlama formu.
    pages/admin.py veya yonetim.py içinde uygun bir bölüme çağır.
    """
    st.subheader("BKDS Takip Bağlantısı")

    token = st.session_state.get("token")
    if not token:
        st.warning("Oturum bulunamadı.")
        return

    # Mevcut durumu çek
    try:
        current = get_bkds_credentials(token)
    except Exception:
        current = {"bkds_email": None, "bkds_configured": False}

    if current["bkds_configured"]:
        st.success(f"✓ Bağlı: {current['bkds_email']}")
    else:
        st.info("BKDS Takip bağlantısı henüz ayarlanmamış.")

    with st.expander(
        "Bağlantı bilgilerini güncelle" if current["bkds_configured"] else "Bağlantı bilgilerini gir",
        expanded=not current["bkds_configured"],
    ):
        st.caption(
            "Bu bilgiler BKDS Takip uygulamasındaki kurum hesabınıza aittir. "
            "Superadmin sizin için bir hesap oluşturduktan sonra buraya giriniz."
        )

        with st.form("bkds_credentials_form"):
            new_email = st.text_input(
                "BKDS Takip E-posta",
                value=current.get("bkds_email") or "",
                placeholder="admin@kurumunuz.com",
            )
            new_password = st.text_input(
                "BKDS Takip Şifresi",
                type="password",
                placeholder="Değiştirmek istemiyorsanız boş bırakın",
            )

            submitted = st.form_submit_button("Kaydet", type="primary")

        if submitted:
            if not new_email:
                st.error("E-posta boş olamaz.")
                return
            try:
                result = update_bkds_credentials(token, new_email, new_password)
                if result["bkds_configured"]:
                    st.success("Kaydedildi! BKDS butonu artık çalışacak.")
                    st.rerun()
                else:
                    st.warning("E-posta kaydedildi ancak şifre eksik.")
            except requests.HTTPError as e:
                st.error(f"Kayıt başarısız: {e.response.status_code}")
            except Exception as e:
                st.error(f"Bağlantı hatası: {e}")
