@echo off
REM ============================================================
REM  ZA_ISLAMIC backend - qo'lda ishga tushirish / to'xtatish
REM
REM  Ikki nusxa himoyasi app.py ichida: agar server allaqachon
REM  ishlamayotgan bo'lsa, u jim chiqib ketadi.
REM
REM  cd /d ba'zi Windows versiyalarida kirill nomli papkalarda
REM  ishlamaydi ? shuning uchun qisqa (8.3) yo'l olinadi.
REM ============================================================
cd /d "%~dp0"

for %%D in ("%~dp0") do set "CURDIR=%%~fD"
for /f "delims=" %%i in ('powershell -NoProfile -Command "(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:CURDIR).ShortPath" 2^>nul') do set "SHORTDIR=%%i"
if defined SHORTDIR cd /d "%SHORTDIR%"
echo Ish papkasi: %CD%

python app.py >> backend.log 2>&1

if errorlevel 1 (
  echo.
  echo [XATO] Server ishga tushmadi. Sabab:
  type backend.log
)