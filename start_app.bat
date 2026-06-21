@echo off
echo Starting PostGIS Manager...
echo Please wait while the server initializes...

:: Start the FastAPI server in a new window using WSL and the python virtual environment
start "PostGIS Manager Server" wsl --cd /home/priest/Dev/NickManager bash -c "nm/bin/uvicorn backend.main:app"

:: Wait 3 seconds for the server to start up
timeout /t 3 /nobreak > nul

:: Open the default web browser to the application
start http://localhost:8000
