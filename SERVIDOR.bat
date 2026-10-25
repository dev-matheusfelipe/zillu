@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale o Node.js LTS de https://nodejs.org
 pause
 exit /b 1
)
echo Mantenha esta janela aberta enquanto houver uma transmissao.
node server.cjs
pause
