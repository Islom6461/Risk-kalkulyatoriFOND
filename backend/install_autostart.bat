@echo off
chcp 65001 >nul
title ZA_ISLAMIC Backend — avtomatik ishga tushirish o'rnatuvchisi
cd /d "%~dp0"

echo ============================================================
echo   ZA_ISLAMIC backend — Windows da avtomatik ishga tushirish
echo ============================================================
echo.
echo Bu skript backend ni Windows "Startup" papkasiga qo'yadi,
echo shunda har bir kompyuterning o'chirilishida o'zi ishga tushadi.
echo.
echo Hamma narsa o'z-o'zidan ishlaydi:
echo   1) Flask o'rnatiladi (yo'q bo'lsa)
echo   2) Startup ga qisqa echim (shortcut) qo'yiladi
echo   3) Backend Windows da har doim ishlaydi
echo.
pause

REM ---------- 1. Python tekshiruvi ----------
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo [XAT0] Python topilmadi. https://python.org dan o'rnatib, bu skriptni qayta ishga tushiring.
  pause
  exit /b 1
)

REM ---------- 2. Flask o'rnatish ----------
python -c "import flask" >nul 2>nul
if errorlevel 1 (
  echo.
  echo [1/3] Flask o'rnatilmoqda...
  python -m pip install --disable-pip-version-check -r requirements.txt
  if errorlevel 1 (
    echo [XAT0] Flask o'rnatilmadi. Internetni tekshiring.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Flask allaqachon o'rnatilgan.
)

REM ---------- 3. Admin token tekshiruvi ----------
if "%ZA_ADMIN_TOKEN%"=="" (
  echo.
  echo [XAT0] ZA_ADMIN_TOKEN belgilanmagan!
  echo.
  echo   Internetga chiqarishdan oldin albatta token o'rnating.
  echo   Masalan quyidagini "Ilg'or sozlamalar - Environment Variables" ga qo'ying:
  echo.
  echo     ZA_ADMIN_TOKEN = ^(random 32 yoki ko'proq belgi^)
  echo     ZA_PORT        = 8000
  echo     ZA_DB          = C:\...\backend\za_islamic.db
  echo.
  echo Token yaratish uchun PowerShell da:
  echo     -join ((48..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
  echo.
  pause
  exit /b 1
)

REM ---------- 4. Startup ga shortcut qo'yish ----------
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP%\ZA_ISLAMIC_Backend.lnk"
set "TARGET=%~dp0start_server.vbs"

if not exist "%STARTUP%" mkdir "%STARTUP%"

echo.
echo [2/3] Startup ga qisqa echim qo'yilmoqda...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%'); " ^
  "$s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; " ^
  "$s.WindowStyle = 7; $s.Description = 'ZA_ISLAMIC backend'; $s.Save()"

if not exist "%SHORTCUT%" (
  echo [XAT0] Qisqa echim yaratilmadi. Qo'lda yarating: %SHORTCUT%
  pause
  exit /b 1
)

echo [3/3] Hozir backend ni ishga tushiryapmiz...
start "" "%TARGET%"

echo.
echo ============================================================
echo   Tayyor!
echo.
echo   Server : http://127.0.0.1:%ZA_PORT%
echo   Startup: %SHORTCUT%
echo.
echo   Endi kompyuterni qayta ishga tushsangiz, backend o'zi
echo   avtomatik ishga tushadi.
echo.
echo   To'xtatish: python protsessini yoping yoki "start_server.vbs"
echo   faylidagi oynani bosing.
echo ============================================================
echo.
timeout /t 8
exit /b 0