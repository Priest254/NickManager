from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import psycopg

from backend.database import get_db
from backend.models import ConnectionProfile

router = APIRouter(prefix="/api/connections", tags=["connections"])

class ConnectionProfileCreate(BaseModel):
    name: str
    host: str
    port: int = 5432
    db_name: str
    user: str
    password: str

class ConnectionProfileResponse(ConnectionProfileCreate):
    id: int
    is_active: bool

    model_config = {"from_attributes": True}

@router.get("/", response_model=List[ConnectionProfileResponse])
def get_connections(db: Session = Depends(get_db)):
    return db.query(ConnectionProfile).all()

@router.post("/", response_model=ConnectionProfileResponse)
def create_connection(profile: ConnectionProfileCreate, db: Session = Depends(get_db)):
    db_profile = ConnectionProfile(**profile.model_dump())
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile

@router.post("/{profile_id}/activate")
def activate_connection(profile_id: int, db: Session = Depends(get_db)):
    # Deactivate all
    db.query(ConnectionProfile).update({"is_active": False})
    
    # Activate selected
    profile = db.query(ConnectionProfile).filter(ConnectionProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    profile.is_active = True
    db.commit()
    return {"message": f"Activated {profile.name}"}

@router.post("/test")
def test_connection(profile: ConnectionProfileCreate):
    conn_string = f"postgresql://{profile.user}:{profile.password}@{profile.host}:{profile.port}/{profile.db_name}"
    try:
        with psycopg.connect(conn_string) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return {"success": True, "message": "Connection successful"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.delete("/{profile_id}")
def delete_connection(profile_id: int, db: Session = Depends(get_db)):
    profile = db.query(ConnectionProfile).filter(ConnectionProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(profile)
    db.commit()
    return {"message": "Deleted successfully"}
