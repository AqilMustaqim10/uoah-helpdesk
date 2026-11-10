@echo off
setlocal
title Development Environment

set "ROOT=%~dp0"

if not exist "%ROOT%server\package.json" (
    echo ERROR: Server package.json not found.
    pause
    exit /b 1
)
if not exist "%ROOT%client\package.json" (
    echo ERROR: Client package.json not found.
    pause
    exit /b 1
)
if not exist "%ROOT%server\.env.prod" (
    echo ERROR: server\.env.prod not found. The launcher uses this file for the database configuration.
    pause
    exit /b 1
)

set "ADMINER_AVAILABLE=1"
set "WINGET_PHP=%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe"
if exist "%WINGET_PHP%\php.exe" (
    set "ADMINER_CMD=%WINGET_PHP%\php.exe -d extension_dir=%WINGET_PHP%\ext -d extension=pgsql -d extension=pdo_pgsql -S 127.0.0.1:8080 -t ."
) else (
    where php >nul 2>nul
    if errorlevel 1 (
        set "ADMINER_AVAILABLE=0"
        set "ADMINER_CMD=echo WARNING: PHP was not found on PATH. Adminer will not start."
    ) else (
        set "ADMINER_CMD=php -S 127.0.0.1:8080 -t ."
    )
)

where wt.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: Windows Terminal command wt.exe was not found.
    pause
    exit /b 1
)

set "DOTENV_CONFIG_PATH=.env.prod"
set "NODE_ENV=development"
set "PORT=3001"
set "CLIENT_ORIGIN=http://localhost:3000,http://172.17.50.66:3000"
set "APP_URL=http://172.17.50.66:3000"
set "REQUIRE_HTTPS=false"
set "SERVE_CLIENT=false"

echo Launching services in one Windows Terminal window...
echo Client: http://localhost:3000/
echo Server: http://localhost:3001/
if "%ADMINER_AVAILABLE%"=="1" (
    echo Adminer: http://127.0.0.1:8080/adminer.php
) else (
    echo Adminer unavailable; install PHP to use http://127.0.0.1:8080/adminer.php
)

wt.exe -w new new-tab -d "%ROOT%server" --title "Adminer (PHP)" cmd /k %ADMINER_CMD% ^; split-pane -H -d "%ROOT%server" --title "Helpdesk Server" cmd /k npm run dev ^; move-focus left ^; split-pane -V -d "%ROOT%server" --title "Email Ingestion Worker" cmd /k npm run worker ^; move-focus right ^; split-pane -V -d "%ROOT%client" --title "Helpdesk Client" cmd /k npm run dev -- --host
if errorlevel 1 (
    echo ERROR: Windows Terminal failed to launch the service panes.
    pause
    exit /b 1
)
exit /b