@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title IdeaLab - Telegram demo
if not exist "package.json" (
    echo Распакуйте содержимое архива в папку IdeaLab рядом с package.json.
    pause
    exit /b 1
)
if not exist "scripts\telegram-demo.ts" (
    echo Не найден scripts\telegram-demo.ts. Распакуйте архив целиком.
    pause
    exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
    echo Установите Node.js 24 LTS и запустите этот файл снова.
    pause
    exit /b 1
)
if not exist "node_modules\tsx\package.json" (
    echo Сначала выполните npm ci и npm run db:generate в папке IdeaLab.
    pause
    exit /b 1
)
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "PATH=%ProgramFiles%\cloudflared;%PATH%"
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "PATH=%ProgramFiles(x86)%\cloudflared;%PATH%"
where cloudflared >nul 2>&1
if errorlevel 1 (
    where winget >nul 2>&1
    if errorlevel 1 (
        echo Не найден cloudflared. Установите Cloudflare Tunnel по инструкции:
        echo https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/
        pause
        exit /b 1
    )
    echo Устанавливаю официальный Cloudflare Tunnel через winget.
    winget install --id Cloudflare.cloudflared --exact --source winget
    if errorlevel 1 goto INSTALL_FAILED
    if not errorlevel 0 goto INSTALL_FAILED
    echo Cloudflare Tunnel установлен. Закройте это окно и запустите start-telegram.cmd снова.
    pause
    exit /b 0
)
echo Запускаю тест IdeaLab в Telegram. Токен вводится только в скрытый запрос этого окна.
node --use-env-proxy --import tsx scripts\telegram-demo.ts
set "IDEALAB_RESULT=%ERRORLEVEL%"
echo.
if not "%IDEALAB_RESULT%"=="0" echo Если запуск не удался, сохраните текст ошибки. Сам токен присылать не нужно.
pause
exit /b %IDEALAB_RESULT%

:INSTALL_FAILED
echo Установка не завершилась. Сохраните текст ошибки для разбора.
pause
exit /b 1
