import os
import subprocess
import tempfile
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from ..database import get_db
from .browser import get_active_connection

router = APIRouter(prefix="/api/backup", tags=["backup"])

@router.get("/export")
def export_database(db: Session = Depends(get_db)):
    profile = get_active_connection(db)
    
    # We will run pg_dump with custom format
    cmd = [
        "pg_dump",
        "-h", profile.host,
        "-p", str(profile.port),
        "-U", profile.user,
        "-Fc",  # custom format
        profile.db_name
    ]
    
    env = os.environ.copy()
    env["PGPASSWORD"] = profile.password
    
    try:
        process = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        def iter_file():
            try:
                while True:
                    chunk = process.stdout.read(8192)
                    if not chunk:
                        break
                    yield chunk
            finally:
                process.stdout.close()
                process.wait()
                
        # Check that the process actually started and hasn't immediately failed
        import time
        time.sleep(0.2)
        if process.poll() is not None and process.returncode != 0:
            err = process.stderr.read().decode()
            raise HTTPException(status_code=500, detail=f"pg_dump failed: {err}")
                    
        response = StreamingResponse(iter_file(), media_type="application/octet-stream")
        response.headers["Content-Disposition"] = f"attachment; filename={profile.db_name}_backup.dump"
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start pg_dump: {str(e)}")

@router.post("/restore")
async def restore_database(
    file: UploadFile = File(...),
    clean: bool = Form(False),
    db: Session = Depends(get_db)
):
    profile = get_active_connection(db)
    
    # Use a temporary file to save the uploaded dump
    with tempfile.NamedTemporaryFile(delete=False, suffix=".dump") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
        
    try:
        cmd = [
            "pg_restore",
            "-h", profile.host,
            "-p", str(profile.port),
            "-U", profile.user,
            "-d", profile.db_name,
            "--no-owner",  # good practice for restorations
            "--no-privileges"
        ]
        
        if clean:
            cmd.append("--clean")
            
        cmd.append(tmp_path)
        
        env = os.environ.copy()
        env["PGPASSWORD"] = profile.password
        
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"pg_restore failed: {result.stderr}")
            
        return {"success": True, "message": "Database restored successfully"}
        
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
