@echo off
setlocal

cd /d "%~dp0"

echo ============================================
echo   Atualizando e reiniciando o Jarvis
echo ============================================

echo.
echo [1/4] Baixando atualizacoes do GitHub...
git pull
if errorlevel 1 (
    echo ERRO: git pull falhou. Abortando.
    pause
    exit /b 1
)

echo.
echo [2/4] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo ERRO: npm install falhou. Abortando.
    pause
    exit /b 1
)

echo.
echo [3/4] Compilando o projeto...
call npm run build
if errorlevel 1 (
    echo ERRO: build falhou. Abortando.
    pause
    exit /b 1
)

echo.
echo [4/4] Reiniciando o Jarvis no PM2...
call pm2 restart Javys
if errorlevel 1 (
    echo Processo "Javys" nao encontrado no PM2, iniciando pela primeira vez...
    call pm2 start dist\index.js --name Javys
    call pm2 save
)

echo.
echo ============================================
echo   Pronto! Para ver os logs: pm2 logs Javys
echo ============================================
pause
