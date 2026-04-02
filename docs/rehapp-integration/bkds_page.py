"""
bkds_page.py — Rehapp Streamlit entegrasyonu (Rehapp-spesifik implementasyon)

Streamlit'in Authorization header gönderememesi nedeniyle:
  1. Python kodu FastAPI /bkds/sso-url endpoint'ini çağırır (server-side)
  2. Dönen redirect_url'i HTML link olarak render eder
  3. Her sayfa render'ında taze URL üretilir (token 2 dk geçerli)

Kullanım seçenekleri:
  A) Sidebar'a buton ekle     → render_bkds_sidebar_button()
  B) Ayrı sayfa oluştur       → pages/bkds.py oluştur, render_bkds_page() çağır
  C) Herhangi bir sayfada     → render_bkds_button() çağır
"""

import os
import httpx
import streamlit as st

# Rehapp backend URL — Streamlit server'dan erişilebilir olmalı
REHAPP_API_URL = os.getenv("REHAPP_INTERNAL_API_URL", "http://localhost:8000")


def _fetch_bkds_url() -> str | None:
    """
    FastAPI /bkds/sso-url endpoint'ini çağırır, redirect URL döner.
    Hata durumunda None döner.

    st.session_state["token"] JWT token'ını kullanır.
    """
    token = st.session_state.get("token")
    if not token:
        return None

    try:
        resp = httpx.get(
            f"{REHAPP_API_URL}/bkds/sso-url",
            headers={"Authorization": f"Bearer {token}"},
            timeout=8.0,
            follow_redirects=False,  # FastAPI JSON döndürüyor, redirect yok
        )
        resp.raise_for_status()
        return resp.json().get("redirect_url")
    except Exception:
        return None


def render_bkds_button(label: str = "BKDS Takip") -> None:
    """
    BKDS Takip'e yönlendiren SSO butonu.
    Yeni sekmede açılır. Her render'da taze token üretilir.
    """
    bkds_url = _fetch_bkds_url()

    if bkds_url:
        st.markdown(
            f"""
            <a href="{bkds_url}" target="_blank" rel="noopener noreferrer"
               style="display:inline-flex; align-items:center; gap:6px;
                      padding:0.45rem 1.1rem; background:#1d4ed8; color:white;
                      border-radius:6px; text-decoration:none; font-size:0.9rem;
                      font-weight:500; white-space:nowrap;">
              📊 {label}
            </a>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.warning("BKDS bağlantısı kurulamadı. Lütfen daha sonra tekrar deneyin.")


def render_bkds_sidebar_button() -> None:
    """
    Sidebar'a BKDS butonu ekler.
    app.py'daki sidebar bölümüne ekle:

        from bkds_page import render_bkds_sidebar_button
        with st.sidebar:
            st.divider()
            render_bkds_sidebar_button()
    """
    with st.sidebar:
        st.divider()
        render_bkds_button(label="BKDS Takip")


def render_bkds_page() -> None:
    """
    BKDS Takip sayfası — pages/bkds.py olarak kullan.

    pages/bkds.py içeriği:
        import streamlit as st
        from bkds_page import render_bkds_page

        if st.session_state.get("page") != "app":
            st.error("Lütfen giriş yapın.")
            st.stop()
        render_bkds_page()
    """
    kurum_ad = st.session_state.get("kurum_ad", "")

    st.title("BKDS Devam Takip")
    if kurum_ad:
        st.caption(f"Kurum: {kurum_ad}")

    st.write(
        "Öğrenci ve personelin BKDS (Biyometrik Kimlik Doğrulama) "
        "kayıtlarını gerçek zamanlı takip edin."
    )

    bkds_url = _fetch_bkds_url()

    if bkds_url:
        st.markdown(
            f"""
            <a href="{bkds_url}" target="_blank" rel="noopener noreferrer"
               style="display:inline-flex; align-items:center; gap:8px;
                      padding:0.6rem 1.4rem; background:#1d4ed8; color:white;
                      border-radius:8px; text-decoration:none; font-size:1rem;
                      font-weight:600;">
              📊 BKDS Takip'i Aç
            </a>
            """,
            unsafe_allow_html=True,
        )
        st.caption("Yeni sekmede açılır. Tekrar giriş gerektirmez.")
    else:
        st.error(
            "BKDS bağlantısı kurulamadı. "
            "Kurumunuzun BKDS Takip'te tanımlı olduğundan emin olun."
        )
