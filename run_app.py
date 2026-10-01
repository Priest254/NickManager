import argparse
import socket
import subprocess
import sys
import threading
import time
import webbrowser

import uvicorn

from backend.app_paths import resource_dir
from backend.pg_tools import resolve_pg_tool


def open_browser_when_ready(server: uvicorn.Server, port: int) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline and not server.started and not server.should_exit:
        time.sleep(0.1)
    if server.started:
        webbrowser.open_new_tab(f"http://127.0.0.1:{port}/")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run PostGIS Manager locally.")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window.")
    parser.add_argument("--check", action="store_true", help="Validate packaged app startup and exit.")
    args = parser.parse_args()

    if args.check:
        from backend.main import app

        frontend_dir = resource_dir() / "frontend"
        for asset in (
            frontend_dir / "templates" / "index.html",
            frontend_dir / "static" / "vendor" / "leaflet" / "leaflet.js",
        ):
            if not asset.is_file():
                raise RuntimeError(f"Packaged app asset is missing: {asset}")

        if sys.platform == "win32":
            for tool_name in ("pg_dump", "pg_restore"):
                tool_path = resolve_pg_tool(tool_name)
                result = subprocess.run([tool_path, "--version"], capture_output=True, text=True)
                if result.returncode:
                    raise RuntimeError(
                        f"Bundled {tool_name} failed its startup check: {result.stderr.strip()}"
                    )

        print(f"{app.title} startup check passed.")
        return

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        listener.setblocking(False)
        port = listener.getsockname()[1]

        server = uvicorn.Server(
            uvicorn.Config("backend.main:app", host="127.0.0.1", port=port, log_level="info")
        )
        if not args.no_browser:
            threading.Thread(
                target=open_browser_when_ready,
                args=(server, port),
                daemon=True,
            ).start()

        print(f"PostGIS Manager is running at http://127.0.0.1:{port}/")
        print("Close this window to stop the local app.")
        server.run(sockets=[listener])
    finally:
        listener.close()


if __name__ == "__main__":
    main()
