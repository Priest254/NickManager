from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from backend.routers import connections, browser, crud, shapefile, spatial, backup
from backend.database import Base, engine

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PostGIS Manager")

# Mount static files
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

templates = Jinja2Templates(directory="frontend/templates")

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
