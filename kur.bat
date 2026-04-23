@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion
title BKDS Takip — Kurulum

REM Her zaman script'in kendi klasöründen çalış (cift-tik edildiginde nereden
REM cagrildigindan bagimsiz olarak dogru yerde oluruz)
cd /d "%~dp0"

echo.
echo ========================================
echo   BKDS Takip — Kurulum Baslatiliyor
echo ========================================
echo   Klasor: %CD%
echo.

REM package.json kontrolu — yanlis klasordeysek anlasilir hata ver
if not exist "package.json" (
    echo [HATA] Bu klasorde package.json yok: %CD%
    echo.
    echo kur.bat, proje kok klasorunde calistirilmalidir (src/, prisma/, .env ile birlikte).
    echo.
    pause
    exit /b 1
)

REM Node.js kontrolu
where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi.
    echo.
    echo Lutfen once Node.js LTS surumunu kur:
    echo   https://nodejs.org/tr/download
    echo.
    pause
    exit /b 1
)

echo [1/6] Paketler indiriliyor (npm install)...
call npm install
if errorlevel 1 goto :hata

echo.
echo [2/6] Prisma client uretiliyor...
REM Yerel node_modules'taki prisma 5.14'u kullan (npx farkli surum indirmesin)
call npm run db:generate
if errorlevel 1 goto :hata

echo.
echo [3/6] Veritabani olusturuluyor (dev.db)...
call npm run db:push
if errorlevel 1 goto :hata

echo.
echo [4/6] Demo kurum + admin hesabi ekleniyor...
call npm run db:seed
if errorlevel 1 (
    echo [UYARI] Seed basarisiz ya da zaten mevcut. Devam ediliyor...
)

echo.
echo [5/6] Production build...
call npm run build
if errorlevel 1 goto :hata

echo.
echo [6/6] PM2 kuruluyor ve servis baslatiliyor...
call npm install -g pm2
call pm2 delete bkds-takip 2>nul
call pm2 start npm --name bkds-takip -- start
call pm2 save

REM Windows startup icin pm2-windows-startup
call npm install -g pm2-windows-startup 2>nul
call pm2-startup install 2>nul

echo.
echo ========================================
echo   KURULUM TAMAMLANDI
echo ========================================
echo.
echo Tarayicidan ac: http://localhost:3000
echo.
echo Giris bilgileri:
echo   admin@kurum.com / admin123
echo.
echo Uygulamayi yeniden baslatmak icin: baslat.bat
echo Durdurmak icin CMD'de: pm2 stop bkds-takip
echo.
pause
exit /b 0

:hata
echo.
echo ========================================
echo   HATA OLUSTU
echo ========================================
echo.
echo Yukaridaki mesajlari kontrol et.
echo Yardim icin gelistiriciye bildir.
echo.
pause
exit /b 1
