@echo off
setlocal
REM MindCraft Web launcher - installs dependencies if needed and starts the dashboard (MindServer).
cd /d "%~dp0mindcraft"

if "%MINDSERVER_PORT%"=="" (set PORT=8080) else (set PORT=%MINDSERVER_PORT%)

where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js was not found.
    echo     Install Node.js 18-22 ^(LTS^) from https://nodejs.org and run this file again.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
    echo [X] Node.js is too old - MindCraft needs Node.js 18 or newer ^(18-22 LTS recommended^).
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies ^(first run - this can take a few minutes^)...
    call npm install
    if errorlevel 1 (
        echo [X] "npm install" failed. Use Node 18-22 LTS, or try: npm install --no-optional
        echo     More help: mindcraft\FAQ.md
        pause
        exit /b 1
    )
)

echo Starting MindCraft Web dashboard ^(MindServer^) on http://localhost:%PORT%
echo.
echo   Dashboard:  http://localhost:%PORT%          - open this in your browser
echo   Stop:       press Ctrl+C
echo.
echo If the dashboard says "MindServer not reachable", make sure you opened the URL above
echo ^(not a copy of index.html, and not the GitHub Pages link^).
echo.

set MINDSERVER_PORT=%PORT%
node main.js
pause
