from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules


ROOT = Path(SPECPATH).resolve().parent
datas = [(str(ROOT / "frontend"), "frontend")]
binaries = []
hiddenimports = []

for package in (
    "geopandas",
    "fiona",
    "pyogrio",
    "pyproj",
    "shapely",
    "keyring",
    "psycopg",
    "psycopg_binary",
    "uvicorn",
):
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    datas.extend(package_datas)
    binaries.extend(package_binaries)
    hiddenimports.extend(package_hiddenimports)

hiddenimports.extend(collect_submodules("keyring.backends"))

pg_tools_dir = ROOT / "packaging" / "postgresql" / "bin"
if pg_tools_dir.is_dir():
    required_tools = ("pg_dump.exe", "pg_restore.exe")
    missing_tools = [tool for tool in required_tools if not (pg_tools_dir / tool).is_file()]
    if missing_tools:
        raise SystemExit(
            "The PostgreSQL tools bundle is incomplete. Missing: " + ", ".join(missing_tools)
        )
    datas.append((str(pg_tools_dir), "resources/postgresql/bin"))
    license_file = ROOT / "packaging" / "postgresql" / "LICENSE"
    if license_file.is_file():
        datas.append((str(license_file), "resources/postgresql"))
    license_dir = ROOT / "packaging" / "postgresql" / "licenses"
    if license_dir.is_dir():
        datas.append((str(license_dir), "resources/postgresql/licenses"))

analysis = Analysis(
    [str(ROOT / "run_app.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="PostGISManager",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)
collection = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=True,
    name="PostGISManager",
)
