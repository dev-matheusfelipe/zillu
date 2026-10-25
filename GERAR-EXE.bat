@echo off
setlocal
cd /d "%~dp0"
call npm ci
if errorlevel 1 (
 pause
 exit /b 1
)
call npm run dist:win
if errorlevel 1 (
 pause
 exit /b 1
)
echo O executavel esta na pasta dist.
pause
