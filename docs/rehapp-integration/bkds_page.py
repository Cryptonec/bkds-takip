"""
bkds_page.py — Rehapp Streamlit bileşeni
BKDS Takip'e yönlendiren butonu Streamlit arayüzüne ekler.

Kullanım (Streamlit sayfasında):
    from bkds_page import render_bkds_button
    render_bkds_button(current_user)

    veya tam sayfa olarak:
    from bkds_page import render_bkds_page
    render_bkds_page(current_user)
"""

import streamlit as st
import os
from typing import Any

# FastAPI sunucusunun base URL'i (Streamlit'ten erişilebilir olmalı)
# TODO: kendi konfigürasyonundan al
REHAPP_API_URL = os.getenv("REHAPP_INTERNAL_API_URL", "http://localhost:8000")


def render_bkds_button(current_user: Any, label: str = "📊 BKDS Takip") -> None:
    """
    Sidebar veya herhangi bir Streamlit sayfasına BKDS butonu ekler.
    Butona tıklandığında FastAPI /bkds/redirect endpoint'ine gider,
    oradan BKDS Takip uygulamasına SSO ile yönlendirilir.

    Args:
        current_user: Oturum açmış Rehapp kullanıcısı
        label: Buton etiketi
    """
    bkds_url = f"{REHAPP_API_URL}/bkds/redirect"

    # Streamlit'te yeni sekmede açmak için JavaScript kullan
    st.markdown(
        f"""
        <a href="{bkds_url}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block; padding:0.4rem 1rem; background:#1d4ed8;
                  color:white; border-radius:6px; text-decoration:none;
                  font-size:0.9rem; font-weight:500;">
          {label}
        </a>
        """,
        unsafe_allow_html=True,
    )


def render_bkds_page(current_user: Any) -> None:
    """
    BKDS Takip'e yönlendirme sayfası.
    Streamlit'te ayrı bir sayfa (page) olarak kullanılabilir.
    """
    st.title("BKDS Takip")
    st.write(
        "Öğrenci ve personel BKDS (Biyometrik Kimlik Doğrulama Sistemi) "
        "devam takip paneline yönlendiriliyorsunuz."
    )

    col1, col2 = st.columns([1, 3])
    with col1:
        render_bkds_button(current_user, label="BKDS Takip'e Git →")

    st.caption(
        "Bu butona tıklayarak otomatik giriş yapılır. "
        "Tekrar giriş bilgisi girmenize gerek yoktur."
    )


# ── Sidebar'a entegrasyon örneği ────────────────────────────────────────────
#
# app/sidebar.py veya navigation bileşeninize ekleyin:
#
#   from bkds_page import render_bkds_button
#
#   with st.sidebar:
#       st.divider()
#       render_bkds_button(st.session_state.current_user)
#
# ── Ayrı sayfa olarak ───────────────────────────────────────────────────────
#
# pages/bkds.py dosyası oluşturun:
#
#   import streamlit as st
#   from bkds_page import render_bkds_page
#
#   if "current_user" not in st.session_state:
#       st.error("Lütfen giriş yapın")
#       st.stop()
#
#   render_bkds_page(st.session_state.current_user)
