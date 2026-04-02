"""
BKDS Takip — Streamlit Modülü
==============================
Bu dosyayı Rehapp Streamlit projesine ekleyin.

Kullanım (pages/bkds_takip.py veya sidebar'a ekle):
    from bkds_page import render_bkds_page
    render_bkds_page(current_user, api_base_url)

Bağımlılıklar (zaten yüklü olmalı):
    pip install streamlit requests
"""

import streamlit as st
import requests


def get_bkds_redirect_url(api_base_url: str, auth_token: str) -> dict:
    """
    Rehapp backend'inden BKDS yönlendirme URL'ini alır.
    /bkds/redirect endpoint'i 302 döner ama biz önce /bkds/status ile kontrol ederiz.
    """
    headers = {"Authorization": f"Bearer {auth_token}"}
    try:
        resp = requests.get(f"{api_base_url}/bkds/status", headers=headers, timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"active": False, "reason": str(e)}


def render_bkds_button(api_base_url: str, auth_token: str, bkds_app_url: str) -> None:
    """
    BKDS Takip butonu ve yönlendirme.
    Sidebar veya ana sayfaya yerleştirin.
    """
    status = get_bkds_redirect_url(api_base_url, auth_token)

    if not status.get("active"):
        reason = status.get("reason", "bilinmeyen")
        if reason == "abonelik_yok":
            st.info("BKDS Takip modülü aboneliğinize dahil değil. Yükseltmek için iletişime geçin.")
        else:
            st.warning(f"BKDS Takip şu anda kullanılamıyor: {reason}")
        return

    # SSO redirect URL'i — backend'den alıyoruz (token üretimi backend'de)
    redirect_url = f"{api_base_url}/bkds/redirect"

    st.markdown(
        f"""
        <a href="{redirect_url}" target="_blank">
            <button style="
                background-color: #2563EB;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px 20px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                📊 BKDS Takip
            </button>
        </a>
        """,
        unsafe_allow_html=True,
    )


def render_bkds_page(current_user=None, api_base_url: str = "", auth_token: str = "") -> None:
    """
    Tam BKDS Takip sayfası.
    pages/bkds_takip.py olarak ekleyin veya mevcut sayfaya çağırın.
    """
    st.title("📊 BKDS Devamsızlık Takibi")

    if not current_user:
        st.error("Lütfen giriş yapın.")
        return

    st.markdown(
        """
        BKDS Takip, öğrenci ve personel devamsızlıklarını gerçek zamanlı izlemenizi sağlar.

        **Özellikler:**
        - Gerçek zamanlı BKDS sorgusu
        - Öğrenci ve personel devamsızlık takibi
        - Otomatik alert sistemi
        - Lila sistemi entegrasyonu
        - Günlük/aylık raporlar
        """
    )

    col1, col2 = st.columns([2, 1])

    with col1:
        st.subheader("BKDS Takip Uygulamasını Aç")
        st.caption("Aşağıdaki butona tıklayarak BKDS Takip uygulamasına otomatik giriş yapabilirsiniz.")
        render_bkds_button(api_base_url, auth_token, "")

    with col2:
        st.subheader("Hızlı Durum")
        # Opsiyonel: Rehapp backend üzerinden özet istatistikleri göster
        # Bu kısım için ayrı bir /bkds/summary endpoint ekleyebilirsiniz
        st.metric("Bugünkü Dersler", "—")
        st.metric("Aktif Alertler", "—")
        st.caption("Detaylar için BKDS Takip uygulamasını açın.")


# ---------------------------------------------------------------------------
# Sidebar entegrasyonu (sidebar.py veya app.py'de kullanın)
# ---------------------------------------------------------------------------

def render_bkds_sidebar_item(api_base_url: str, auth_token: str) -> None:
    """
    Rehapp sidebar'ına BKDS butonu ekler.

    app.py veya sidebar.py'de:
        from bkds_page import render_bkds_sidebar_item
        with st.sidebar:
            render_bkds_sidebar_item(API_URL, st.session_state.token)
    """
    st.sidebar.markdown("---")
    st.sidebar.markdown("**Ek Modüller**")
    render_bkds_button(api_base_url, auth_token, "")


# ---------------------------------------------------------------------------
# Standalone test (python bkds_page.py ile çalıştırın)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    st.set_page_config(page_title="BKDS Takip", page_icon="📊", layout="wide")

    # Test için — gerçek API URL ve token'ınızı girin
    API_URL = "http://localhost:8000"
    TEST_TOKEN = "test-token"

    render_bkds_page(
        current_user={"email": "test@example.com"},
        api_base_url=API_URL,
        auth_token=TEST_TOKEN,
    )
