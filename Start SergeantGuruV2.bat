
@echo off
setlocal
title SergeantGuruV2

cd /d "D:\SergeantGuruV2"

echo ========================================
echo       SergeantGuruV2 Launcher
echo ========================================
echo.

echo Starting Ollama...

tasklist /FI "IMAGENAME eq ollama.exe" | find /I "ollama.exe" >nul
if errorlevel 1 (
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
) else (
    echo Ollama is already running.
)

echo Waiting for Ollama API...

:WAIT_OLLAMA
curl -s http://127.0.0.1:11434/api/tags >nul
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto WAIT_OLLAMA
)

echo Ollama is ready.
echo.

echo Loading qwen2.5:0.5b...

curl -s http://127.0.0.1:11434/api/generate -d "{\"model\":\"qwen2.5:0.5b\",\"prompt\":\"hello\",\"stream\":false}" >nul

echo.
echo Starting Discord bot...
echo.

call pnpm.cmd start

echo.
echo ========================================
echo Bot process exited.
echo Exit code: %ERRORLEVEL%
echo ========================================
echo.

pause