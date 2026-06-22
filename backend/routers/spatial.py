from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import psycopg
from psycopg.rows import dict_row
from psycopg import sql

from backend.database import get_db
from backend.routers.browser import get_active_connection, get_pg_connection

router = APIRouter(prefix="/api/spatial", tags=["spatial"])

@router.get("/geojson/{schema}/{table}")
def get_geojson(schema: str, table: str, limit: int = 1000, db: Session = Depends(get_db)):
    profile = get_active_connection(db)
    
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            # First find the geometry column
            try:
                cur.execute("""
                    SELECT f_geometry_column, srid
                    FROM geometry_columns
                    WHERE f_table_schema = %s AND f_table_name = %s;
                """, (schema, table))
                geom_info = cur.fetchone()
                
                if not geom_info:
                    raise HTTPException(status_code=400, detail="Table does not have a geometry column registered in geometry_columns.")
                    
                geom_col = geom_info['f_geometry_column']
                srid = geom_info['srid']
                
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
                
            # Build query to get GeoJSON
            # We transform to 4326 for Leaflet compatibility
            # Exclude the geometry column from properties to avoid raw WKB in the response
            query = sql.SQL("""
                SELECT row_to_json(fc) AS geojson
                FROM (
                    SELECT 'FeatureCollection' AS type, array_to_json(array_agg(f)) AS features
                    FROM (
                        SELECT 'Feature' AS type,
                               ST_AsGeoJSON(ST_Transform({geom}, 4326))::json AS geometry,
                               row_to_json((
                                   SELECT l FROM (
                                       SELECT t.* 
                                   ) AS l
                               ) - ARRAY[{geom_name}]) AS properties
                        FROM {schema}.{table} AS t
                        LIMIT %s
                    ) AS f
                ) AS fc;
            """).format(
                geom=sql.Identifier(geom_col),
                geom_name=sql.Literal(geom_col),
                schema=sql.Identifier(schema),
                table=sql.Identifier(table)
            )
            
            try:
                cur.execute(query, (limit,))
                result = cur.fetchone()
                if result and result['geojson'] and result['geojson']['features']:
                    return result['geojson']
                else:
                    return {"type": "FeatureCollection", "features": []}
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
