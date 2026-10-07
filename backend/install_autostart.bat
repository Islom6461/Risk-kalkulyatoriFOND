@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   ZA_ISLAMIC backend - Windows da avtomatik ishga tushirish
echo ============================================================
echo.
echo  1) Flask tekshiriladi / o'rnatiladi
echo  2) Xavfsiz admin token yaratiladi (za_config.json)
echo  3) Windows Startup ga qisqa echim qo'yiladi
echo  4) Server ishga tushiriladi va TEKSHIRILADI
echo.
pause

REM ================= 1. Python =================
echo.
echo [1/4] Python izlanmoqda...
set "PYEXE="
python -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>nul
if not errorlevel 1 set "PYEXE=python"
if not defined PYEXE (
  py -3 -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>nul
  if not errorlevel 1 set "PYEXE=py -3"
)
if not defined PYEXE goto NOPY
echo       Python: %PYEXE%   (%PYEXE% -V 2>&1)

REM pythonw.exe (konsol oynasisiz) topamiz.
REM Muhim: WindowsApps dagi "pythonw.exe" stub bo'lib, haqiqiy ishga
REM tushirmaydi. Shuning uchun faqat "python" qatori tekshiriladi.
set "PYTHONW="
for /f "delims=" %%i in ('where python 2^>nul') do (
  if not defined PYTHONW (
    %%i -c "import os,sys; sys.exit(0 if os.path.isfile(os.path.join(os.path.dirname(sys.executable),'pythonw.exe')) else 1)" >nul 2>nul
    if not errorlevel 1 for %%j in ("%%i") do set "PYTHONW=%%~dpipythonw.exe"
  )
)
if not defined PYTHONW (
  if exist "%SystemRoot%\pyw.exe" set "PYTHONW=%SystemRoot%\pyw.exe"
)
if not defined PYTHONW goto NOPYTHONW
echo       pythonw: %PYTHONW%

REM ================= 2. Flask =================
echo [2/4] Flask tekshirilmoqda...
%PYEXE% -c "import flask" >nul 2>nul
if errorlevel 1 (
  echo       O'rnatilmoqda...
  %PYEXE% -m pip install --disable-pip-version-check -q -r requirements.txt
  if errorlevel 1 goto NOFLASK
  echo       Flask o'rnatildi.
) else (
  echo       Flask allaqachon bor.
)

REM ================= 3. Token =================
echo [3/4] Admin token...
if exist "za_config.json" (
  echo       za_config.json mavjud - o'zgartirilmaydi.
) else (
  %PYEXE% -c "import json,secrets; json.dump({'ADMIN_TOKEN':secrets.token_urlsafe(40),'PORT':'8000'}, open('za_config.json','w',encoding='utf-8'), indent=2)"
  if errorlevel 1 goto NOCFG
  echo       Yangi token yaratildi.
)
echo %PYEXE%> "python_path.txt"

REM ================= 4. Startup qisqa echimi =================
echo [4/4] Windows Startup ga qo'yilmoqda...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP%\ZA_ISLAMIC_Backend.lnk"
if not exist "%STARTUP%" mkdir "%STARTUP%"
set "WORKDIR=%~dp0"
set "PYTHONW=%PYTHONW%"

REM Qisqa echim to'g'ridan-to'g'ri pythonw.exe ni ishga tushiradi:
REM konsol oynasi chiqmaydi, kirillcha yo'l esa .lnk da saqlanadi.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sh=New-Object -ComObject WScript.Shell;" ^
  "$s=$sh.CreateShortcut($env:SHORTCUT);" ^
  "$s.TargetPath=$env:PYTHONW;" ^
  "$s.Arguments='\"' + $env:WORKDIR + 'app.py\"';" ^
  "$s.WorkingDirectory=$env:WORKDIR;" ^
  "$s.WindowStyle=7;" ^
  "$s.Description='ZA_ISLAMIC backend';" ^
  "$s.Save()" >nul 2>nul

if not exist "%SHORTCUT%" goto NOSHORT
echo       %SHORTCUT%

REM ================= 5. Ishga tushirish + tekshirish =================
echo.
echo Server ishga tushirilmoqda...
REM cd /d ba'zi Windows versiyalarida kirill nomli papkalarda ishlamaydi.
REM Qisqa (8.3) yo'l har doim ASCII ? shuning uchun avval undan o'tamiz.
cd /d "%~dp0"
for %%D in ("%~dp0") do set "CURDIR=%%~fD"
for /f "delims=" %%i in ('powershell -NoProfile -Command "(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:CURDIR).ShortPath" 2^>nul') do set "SHORTDIR=%%i"
if defined SHORTDIR cd /d "%SHORTDIR%"
echo       Ish papkasi: %CD%
start "" "%PYTHONW%" app.py

set "READY=no"
for /l %%i in (1,1,40) do (
  %PYEXE% -c "import urllib.request,json,sys; d=json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=2)); sys.exit(0 if d.get('adminOk') else 1)" >nul 2>nul
  if not errorlevel 1 (
    set "READY=yes"
    goto DONE
  )
  ping -n 2 127.0.0.1 >nul
)
:DONE
if "%READY%"=="yes" goto OK
goto FAIL

:NOPY
echo.
echo [XATO] Python 3.9+ topilmadi.
echo   https://python.org dan o'rnatib, skriptni qayta ishga tushiring.
pause
exit /b 1

:NOPYTHONW
echo.
echo [XATO] pythonw.exe topilmadi (konsol oynasisiz rejim).
echo   O'rniga start_backend.bat ni qo'lda ishga tushiring.
pause
exit /b 1

:NOFLASK
echo.
echo [XATO] Flask o'rnatilmadi. Internetni tekshiring.
pause
exit /b 1

:NOCFG
echo.
echo [XATO] za_config.json yaratilmadi.
pause
exit /b 1

:NOSHORT
echo.
echo [XATO] Qisqa echim yaratilmadi: %SHORTCUT%
pause
exit /b 1

:FAIL
echo.
echo [XATO] Server 40 sekundada javob bermadi.
echo   Log: %~dp0backend.log
echo.
echo   Qo'lda sinab ko'ring:  start_backend.bat
pause
exit /b 1

:OK
echo.
echo ============================================================
echo   TAYYOR - hammasi ishlayapti
echo.
echo   Server    : http://127.0.0.1:8000
echo   Dastur    : https://islom6461.github.io/Risk-kalkulyatoriFOND/
echo   Sozlama   : %~dp0za_config.json
echo   Log       : %~dp0backend.log
echo.
echo   Endi RiskKalkulyatori_FOND ni oching:
echo   yuqorida "Server: ulangan" chiqishi kerak va
echo   chap menyuda Admin tugmasi paydo bo'ladi.
echo.
echo   To'xtatish: Task Manager -> pythonw.exe
echo ============================================================
echo.
timeout /t 12
exit /b 0
