@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
    set "PYTHON_CMD=py -3"
) else (
    where python >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_CMD=python"
    ) else (
        echo Python 3 was not found in PATH.
        echo Install Python 3.12 and try again.
        exit /b 1
    )
)

echo Starting PostGIS Manager...
echo Please wait while the server initializes...

:: Open the browser after the server starts
start "" http://localhost:8000

:: Start the FastAPI server in the current environment
%PYTHON_CMD% -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
