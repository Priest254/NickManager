from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import psycopg
from psycopg.rows import dict_row
from typing import List, Dict, Any

from backend.database import get_db
from backend.models import ConnectionProfile

router = APIRouter(prefix="/api/browser", tags=["browser"])

def get_active_connection(db: Session) -> ConnectionProfile:
    profile = db.query(ConnectionProfile).filter(ConnectionProfile.is_active == True).first()
    if not profile:
        raise HTTPException(status_code=400, detail="No active connection selected")
    return profile

def get_pg_connection(profile: ConnectionProfile):
    conn_string = f"postgresql://{profile.user}:{profile.password}@{profile.host}:{profile.port}/{profile.db_name}"
    try:
        return psycopg.connect(conn_string, row_factory=dict_row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to database: {str(e)}")

@router.get("/schemas")
def list_schemas(db: Session = Depends(get_db)):
    profile = get_active_connection(db)
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT schema_name 
                FROM information_schema.schemata 
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY schema_name;
            """)
            return {"schemas": [row['schema_name'] for row in cur.fetchall()]}

@router.get("/schemas/{schema}/tables")
def list_tables(schema: str, db: Session = Depends(get_db)):
    profile = get_active_connection(db)
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                ORDER BY table_name;
            """, (schema,))
            return {"tables": [row['table_name'] for row in cur.fetchall()]}

@router.get("/schemas/{schema}/tables/{table}/columns")
def get_table_structure(schema: str, table: str, db: Session = Depends(get_db)):
    profile = get_active_connection(db)
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            # Get standard columns
            cur.execute("""
                SELECT column_name, data_type, is_nullable, character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position;
            """, (schema, table))
            columns = cur.fetchall()
            
            # Check for geometry columns using geometry_columns view
            try:
                cur.execute("""
                    SELECT f_geometry_column, type, srid
                    FROM geometry_columns
                    WHERE f_table_schema = %s AND f_table_name = %s;
                """, (schema, table))
                geom_cols = {row['f_geometry_column']: row for row in cur.fetchall()}
                
                for col in columns:
                    if col['column_name'] in geom_cols:
                        g = geom_cols[col['column_name']]
                        col['is_geometry'] = True
                        col['geom_type'] = g['type']
                        col['srid'] = g['srid']
                    else:
                        col['is_geometry'] = False
            except Exception:
                # PostGIS might not be installed, ignore
                pass

            return {"columns": columns}
