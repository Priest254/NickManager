import os
import shutil
import sys
from pathlib import Path


APP_NAME = "PostGISManager"


def resource_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parents[1]


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
