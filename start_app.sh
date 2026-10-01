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

"$PYTHON_BIN" run_app.py
