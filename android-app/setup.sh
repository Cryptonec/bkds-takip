#!/usr/bin/env bash
# ============================================================
# BKDS Takip — Android APK Kurulum Betiği
# ============================================================
# Kullanım:
#   cd android-app
#   npm install
#   bash setup.sh
#   npx cap add android
#   npx cap sync android
#   npx cap open android   # Android Studio ile aç → Build APK
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/android/app/src/main"

echo "==> BKDS Takip Android kurulumu başlıyor..."

# ── 1. Network Security Config ──────────────────────────────
if [ -d "$ANDROID_DIR/res/xml" ]; then
  cp "$SCRIPT_DIR/patches/network_security_config.xml" \
     "$ANDROID_DIR/res/xml/network_security_config.xml"
  echo "    [OK] network_security_config.xml kopyalandı"
else
  echo "    [UYARI] android/ dizini henüz yok — önce 'npx cap add android' çalıştırın"
fi

# ── 2. AndroidManifest.xml yamaları ─────────────────────────
MANIFEST="$ANDROID_DIR/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  # Yatay mod (tablet)
  if ! grep -q "screenOrientation=\"landscape\"" "$MANIFEST"; then
    sed -i 's/android:configChanges="/android:screenOrientation="landscape"\n            android:configChanges="/g' "$MANIFEST"
    echo "    [OK] screenOrientation=landscape eklendi"
  fi

  # Ekranı açık tut (kiosk mod için)
  if ! grep -q "keepScreenOn" "$MANIFEST"; then
    sed -i 's/<application/<application android:keepScreenOn="true"/g' "$MANIFEST"
    echo "    [OK] keepScreenOn eklendi"
  fi

  # Network security config referansı
  if ! grep -q "networkSecurityConfig" "$MANIFEST"; then
    sed -i 's/<application/<application android:networkSecurityConfig="@xml\/network_security_config"/g' "$MANIFEST"
    echo "    [OK] networkSecurityConfig referansı eklendi"
  fi
else
  echo "    [UYARI] AndroidManifest.xml bulunamadı — sonra tekrar çalıştırın"
fi

# ── 3. Sunucu IP'si ayarla ──────────────────────────────────
CONFIG_JS="$SCRIPT_DIR/www/js/config.js"
echo ""
echo "==> Sunucu IP yapılandırması"
echo "    Mevcut sunucu URL: $(grep 'SERVER_URL' "$CONFIG_JS" | head -1)"
echo ""
read -rp "    Sunucu IP:Port girin (örn: 192.168.1.50:3000) [boş bırakın=değiştirme]: " SERVER_INPUT
if [ -n "$SERVER_INPUT" ]; then
  # http:// ön eki yoksa ekle
  if [[ "$SERVER_INPUT" != http* ]]; then
    SERVER_INPUT="http://$SERVER_INPUT"
  fi
  sed -i "s|SERVER_URL: '.*'|SERVER_URL: '$SERVER_INPUT'|" "$CONFIG_JS"

  # capacitor.config.ts'i de güncelle
  CAP_CONFIG="$SCRIPT_DIR/capacitor.config.ts"
  sed -i "s|url: '.*'|url: '$SERVER_INPUT/ekran'|" "$CAP_CONFIG"

  echo "    [OK] Sunucu URL güncellendi: $SERVER_INPUT"
fi

echo ""
echo "==> Kurulum tamamlandı!"
echo ""
echo "Sonraki adımlar:"
echo "  1. npx cap add android        # (ilk kez)"
echo "  2. npx cap sync android       # (her değişiklikte)"
echo "  3. npx cap open android       # Android Studio aç"
echo "  4. Android Studio → Build → Generate Signed APK"
echo ""
echo "Not: APK'yı tablette kurmak için 'Bilinmeyen kaynaklara izin ver' açık olmalı."
