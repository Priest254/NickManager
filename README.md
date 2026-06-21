# PostGIS Manager

A local, single-user web application designed to manage PostgreSQL and PostGIS databases. Built with a premium, glassmorphism-inspired dark mode UI, and powered by FastAPI, Vanilla JS, and Leaflet.

## Features

- **Connection Management:** Create, test, and save multiple PostgreSQL database connection profiles. Stored locally via SQLite.
- **Database Browser:** Seamlessly explore databases, schemas, and tables with an interactive tree menu.
- **Data Grid & CRUD:** Browse rows with pagination, sort, and edit cells inline directly from your browser.
- **Column Management:** Manage table schemas by easily renaming or safely deleting columns.
- **Shapefile Import:** Upload zipped shapefiles (`.shp` inside `.zip`) and seamlessly import them into PostGIS leveraging `geopandas` and `fiona`.
- **Spatial Dashboard:** Visually inspect PostGIS geometry columns mapped out onto an interactive Leaflet.js dashboard using GeoJSON representations.
- **Backup & Restore:** Generate and download complete `.dump` backups of your databases, or upload a `.dump` file to restore it. 

## Tech Stack
- **Backend**: Python 3.12, FastAPI, SQLAlchemy, GeoAlchemy2, Geopandas, Psycopg3.
- **Frontend**: Vanilla HTML/JS/CSS, Leaflet.js.

## Installation

This application was developed for Python 3.12. It assumes you have a Linux-based environment (e.g. WSL) or are running natively on a Unix-like system.

```bash
# Set up a virtual environment (optional but recommended)
python -m venv nm
source nm/bin/activate

# Install requirements
pip install -r requirements.txt
```

> **Note:** The Backup and Restore functionalities depend on the `pg_dump` and `pg_restore` system binaries being present in your `PATH`.

## How to Run

### Using the Startup Scripts
For convenience, startup scripts are included in the root directory. They will automatically start the server and attempt to open your default web browser to the application (`http://localhost:8000`).

- **Windows / WSL:** Double-click `start_app.bat` to launch the server inside your WSL environment.
- **Linux / macOS:** Run `./start_app.sh`

### Manual Startup
You can always manually start the uvicorn development server:
```bash
uvicorn backend.main:app --reload
```
Then navigate to `http://localhost:8000` in your web browser.
