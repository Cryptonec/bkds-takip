@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion
title BKDS Takip — Kurulum

echo.
echo ========================================
echo   BKDS Takip — Kurulum Baslatiliyor
echo ========================================
echo.

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
call npx prisma generate
if errorlevel 1 goto :hata

echo.
echo [3/6] Veritabani olusturuluyor (dev.db)...
call npx prisma db push
if errorlevel 1 goto :hata

echo.
echo [4/6] Demo kurum + admin hesabi ekleniyor...
call npx prisma db seed
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
