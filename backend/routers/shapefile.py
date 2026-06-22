import os
import re
import shutil
import zipfile
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, text
import geopandas as gpd

from backend.database import get_db
from backend.routers.browser import get_active_connection

router = APIRouter(prefix="/api/shapefile", tags=["shapefile"])

@router.post("/upload")
async def upload_shapefile(
    file: UploadFile = File(...),
    target_schema: str = Form(..., alias="schema"),
    table: str = Form(...),
    if_exists: str = Form("fail"),  # fail, replace, append
    db: Session = Depends(get_db)
):
    profile = get_active_connection(db)
    
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only .zip shapefiles are supported")

    # Build engine. We attach a connect event to set search_path on every new connection
    # so PostGIS types (which live in 'public' by default) are always resolvable even when
    # writing into a different target schema.
    conn_string = (
        f"postgresql+psycopg://{profile.user}:{profile.password}"
        f"@{profile.host}:{profile.port}/{profile.db_name}"
    )
    pg_engine = create_engine(conn_string)

    from sqlalchemy import event as sa_event

    @sa_event.listens_for(pg_engine, "connect")
    def _set_search_path(dbapi_conn, _record):
        with dbapi_conn.cursor() as cur:
            cur.execute('SET search_path TO boundaries, cadastre, teazones, public, urbannodes')
        dbapi_conn.commit()

    # Use a temporary directory to extract the zip
    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = os.path.join(tmpdir, file.filename)
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(tmpdir)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid zip file")
            
        # Find the .shp file
        shp_file = None
        for root, dirs, files in os.walk(tmpdir):
            for f in files:
                if f.endswith('.shp'):
                    shp_file = os.path.join(root, f)
                    break
            if shp_file:
                break
                
        if not shp_file:
            raise HTTPException(status_code=400, detail="No .shp file found in the zip")
            
        try:
            # Read shapefile using geopandas
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
