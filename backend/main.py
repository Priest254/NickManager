from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from backend.app_paths import resource_dir
from backend.credentials import migrate_legacy_passwords
from backend.routers import connections, browser, crud, shapefile, spatial, backup
from backend.database import Base, SessionLocal, engine

# Create tables
Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    migrate_legacy_passwords(db)

app = FastAPI(title="PostGIS Manager")

frontend_dir = resource_dir() / "frontend"
app.mount("/static", StaticFiles(directory=frontend_dir / "static"), name="static")

templates = Jinja2Templates(directory=frontend_dir / "templates")

# Include routers
app.include_router(connections.router)
app.include_router(browser.router)
app.include_router(crud.router)
app.include_router(shapefile.router)
app.include_router(spatial.router)
app.include_router(backup.router)

@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")
