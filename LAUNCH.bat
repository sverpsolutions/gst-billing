@echo off
title GST Billing Software
color 0A
cls

echo.
echo  =============================================
echo    GST BILLING SOFTWARE
echo  =============================================
echo.

cd /d "%~dp0"
echo  Running from: %CD%
echo.

:: ── Find Node.js ──────────────────────────────────────────
echo  [1/4] Looking for Node.js...

set NODE=
set NPM=

:: Try PATH first
where node >nul 2>&1
if not errorlevel 1 (
    set NODE=node
    set NPM=npm
    goto NODE_FOUND
)

:: Try common install locations
if exist "C:\Program Files\nodejs\node.exe" (
    set NODE="C:\Program Files\nodejs\node.exe"
    set NPM="C:\Program Files\nodejs\npm.cmd"
    goto NODE_FOUND
)
if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set NODE="C:\Program Files (x86)\nodejs\node.exe"
    set NPM="C:\Program Files (x86)\nodejs\npm.cmd"
    goto NODE_FOUND
)
if exist "%APPDATA%\nvm\current\node.exe" (
    set NODE="%APPDATA%\nvm\current\node.exe"
    set NPM="%APPDATA%\nvm\current\npm.cmd"
    goto NODE_FOUND
)

:: Not found
color 0C
echo.
echo  ERROR: Node.js not found!
echo.
echo  Please install Node.js:
echo  1. Open browser
echo  2. Go to: https://nodejs.org
echo  3. Click the big "LTS" download button
echo  4. Install it (keep all default settings)
echo  5. RESTART your computer
echo  6. Then run this file again
echo.
pause
exit /b

:NODE_FOUND
echo  Node.js found!
%NODE% --version
echo.

:: ── Find MySQL ────────────────────────────────────────────
echo  [2/4] Looking for MySQL...

set MYSQL=
where mysql >nul 2>&1
if not errorlevel 1 ( set MYSQL=mysql & goto MYSQL_FOUND )
if exist "C:\xampp\mysql\bin\mysql.exe"     ( set MYSQL="C:\xampp\mysql\bin\mysql.exe"     & goto MYSQL_FOUND )
if exist "C:\xampp2\mysql\bin\mysql.exe"    ( set MYSQL="C:\xampp2\mysql\bin\mysql.exe"    & goto MYSQL_FOUND )
if exist "C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe" ( set MYSQL="C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe" & goto MYSQL_FOUND )
if exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" ( set MYSQL="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" & goto MYSQL_FOUND )
if exist "C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe" ( set MYSQL="C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe" & goto MYSQL_FOUND )

echo  WARNING: MySQL not found in common locations.
echo  Make sure XAMPP MySQL is running!
goto SKIP_DB

:MYSQL_FOUND
echo  MySQL found: %MYSQL%
echo.

:: ── Setup Database ────────────────────────────────────────
echo  [3/4] Setting up database...
%MYSQL% -u root --password= -e "CREATE DATABASE IF NOT EXISTS gst_billing CHARACTER SET utf8mb4;" 2>nul
%MYSQL% -u root --password= gst_billing < "database\schema.sql" 2>nul
echo  Database ready!

:SKIP_DB
echo.

:: ── Create config ─────────────────────────────────────────
(
    echo NODE_ENV=production
    echo PORT=3000
    echo DB_HOST=localhost
    echo DB_PORT=3306
    echo DB_NAME=gst_billing
    echo DB_USER=root
    echo DB_PASS=
    echo JWT_SECRET=gst2024secret
) > .env

:: ── Install packages ──────────────────────────────────────
echo  [4/4] Checking packages...
if not exist "node_modules\express" (
    echo  Installing packages - wait 1-2 minutes...
    echo.
    %NPM% install
    if errorlevel 1 (
        color 0C
        echo.
        echo  ERROR: Package install failed!
        echo  Check your internet connection and try again.
        echo.
        pause
        exit /b
    )
)
echo  Packages OK!
echo.

:: ── START ─────────────────────────────────────────────────
echo  =============================================
echo   STARTING...  http://localhost:3000
echo  =============================================
echo.
echo  Keep this window open while using software.
echo  Close this window to stop the software.
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

%NODE% server.js

echo.
echo  Server stopped.
pause
