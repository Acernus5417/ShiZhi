@echo off
cd /d "%~dp0.."
if not exist "node_modules\electron\dist\electron.exe" (
  echo [shizhi] Electron not found. Please run: npm install
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "%~dp0."
