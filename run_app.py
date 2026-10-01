import argparse
import logging
import socket
import subprocess
import sys
import threading
import time
import traceback
import webbrowser

import uvicorn


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _log_file_path():
    # Imported lazily: on a broken packaged build even backend.app_paths
    # might fail to import, and we still want to report *something*.
    from backend.app_paths import data_dir

    logs_dir = data_dir() / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir / "app.log"


def _setup_logging() -> None:
    handlers = [logging.StreamHandler(sys.stderr)]
    try:
        handlers.append(logging.FileHandler(_log_file_path(), encoding="utf-8"))
    except Exception:
        # Logging to disk is best-effort; never let it block startup.
        pass
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers,
        force=True,
    )


def _report_fatal_error(exc: BaseException) -> None:
    """Make sure a startup crash is actually visible to the user.

    A console-mode .exe launched by double-clicking a shortcut gets its own
    console window; when the process exits, Windows closes that window
    immediately, so a bare traceback is invisible unless we pause and/or
    surface it another way.
    """
    message = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    try:
        logging.getLogger(__name__).error("PostGIS Manager failed to start:\n%s", message)
    except Exception:
        print(message, file=sys.stderr)

    print("\nPostGIS Manager failed to start. See the error above for details.", file=sys.stderr)

    if sys.platform == "win32":
        try:
            import ctypes

            short_message = (
                "PostGIS Manager failed to start.\n\n"
                f"{exc}\n\n"
                "Full details were written to the log file in the application data folder."
            )
            ctypes.windll.user32.MessageBoxW(None, short_message, "PostGIS Manager", 0x10)
        except Exception:
            pass

    if _is_frozen():
        try:
            input("Press Enter to close this window...")
        except Exception:
            pass


def open_browser_when_ready(server: uvicorn.Server, port: int) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline and not server.started and not server.should_exit:
        time.sleep(0.1)
    if server.started:
        webbrowser.open_new_tab(f"http://127.0.0.1:{port}/")


def _check(args: argparse.Namespace) -> None:
    from backend.app_paths import resource_dir
    from backend.main import app
    from backend.pg_tools import resolve_pg_tool

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


def _serve(args: argparse.Namespace) -> None:
    # Import eagerly (instead of passing "backend.main:app" as a string to
    # uvicorn.Config) so any import-time failure happens here, inside our
    # own try/except, rather than deep inside uvicorn's deferred import.
    from backend.main import app

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        listener.setblocking(False)
        port = listener.getsockname()[1]

        server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info")
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Run PostGIS Manager locally.")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window.")
    parser.add_argument("--check", action="store_true", help="Validate packaged app startup and exit.")
    args = parser.parse_args()

    _setup_logging()

    try:
        if args.check:
            _check(args)
        else:
            _serve(args)
    except Exception as exc:  # noqa: BLE001 - this is the top-level crash boundary
        _report_fatal_error(exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
