#!/bin/bash
set -e

# Renkler
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "  ${YELLOW}[!]${NC}  $1"; }
error() { echo -e "  ${RED}[HATA]${NC} $1"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       BKDS Takip Kurulum Sihirbazı       ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── Docker kontrolü ──────────────────────────────────────────────────────────
docker info >/dev/null 2>&1 || error "Docker çalışmıyor. Lütfen Docker Desktop'ı başlatın."
ok "Docker çalışıyor."

# ── Güncelleme modu ──────────────────────────────────────────────────────────
if [ -f .env ]; then
    warn "Mevcut kurulum bulundu."
    read -r -p "  Güncellemek ve yeniden başlatmak ister misiniz? (e/H): " GUNCELLE
    if [[ "${GUNCELLE,,}" == "e" ]]; then
        docker compose up --build -d
        ok "Güncellendi. http://localhost:3000"
        exit 0
    fi
    exit 0
fi

# ── Bilgileri al ─────────────────────────────────────────────────────────────
echo ""
echo "  Kurum bilgilerini girin:"
echo "  (Rehapp'taki org_slug ile eşleşmeli)"
echo ""

while true; do
    read -r -p "  Kurum Kısa Adı (küçük harf, tire ile, ör: ankara-rem): " ORG_SLUG
    [[ -z "$ORG_SLUG" ]] && continue
    [[ "$ORG_SLUG" =~ ^[a-z0-9-]+$ ]] && break
    warn "Sadece küçük harf, rakam ve tire kullanın."
done

read -r -p "  Kurum Tam Adı (ör: Ankara RAM): " ORG_NAME
[[ -z "$ORG_NAME" ]] && ORG_NAME="$ORG_SLUG"

while true; do
    read -r -p "  Yönetici E-posta: " ADMIN_EMAIL
    [[ "$ADMIN_EMAIL" == *@* ]] && break
    warn "Geçerli bir e-posta girin."
done

while true; do
    read -r -s -p "  Yönetici Şifre (en az 6 karakter): " ADMIN_PASSWORD
    echo ""
    [[ ${#ADMIN_PASSWORD} -ge 6 ]] && break
    warn "Şifre en az 6 karakter olmalı."
done

# ── Secret'lar üret ──────────────────────────────────────────────────────────
echo ""
echo "  Güvenlik anahtarları üretiliyor..."

DB_PASSWORD=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
SSO_SECRET=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')

# ── .env oluştur ─────────────────────────────────────────────────────────────
cat > .env <<EOF
DB_PASSWORD=${DB_PASSWORD}
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
SSO_SECRET=${SSO_SECRET}
BKDS_POLL_INTERVAL=60000
EOF

ok ".env oluşturuldu."

# ── Docker başlat ────────────────────────────────────────────────────────────
echo ""
echo "  Docker imajı derleniyor (ilk seferde birkaç dakika sürebilir)..."
docker compose up --build -d
ok "Docker servisleri başlatıldı."

# ── Uygulama hazır olana kadar bekle ─────────────────────────────────────────
echo ""
echo "  Uygulama başlatılıyor, lütfen bekleyin..."
DENEME=0
while true; do
    DENEME=$((DENEME + 1))
    if [ $DENEME -gt 40 ]; then
        error "Uygulama 2 dakika içinde başlamadı.\nGünlükler: docker compose logs app"
    fi
    if curl -sf http://localhost:3000 >/dev/null 2>&1; then
        break
    fi
    sleep 3
done
ok "Uygulama hazır."

# ── Kurum oluştur ────────────────────────────────────────────────────────────
echo ""
echo "  Kurum ve yönetici hesabı oluşturuluyor..."

RESPONSE=$(curl -sf -X POST http://localhost:3000/api/setup/org \
    -H "Content-Type: application/json" \
    -d "{\"secret\":\"${SSO_SECRET}\",\"slug\":\"${ORG_SLUG}\",\"name\":\"${ORG_NAME}\",\"adminEmail\":\"${ADMIN_EMAIL}\",\"adminPassword\":\"${ADMIN_PASSWORD}\",\"plan\":\"basic\"}" \
    2>&1) || error "API çağrısı başarısız: $RESPONSE"

if echo "$RESPONSE" | grep -q '"ok":true'; then
    ok "Kurum oluşturuldu: $ORG_NAME"
else
    error "Kurum oluşturulamadı: $RESPONSE"
fi

# ── Tamamlandı ───────────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║          Kurulum Tamamlandı!             ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "   Uygulama adresi : http://localhost:3000"
echo "   Giriş           : Rehapp SSO ile yapın"
echo ""
echo "   Durdurmak için  : docker compose stop"
echo "   Yeniden başlat  : docker compose start"
echo "   Günlükler       : docker compose logs -f app"
echo ""

# Tarayıcıda aç
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:3000
elif command -v open >/dev/null 2>&1; then
    open http://localhost:3000
fi
