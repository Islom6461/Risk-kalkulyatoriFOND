@echo off
REM ============================================================
REM  ZA_ISLAMIC backend - to'xtatish
REM  Task Manager va "pythonw.exe" qidirish o'rniga shu skriptni
REM  ishga tushiring.
REM
REM  Muhim: cd /d ba'zi Windows versiyalarida kirill nomli
REM  papkalarda ishlamaydi. Shuning uchun qisqa (8.3) yo'l
REM  olinadi ? u har doim ASCII.
REM ============================================================
cd /d "%~dp0"

for %%D in ("%~dp0") do set "CURDIR=%%~fD"
for /f "delims=" %%i in ('powershell -NoProfile -Command "(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:CURDIR).ShortPath" 2^>nul') do set "SHORTDIR=%%i"
if defined SHORTDIR cd /d "%SHORTDIR%"

echo Server to'xtatilmoqda...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
  echo   port 8000 (PID %%p) yopilmoqda...
  taskkill /PID %%p /F >nul 2>&1
)

echo.
echo To'xtatildi. Qayta ishga tushirish uchun: start_backend.bat
timeout /t 4
