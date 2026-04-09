#!/bin/sh
set -e

echo ""
echo "╔══════════════════════════════════╗"
echo "║      BKDS Takip başlatılıyor     ║"
echo "╚══════════════════════════════════╝"
echo ""

echo "► Veritabanı migrasyonları uygulanıyor..."
./node_modules/.bin/prisma migrate deploy
echo "✓ Migrasyonlar tamam."
echo ""

echo "► Uygulama başlatılıyor (port 3000)..."
exec node server.js
