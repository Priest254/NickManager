import os
import re
import shutil
import zipfile
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

from backend.database import get_db
from backend.credentials import get_profile_password
from backend.routers.browser import get_active_connection

router = APIRouter(prefix="/api/shapefile", tags=["shapefile"])

_SHAPEFILE_COMPONENT_EXTENSIONS = {
    ".shp", ".shx", ".dbf", ".prj", ".cpg", ".qix", ".sbn", ".sbx",
    ".fbn", ".fbx", ".ain", ".aih", ".atx", ".ixs", ".mxs",
}


def _import_geopandas():
    """Import geopandas lazily.

    geopandas pulls in fiona/pyogrio, which load native GDAL/PROJ libraries.
    Importing it at module load time means a packaging issue with those
    native dependencies would crash the *entire application* on startup,
    before the server even binds a port. Deferring the import to request
    time means a problem here only disables shapefile import, instead of
    taking down the whole app.
    """
    try:
        import geopandas as gpd
        return gpd
    except Exception as exc:  # pragma: no cover - exercised only when native deps are broken
        raise HTTPException(
            status_code=503,
            detail=(
                "Shapefile import is unavailable because the geospatial libraries "
                f"(geopandas/GDAL) failed to load: {exc}"
            ),
        ) from exc


def _stage_shapefile_uploads(files: list[UploadFile], tmpdir: str) -> str:
    if not files:
        raise HTTPException(status_code=400, detail="Select a shapefile or ZIP file")

    upload_names = [
        os.path.basename((uploaded_file.filename or "").replace("\\", "/"))
        for uploaded_file in files
    ]
    if any(not name for name in upload_names):
        raise HTTPException(status_code=400, detail="An uploaded file has no filename")

    zip_files = [
        (uploaded_file, name)
        for uploaded_file, name in zip(files, upload_names)
        if os.path.splitext(name)[1].lower() == ".zip"
    ]
    if zip_files:
        if len(files) != 1:
            raise HTTPException(status_code=400, detail="Upload a ZIP file by itself")
        zip_path = os.path.join(tmpdir, "upload.zip")
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(zip_files[0][0].file, buffer)

        try:
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(tmpdir)
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="Invalid zip file") from exc
    else:
        shp_files = [
            (uploaded_file, name)
            for uploaded_file, name in zip(files, upload_names)
            if os.path.splitext(name)[1].lower() == ".shp"
        ]
        if len(shp_files) != 1:
            raise HTTPException(
                status_code=400,
                detail="Upload one .shp file with its shapefile components, or a ZIP file",
            )

        shp_stem = os.path.splitext(shp_files[0][1])[0]
        staged_names = set()
        for uploaded_file, name in zip(files, upload_names):
            stem, extension = os.path.splitext(name)
            extension = extension.lower()
            if (
                extension not in _SHAPEFILE_COMPONENT_EXTENSIONS
                or stem.casefold() != shp_stem.casefold()
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Select only files belonging to the same shapefile",
                )

            staged_name = shp_stem + extension
            if staged_name.casefold() in staged_names:
                raise HTTPException(
                    status_code=400,
                    detail=f"Duplicate shapefile component: {staged_name}",
                )
            staged_names.add(staged_name.casefold())
            with open(os.path.join(tmpdir, staged_name), "wb") as buffer:
                shutil.copyfileobj(uploaded_file.file, buffer)

    for root, _dirs, names in os.walk(tmpdir):
        for name in names:
            if os.path.splitext(name)[1].lower() == ".shp":
                return os.path.join(root, name)

    raise HTTPException(status_code=400, detail="No .shp file found in the upload")


@router.post("/upload")
async def upload_shapefile(
    files: list[UploadFile] = File(..., alias="file"),
    target_schema: str = Form(..., alias="schema"),
    table: str = Form(...),
    if_exists: str = Form("fail"),  # fail, replace, append
    db: Session = Depends(get_db)
):
    gpd = _import_geopandas()

    profile = get_active_connection(db)

    # Build engine. We attach a connect event to set search_path on every new connection
    # so PostGIS types (which live in 'public' by default) are always resolvable even when
    # writing into a different target schema.
    conn_string = URL.create(
        "postgresql+psycopg",
        username=profile.user,
        password=get_profile_password(profile),
        host=profile.host,
        port=profile.port,
        database=profile.db_name,
    )
    pg_engine = create_engine(conn_string)

    from sqlalchemy import event as sa_event

    @sa_event.listens_for(pg_engine, "connect")
    def _set_search_path(dbapi_conn, _record):
        with dbapi_conn.cursor() as cur:
            cur.execute('SET search_path TO boundaries, cadastre, teazones, public, urbannodes')
        dbapi_conn.commit()

    # Stage the upload so GDAL can read the shapefile and its sidecar files.
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            shp_file = _stage_shapefile_uploads(files, tmpdir)

            # Read shapefile using geopandas
            # Rebuild a missing .shx index instead of failing; attributes still need the .dbf.
            import pyogrio
            pyogrio.set_gdal_config_options({"SHAPE_RESTORE_SHX": "YES"})
            gdf = gpd.read_file(shp_file)
            
            # Ensure it has a geometry column
            if 'geometry' not in gdf.columns and gdf._geometry_column_name not in gdf.columns:
                raise HTTPException(status_code=400, detail="No geometry column found in shapefile")
                
            # Make column names lowercase to play nicely with postgres
            gdf.columns = [c.lower() for c in gdf.columns]

            # Ensure PostGIS extension exists — create it if the user has superuser/rds_superuser rights
            with pg_engine.connect() as conn:
                try:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
                    conn.commit()
                except Exception:
                    # May fail if user lacks CREATE privilege — check if type exists anyway
                    conn.rollback()
                    result = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = 'geometry'"))
                    if not result.fetchone():
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                "PostGIS extension is not installed in this database. "
                                "Run 'CREATE EXTENSION postgis;' as a superuser first, "
                                "or ask your DBA to enable it."
                            )
                        )

                # Ensure the target schema exists.
                # Schema name is validated as a safe identifier before embedding in SQL.
                if not re.match(r'^[A-Za-z_][A-Za-z0-9_$]*$', target_schema):
                    raise HTTPException(status_code=400, detail=f"Invalid schema name: '{target_schema}'")
                conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{target_schema}"'))
                conn.commit()
            
            # Appending to an existing table: match its registered geometry column and SRID,
            # otherwise geopandas' Find_SRID lookup fails.
            if if_exists == "append":
                with pg_engine.connect() as conn:
                    existing = conn.execute(
                        text(
                            "SELECT f_geometry_column, srid FROM geometry_columns "
                            "WHERE f_table_schema = :s AND f_table_name = :t"
                        ),
                        {"s": target_schema, "t": table},
                    ).fetchone()
                    table_exists = conn.execute(
                        text(
                            "SELECT 1 FROM information_schema.tables "
                            "WHERE table_schema = :s AND table_name = :t"
                        ),
                        {"s": target_schema, "t": table},
                    ).fetchone()
                if table_exists:
                    if not existing:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Table {target_schema}.{table} exists but has no registered "
                                "PostGIS geometry column, so rows cannot be appended."
                            ),
                        )
                    geom_col, srid = existing
                    if gdf.geometry.name != geom_col:
                        gdf = gdf.rename_geometry(geom_col)
                    if srid and srid > 0:
                        if gdf.crs is None:
                            gdf = gdf.set_crs(srid)
                        elif gdf.crs.to_epsg() != srid:
                            gdf = gdf.to_crs(srid)

            # Write to PostGIS
            gdf.to_postgis(
                name=table,
                con=pg_engine,
                schema=target_schema,
                if_exists=if_exists,
                index=False
            )
            
            return {
                "success": True, 
                "message": f"Successfully imported {len(gdf)} rows into {target_schema}.{table}"
            }
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
        finally:
            pg_engine.dispose()
