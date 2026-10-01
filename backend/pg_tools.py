import os
import shutil
import sys
from pathlib import Path

from fastapi import HTTPException

from backend.app_paths import resource_dir


def resolve_pg_tool(name: str) -> str:
    executable = f"{name}.exe" if sys.platform == "win32" else name
    candidates = []

    configured = os.environ.get("NICKMANAGER_PG_TOOLS_DIR")
    if configured:
        candidates.append(Path(configured) / executable)

    candidates.extend(
        [
            resource_dir() / "resources" / "postgresql" / "bin" / executable,
            Path(__file__).resolve().parents[1] / "packaging" / "postgresql" / "bin" / executable,
        ]
    )
    candidates.extend(
        [
            Path(program_files) / "PostgreSQL" / version / "bin" / executable
            for program_files in (
                os.environ.get("ProgramW6432"),
                os.environ.get("ProgramFiles"),
            )
            if program_files
            for version in reversed(
                sorted(
                    (path.name for path in (Path(program_files) / "PostgreSQL").glob("*")),
                    key=lambda value: tuple(int(part) if part.isdigit() else -1 for part in value.split(".")),
                )
            )
        ]
    )

    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)

    found = shutil.which(name)
    if found:
        return found

    raise HTTPException(
        status_code=503,
        detail=(
            f"{name} is unavailable. Install the PostgreSQL command-line client tools, "
            "or place pg_dump and pg_restore in the bundled PostgreSQL tools directory."
        ),
    )
