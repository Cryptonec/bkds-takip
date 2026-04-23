@echo off
chcp 65001 > nul
title BKDS Takip — Baslat

echo.
echo BKDS Takip servisi baslatiliyor...
echo.

REM PM2 yuklu mu kontrol
where pm2 >nul 2>nul
if errorlevel 1 (
    echo [HATA] PM2 bulunamadi. Once kur.bat'i calistir.
    pause
    exit /b 1
)

REM Servis zaten varsa restart, yoksa start
pm2 describe bkds-takip >nul 2>nul
if errorlevel 1 (
    echo Servis yok, baslatiliyor...
    call pm2 start ecosystem.config.js
    call pm2 save
) else (
    echo Servis yeniden baslatiliyor...
    call pm2 restart bkds-takip
)

echo.
echo Tamamlandi. Tarayicidan ac: http://localhost:3000
echo.
echo Durum icin: pm2 status
echo Log icin:   pm2 logs bkds-takip
echo.
pause
