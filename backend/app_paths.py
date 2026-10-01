import os
import shutil
import sys
from pathlib import Path


APP_NAME = "PostGISManager"


def resource_dir() -> Path:
    if not getattr(sys, "frozen", False):
        return Path(__file__).resolve().parents[1]

    exe_dir = Path(sys.executable).resolve().parent
    meipass = getattr(sys, "_MEIPASS", None)

    # PyInstaller's one-folder layout has varied across versions: the bundled
    # "frontend" data directory may live directly in _MEIPASS, in a
    # "_internal" subfolder next to the executable, or alongside the
    # executable itself. Probe the known candidates and pick whichever one
    # actually contains our bundled frontend, instead of trusting a single
    # assumption that could silently point at a non-existent path and crash
    # the app at startup (e.g. when mounting static files).
    candidates = []
    if meipass:
        candidates.append(Path(meipass))
    candidates.append(exe_dir / "_internal")
    candidates.append(exe_dir)

    for candidate in candidates:
        if (candidate / "frontend").is_dir():
            return candidate

    # Nothing matched; fall back to the most likely candidate so callers get
    # a clear "path does not exist" error instead of an obscure crash.
    return candidates[0] if candidates else exe_dir


def data_dir() -> Path:
    configured = os.environ.get("NICKMANAGER_DATA_DIR")
    if configured:
        directory = Path(configured).expanduser()
    elif sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA")
        if not base:
            raise RuntimeError("LOCALAPPDATA is not set; configure NICKMANAGER_DATA_DIR.")
        directory = Path(base) / APP_NAME
    elif sys.platform == "darwin":
        directory = Path.home() / "Library" / "Application Support" / APP_NAME
    else:
        base = os.environ.get("XDG_DATA_HOME")
        directory = (Path(base).expanduser() if base else Path.home() / ".local" / "share") / APP_NAME

    directory.mkdir(parents=True, exist_ok=True)
    migrate_legacy_database(directory / "app.db")
    return directory


def migrate_legacy_database(destination: Path) -> None:
    if destination.exists():
        return

    candidates = [
        resource_dir() / "data" / "app.db",
    ]
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "data" / "app.db")

    for source in candidates:
        try:
            if source.resolve() == destination.resolve() or not source.is_file():
                continue
        except OSError:
            continue
        shutil.copy2(source, destination)
        break
