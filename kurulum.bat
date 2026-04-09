@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title BKDS Takip - Kurulum

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       BKDS Takip Kurulum Sihirbazı       ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── Docker kontrolü ──────────────────────────────────────────────────────────
docker info >nul 2>&1
if errorlevel 1 (
    echo  [HATA] Docker Desktop çalışmıyor veya kurulu değil.
    echo.
    echo  Lütfen Docker Desktop'ı indirip kurun ve başlatın:
    echo  https://www.docker.com/products/docker-desktop
    echo.
    pause & exit /b 1
)
echo  [OK] Docker çalışıyor.

:: ── Zaten kuruluysa güncelleme moduna geç ────────────────────────────────────
if exist .env (
    echo.
    echo  Mevcut kurulum bulundu.
    echo  Uygulamayı güncellemek ve yeniden başlatmak istiyor musunuz?
    echo.
    set /p GUNCELLE="  Evet için E, çıkmak için başka bir tuş: "
    if /i "!GUNCELLE!"=="E" goto :guncelle
    exit /b 0
)

:: ── İlk kurulum — bilgileri al ───────────────────────────────────────────────
echo.
echo  Kurum bilgilerini girin:
echo  (Rehapp'taki org_slug ile eşleşmeli)
echo.

:ask_slug
set /p ORG_SLUG="  Kurum Kısa Adı (küçük harf, tire ile, ör: ankara-rem): "
if "!ORG_SLUG!"=="" goto :ask_slug
:: Boşluk içeriyor mu kontrol et
echo !ORG_SLUG! | findstr " " >nul
if not errorlevel 1 (
    echo  [HATA] Boşluk kullanmayın, tire kullanın. Örnek: ankara-rem
    goto :ask_slug
)

set /p ORG_NAME="  Kurum Tam Adı (ör: Ankara Rehberlik ve Araştırma Merkezi): "
if "!ORG_NAME!"=="" set ORG_NAME=!ORG_SLUG!

:ask_email
set /p ADMIN_EMAIL="  Yönetici E-posta: "
if "!ADMIN_EMAIL!"=="" goto :ask_email

:ask_pass
set /p ADMIN_PASSWORD="  Yönetici Şifre (en az 6 karakter): "
if "!ADMIN_PASSWORD!"=="" goto :ask_pass

:: ── Rastgele secret'lar üret (PowerShell) ───────────────────────────────────
echo.
echo  Güvenlik anahtarları üretiliyor...

for /f "tokens=*" %%a in ('powershell -NoProfile -Command "[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('/','_').Replace('+','-').Replace('=','')"') do set DB_PASSWORD=%%a
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('/','_').Replace('+','-').Replace('=','')"') do set NEXTAUTH_SECRET=%%a
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('/','_').Replace('+','-').Replace('=','')"') do set SSO_SECRET=%%a

:: ── .env dosyasını oluştur ───────────────────────────────────────────────────
(
echo DB_PASSWORD=!DB_PASSWORD!
echo NEXTAUTH_URL=http://localhost:3000
echo NEXTAUTH_SECRET=!NEXTAUTH_SECRET!
echo SSO_SECRET=!SSO_SECRET!
echo BKDS_POLL_INTERVAL=60000
) > .env

echo  [OK] .env oluşturuldu.

:: ── Docker imajını derle ve başlat ───────────────────────────────────────────
:guncelle
echo.
echo  Docker imajı derleniyor (ilk seferde birkaç dakika sürebilir)...
docker compose up --build -d
if errorlevel 1 (
    echo.
    echo  [HATA] Docker başlatılamadı. Yukarıdaki hata mesajını kontrol edin.
    pause & exit /b 1
)

:: ── Uygulama hazır olana kadar bekle ─────────────────────────────────────────
echo.
echo  Uygulama başlatılıyor, lütfen bekleyin...
set DENEME=0
:wait_loop
set /a DENEME+=1
if !DENEME! GTR 40 (
    echo  [HATA] Uygulama 2 dakika içinde başlamadı.
    echo  Günlükleri görmek için: docker compose logs app
    pause & exit /b 1
)
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Sleep -Seconds 3" >nul
    goto :wait_loop
)
echo  [OK] Uygulama hazır.

:: ── Güncelleme modunda kurum kurulumu atla ───────────────────────────────────
if not defined ORG_SLUG goto :done

:: ── Kurum ve yönetici oluştur ────────────────────────────────────────────────
echo.
echo  Kurum ve yönetici hesabı oluşturuluyor...

powershell -NoProfile -Command ^
  "$body = @{ secret='!SSO_SECRET!'; slug='!ORG_SLUG!'; name='!ORG_NAME!'; adminEmail='!ADMIN_EMAIL!'; adminPassword='!ADMIN_PASSWORD!'; plan='basic' } | ConvertTo-Json;" ^
  "$r = Invoke-RestMethod -Uri 'http://localhost:3000/api/setup/org' -Method POST -ContentType 'application/json' -Body $body;" ^
  "if ($r.ok) { Write-Host '  [OK] Kurum olusturuldu:' $r.org.name } else { Write-Host '  [HATA]' $r; exit 1 }"

if errorlevel 1 (
    echo.
    echo  [HATA] Kurum oluşturulamadı. Zaten mevcut olabilir veya bir sorun oluştu.
    pause & exit /b 1
)

:: ── Tamamlandı ────────────────────────────────────────────────────────────────
:done
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║          Kurulum Tamamlandı!             ║
echo  ╚══════════════════════════════════════════╝
echo.
echo   Uygulama adresi : http://localhost:3000
echo   Giriş           : Rehapp SSO ile yapın
echo.
echo   Durdurmak için  : docker compose stop
echo   Yeniden başlat  : docker compose start
echo   Günlükler       : docker compose logs -f app
echo.

set /p AC="  Tarayıcıda açmak ister misiniz? (E/H): "
if /i "!AC!"=="E" start http://localhost:3000
echo.
pause
