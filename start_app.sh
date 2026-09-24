#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Starting PostGIS Manager..."
echo "Please wait while the server initializes..."

if [ -x "nm/bin/python" ]; then
  PYTHON_BIN="nm/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python 3 was not found. Install Python 3.12 and try again."
  exit 1
fi

"$PYTHON_BIN" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
SERVER_PID=$!

sleep 3

if command -v xdg-open > /dev/null; then
  xdg-open http://localhost:8000
elif command -v open > /dev/null; then
  open http://localhost:8000
else
  echo "Server is running at http://localhost:8000"
fi

wait "$SERVER_PID"
