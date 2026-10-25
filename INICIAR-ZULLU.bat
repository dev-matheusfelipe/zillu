@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale o Node.js LTS de https://nodejs.org e abra este arquivo novamente.
 pause
 exit /b 1
)
if not exist node_modules\electron\dist\electron.exe (
 echo Preparando o Zillu. A primeira abertura requer internet e pode demorar.
 call npm ci
 if errorlevel 1 (
  echo Nao foi possivel instalar as dependencias. Confira a conexao.
  pause
  exit /b 1
 )
)
call npm start
if errorlevel 1 pause
