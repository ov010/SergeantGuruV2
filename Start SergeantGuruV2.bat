
@echo off
setlocal EnableDelayedExpansion
title SergeantGuruV2

cd /d "D:\SergeantGuruV2"

echo ========================================
echo       SergeantGuruV2 Launcher
echo ========================================
echo.

echo Checking Ollama (optional)...

set "OLLAMA_URL=http://127.0.0.1:11434"
set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
set /a OLLAMA_WAIT=0

curl -s --max-time 2 "%OLLAMA_URL%/api/tags" >nul 2>&1
if not errorlevel 1 goto OLLAMA_READY
if not exist "%OLLAMA_EXE%" goto OLLAMA_MISSING

echo Starting Ollama...
start "" "%OLLAMA_EXE%" serve

:WAIT_OLLAMA
curl -s --max-time 2 "%OLLAMA_URL%/api/tags" >nul 2>&1
if not errorlevel 1 goto OLLAMA_READY
set /a OLLAMA_WAIT+=2
if !OLLAMA_WAIT! GEQ 15 goto OLLAMA_UNAVAILABLE
timeout /t 2 /nobreak >nul
goto WAIT_OLLAMA

:OLLAMA_READY
echo Ollama is ready.
echo.
echo Loading the local grading model...

curl -s --max-time 60 "%OLLAMA_URL%/api/generate" -d "{\"model\":\"qwen2.5:0.5b\",\"prompt\":\"hello\",\"stream\":false}" >nul 2>&1
goto START_BOT

:OLLAMA_MISSING
echo Ollama is not installed.
echo Continuing without AI review. Grading uses the deterministic rubric,
echo and Alt Risk uses the rule-based score.
goto START_BOT

:OLLAMA_UNAVAILABLE
echo Ollama did not respond in time, so it will be skipped.
echo Continuing without AI review. Grading uses the deterministic rubric,
echo and Alt Risk uses the rule-based score.

:START_BOT
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