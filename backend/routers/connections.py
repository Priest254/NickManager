import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import psycopg

from backend.database import get_db
from backend.credentials import delete_profile_password, store_profile_password
from backend.models import ConnectionProfile

router = APIRouter(prefix="/api/connections", tags=["connections"])
logger = logging.getLogger(__name__)

class ConnectionProfileResponse(BaseModel):
    id: int
    name: str
    host: str
    port: int
    db_name: str
    user: str
    is_active: bool

    model_config = {"from_attributes": True}

class ConnectionProfileCreate(BaseModel):
    name: str
    host: str
    port: int = 5432
    db_name: str
    user: str
    password: str

@router.get("/", response_model=List[ConnectionProfileResponse])
def get_connections(db: Session = Depends(get_db)):
    return db.query(ConnectionProfile).all()

@router.post("/", response_model=ConnectionProfileResponse)
def create_connection(profile: ConnectionProfileCreate, db: Session = Depends(get_db)):
    db_profile = ConnectionProfile(**profile.model_dump(exclude={"password"}), password="")
    db.add(db_profile)
    db.flush()
    try:
        store_profile_password(db_profile.id, profile.password)
    except Exception:
        db.rollback()
        logger.exception("Could not store a connection password")
        raise HTTPException(
            status_code=503,
            detail="Could not save the connection password in the operating-system credential store.",
        )
    try:
        db.commit()
    except Exception:
        db.rollback()
        try:
            delete_profile_password(db_profile.id)
        except Exception:
            logger.exception("Could not remove an orphaned connection password after the profile save failed")
        raise
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
    try:
        with psycopg.connect(
            host=profile.host,
            port=profile.port,
            dbname=profile.db_name,
            user=profile.user,
            password=profile.password,
            connect_timeout=5,
        ) as conn:
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
    delete_profile_password(profile_id)
    return {"message": "Deleted successfully"}
