# PostGIS Manager

A single-user desktop-launched workspace for managing PostgreSQL and PostGIS databases. The app runs a local web interface and connects to databases that you already operate; it does not install or bundle a database server.

## Features

- Save connection profiles and connect to local or remote PostgreSQL databases.
- Explore schemas, search and sort table rows, and edit rows with a single-column primary key.
- Rename or delete columns, run SQL queries, and preview PostGIS geometries on a map.
- Import shapefiles from ZIP archives or their individual component files, and create or restore database backups.

## Windows installer

Download and run the **PostGISManager-Setup** installer from a tagged GitHub Actions build. The installer includes the app, Python runtime, Python/geospatial dependencies, Leaflet assets, and PostgreSQL 18.4 client tools. Users do not need to install Python, pip packages, or PostgreSQL locally just to run the app.

The installer is per-user and does not require administrator rights. It creates a Start Menu shortcut and optionally a desktop shortcut. Launching PostGIS Manager starts the local app and opens it in the default browser; close the accompanying console window to stop it.
The installer is not code-signed, so Windows SmartScreen may display a publisher warning until signed releases are available.

You still need a reachable PostgreSQL server. Spatial features require PostGIS to be enabled in the database. The map's OpenStreetMap background tiles require an internet connection; the application and its Leaflet UI assets are bundled locally.

Backups use the bundled `pg_dump` and `pg_restore` 18.4 client programs. These work with servers up to PostgreSQL 18; use client tools at least as new as the server you connect to. If you need a different client version, set `NICKMANAGER_PG_TOOLS_DIR` to a directory containing the desired `pg_dump` and `pg_restore` executables (and their required DLLs).

## Local data and credentials

Connection profiles are stored in `%LOCALAPPDATA%\PostGISManager\app.db`. Passwords are stored separately in the signed-in Windows user's credential store, not in the SQLite profile database. Uninstalling the app deliberately leaves these user data in place.

On first launch, an existing `data\app.db` alongside a source checkout or older app installation is copied into the user data directory. Existing connection passwords are migrated to the Windows credential store and cleared from the new database. The original database is kept as a backup; remove it yourself after confirming the migration if it contains old plaintext passwords.

## Build the Windows installer

The `Build Windows installer` GitHub Actions workflow builds the 64-bit installer when run manually or when a `v*` tag is pushed. It downloads PostgreSQL 18.4 client binaries from EnterpriseDB, includes applicable PostgreSQL license notices, builds the app with PyInstaller, and uploads the installer as an Actions artifact. A `v*` tag also creates a GitHub Release with the installer attached for end users to download.

To build locally on 64-bit Windows with Python 3.12:

```powershell
python -m pip install -r requirements.txt -r packaging/requirements-build.txt
pyinstaller --noconfirm --clean packaging/PostGISManager.spec
```

For an installer, also install Inno Setup 6 and set `APP_VERSION` before compiling:

```powershell
$env:APP_VERSION = "0.1.0"
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" packaging/windows-installer.iss
```

The installer is written to `dist\installer`. To bundle different PostgreSQL client executables in a local build, place `pg_dump.exe`, `pg_restore.exe`, their required DLLs, and the applicable PostgreSQL `LICENSE` in `packaging\postgresql\bin` and `packaging\postgresql\LICENSE`.

## Run from source

The installer is the recommended experience for end users. For development, install Python 3.12 and the dependencies:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run_app.py
```

The launcher chooses an available local port, binds only to `127.0.0.1`, and opens the browser when the app is ready. The app data directory can be overridden with `NICKMANAGER_DATA_DIR`. The `start_app.bat` and `start_app.sh` scripts also start this local development launcher.
