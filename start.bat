@echo off
REM MindCraft Web launcher - installs dependencies if needed and starts the dashboard.
cd /d "%~dp0mindcraft"
if not exist node_modules (
    echo Installing dependencies ^(first run^)...
    call npm install
)
echo Starting MindCraft Web dashboard on http://localhost:8080 ...
node main.js
pause
