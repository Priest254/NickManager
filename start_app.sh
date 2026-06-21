#!/bin/bash
echo "Starting PostGIS Manager..."
echo "Please wait while the server initializes..."

# Start the FastAPI server using the python virtual environment
nm/bin/uvicorn backend.main:app &
SERVER_PID=$!

# Wait a few seconds for the server to start up
sleep 3

# Attempt to open the default web browser (macOS / Linux / WSL)
if command -v xdg-open > /dev/null; then
  xdg-open http://localhost:8000
elif command -v open > /dev/null; then
  open http://localhost:8000
else
  echo "Server is running at http://localhost:8000"
fi

# Wait for the server process to keep the script running
wait $SERVER_PID
