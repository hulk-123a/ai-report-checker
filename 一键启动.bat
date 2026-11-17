@echo off
setlocal
cd /d "%~dp0"
title AI Report Checker - One Click Launcher

echo.
echo ==================================================
echo   AI Report Checker  /  Chuanzhi Cup  /  Group B
echo   Harbin Guangsha College - Team Jiaqiang Faerjia
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js 18 or newer.
  echo         Download: https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/3] First run: installing dependencies, please wait...
  call npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your network and try again.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Dependencies: OK
)

if not exist ".env.local" (
  echo [2/3] Config: .env.local NOT found
  echo        AI checking will be unavailable until you copy .env.example
  echo        to .env.local and fill in your API key.
  echo        The OFFLINE DEMO mode still works.
) else (
  echo [2/3] Config: .env.local found
)

echo [3/3] Starting at http://localhost:5173 ...
echo        Keep this window open. Press Ctrl+C to stop.
echo        If the browser cannot connect, just refresh once.
echo.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:5173'"
call npm run dev

echo.
echo Server stopped.
pause
