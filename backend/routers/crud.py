from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import psycopg
from psycopg.rows import dict_row
from psycopg import sql
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from backend.database import get_db
from backend.routers.browser import get_active_connection, get_pg_connection

router = APIRouter(prefix="/api/crud", tags=["crud"])

class UpdateCellRequest(BaseModel):
    primary_key_column: str
    primary_key_value: Any
    column_name: str
    new_value: Any

class RawQueryRequest(BaseModel):
    query: str

@router.get("/schemas/{schema}/tables/{table}/rows")
def get_table_rows(
    schema: str, 
    table: str, 
    limit: int = Query(50, ge=1, le=1000), 
    offset: int = Query(0, ge=0),
    sort_by: Optional[str] = None,
    sort_desc: bool = False,
    db: Session = Depends(get_db)
):
    profile = get_active_connection(db)
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            # Safely format table name
            query = sql.SQL("SELECT * FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(table))
            
            if sort_by:
                order = sql.SQL("DESC") if sort_desc else sql.SQL("ASC")
                query += sql.SQL(" ORDER BY {} {}").format(sql.Identifier(sort_by), order)
                
            query += sql.SQL(" LIMIT %s OFFSET %s")
            
            try:
                cur.execute(query, (limit, offset))
                rows = cur.fetchall()
                
                # Convert memoryviews/bytes (e.g. geometries) to hex or string for JSON serialization
                for row in rows:
                    for k, v in row.items():
                        if isinstance(v, memoryview) or isinstance(v, bytes):
                            row[k] = v.hex()

                return {"rows": rows}
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))

@router.post("/schemas/{schema}/tables/{table}/cell")
def update_cell(
    schema: str,
    table: str,
    req: UpdateCellRequest,
    db: Session = Depends(get_db)
):
    profile = get_active_connection(db)
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            query = sql.SQL("UPDATE {}.{} SET {} = %s WHERE {} = %s").format(
                sql.Identifier(schema),
                sql.Identifier(table),
                sql.Identifier(req.column_name),
                sql.Identifier(req.primary_key_column)
            )
            try:
                cur.execute(query, (req.new_value, req.primary_key_value))
                conn.commit()
                return {"success": True}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))

@router.post("/schemas/{schema}/tables/{table}/columns/rename")
def rename_column(
    schema: str,
    table: str,
    old_column: str = Query(...),
    new_column: str = Query(...),
    db: Session = Depends(get_db)
):
    profile = get_active_connection(db)
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            query = sql.SQL("ALTER TABLE {}.{} RENAME COLUMN {} TO {}").format(
                sql.Identifier(schema),
                sql.Identifier(table),
                sql.Identifier(old_column),
                sql.Identifier(new_column)
            )
            try:
                cur.execute(query)
                conn.commit()
                return {"success": True, "message": f"Column {old_column} renamed to {new_column}"}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))

@router.delete("/schemas/{schema}/tables/{table}/columns/{column}")
def drop_column(
    schema: str,
    table: str,
    column: str,
    db: Session = Depends(get_db)
):
    profile = get_active_connection(db)
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            query = sql.SQL("ALTER TABLE {}.{} DROP COLUMN {}").format(
                sql.Identifier(schema),
                sql.Identifier(table),
                sql.Identifier(column)
            )
            try:
                cur.execute(query)
                conn.commit()
                return {"success": True, "message": f"Column {column} deleted"}
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))

@router.post("/query")
def execute_raw_query(req: RawQueryRequest, db: Session = Depends(get_db)):
    profile = get_active_connection(db)
    with get_pg_connection(profile) as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(req.query)
                
                # If it's a SELECT or RETURNING query, fetch results
                if cur.description:
                    rows = cur.fetchall()
                    for row in rows:
                        for k, v in row.items():
                            if isinstance(v, memoryview) or isinstance(v, bytes):
                                row[k] = v.hex()
                    conn.commit()
                    return {"success": True, "rows": rows, "columns": [col.name for col in cur.description]}
                else:
                    conn.commit()
                    return {"success": True, "message": f"Query executed successfully. {cur.rowcount} rows affected."}
            except Exception as e:
                conn.rollback()
                return {"success": False, "error": str(e)}
