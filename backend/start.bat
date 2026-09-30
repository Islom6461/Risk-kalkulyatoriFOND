@echo off
chcp 65001 >nul
title ZA_ISLAMIC Backend
cd /d "%~dp0"

echo ============================================================
echo   ZA_ISLAMIC backend
echo ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [XAT0] Python topilmadi. https://python.org dan o'rnating.
  pause
  exit /b 1
)

python -c "import flask" >nul 2>nul
if errorlevel 1 (
  echo Flask o'rnatilmoqda...
  python -m pip install -r requirements.txt
)

echo.
echo Baza yaratilmoqda va server ishga tushmoqda...
echo Server:      http://127.0.0.1:8000
echo Admin token: za_islamic_admin
echo.
echo To'xtatish uchun bu oynani yoping.
echo ============================================================
echo.

python app.py
pause